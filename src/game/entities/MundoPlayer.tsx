import { useFrame, useThree } from "@react-three/fiber";
import { Suspense, useEffect, useRef, useState } from "react";
import type { Group } from "three";
import { useAssetStore } from "@/stores/assetStore";
import { AnimatedModel } from "@/game/animation/AnimatedModel";
import { inputState } from "@/game/input/useInput";
import { aimGroundPoint } from "@/game/input/aimRaycaster";
import { playerEntity, playerControlState, useAimStore } from "@/stores/entityStore";
import { useCleaverStore } from "@/stores/cleaverStore";
import { useFlashStore } from "@/stores/flashStore";
import { selectedChromaTexturePath, useChromaStore } from "@/stores/chromaStore";
import { maybePlayMundoMoveQuote, playMundoDeath, playDanceSound, stopDanceSound } from "@/game/audio/mundoAudio";
import { useTrainerStore } from "@/stores/trainerStore";
import { usePvpStore } from "@/stores/pvpStore";
import { spawnForRole, WALL_THICKNESS } from "@/game/entities/PvpWall";
import { SlowGlow } from "@/game/entities/SlowGlow";
import { YoumuuPetals } from "@/game/entities/YoumuuPetals";
import { danceControl, requestDance } from "@/game/entities/danceControl";
import { send } from "@/game/network/peerNetwork";
import type { ActionKey } from "@/game/animation/clipMatcher";
import type { Vec3 } from "@/types/game";
import {
  DODGEBALL_ARENA_RADIUS,
  DODGEBALL_PLAYER_SPEED,
  DODGEBALL_IDLE2_MIN_MS,
  DODGEBALL_IDLE2_MAX_MS,
} from "@/game/config/dodgeball.config";

const STOP_DISTANCE = 0.1;
/** Mundo's body half-width for collision against the wall. */
const PLAYER_BODY_RADIUS = 0.45;
const MOVE_TURN_RATE = 52; // rad/s; quick visual facing without a one-frame snap
const Q_FACE_HOLD_MS = 120; // brief but visible throw-facing cue while moving
const Q_FACE_MOVE_SPEED_MULTIPLIER = 0.7;
const BOUNDARY_PADDING = 0.2; // keep the model's feet a bit inside the visible ring
// Animation hysteresis: only switch to 'idle' after this many ms of being stationary.
// Stops the move/idle flicker when clicking destinations close together.
const IDLE_DEBOUNCE_MS = 140;

type AttackPhase = "none" | "attack" | "attackToIdle" | "attackIntoRun";

/** Click-to-move Mundo player, clamped to a circular arena. Plays idle2 randomly between actions. */
export function MundoPlayer() {
  const ref = useRef<Group>(null);
  const { camera } = useThree();
  const mundoCfg = useAssetStore((s) => s.registry.mundoPlayerModel);
  const setAim = useAimStore((s) => s.setAim);
  const chromaId = useChromaStore((s) => s.selectedId);
  const trainer = useTrainerStore((s) => s.trainer);
  const pvpRole = usePvpStore((s) => s.role);
  const pvpPhase = usePvpStore((s) => s.phase);
  const pvpRound = usePvpStore((s) => s.round);
  const hostSkin = usePvpStore((s) => s.hostSkin);
  const clientSkin = usePvpStore((s) => s.clientSkin);
  const localSkinId =
    trainer === "pvp"
      ? pvpRole === "client"
        ? clientSkin
        : hostSkin
      : chromaId;

  const [action, setAction] = useState<ActionKey>("idle");
  const [actionToken, setActionToken] = useState(0);

  const positionRef = useRef<Vec3>([0, 0, 0]);
  const rotationYRef = useRef(0);
  const destinationRef = useRef<Vec3>([0, 0, 0]);
  const hasDestinationRef = useRef(false);
  const rightWasDownRef = useRef(false);
  // Last time the player was actually moving — used to debounce the idle animation transition.
  const lastMovingAtRef = useRef(0);

  const idleStartedAtRef = useRef(performance.now());
  const nextIdle2AtRef = useRef(scheduleNextIdle2(performance.now()));
  const idle2PlayingRef = useRef(false);
  const idle2EndsAtRef = useRef(0);

  // Attack phase machine. Running casts use attackIntoRun only while Mundo is
  // actually moving; if movement stops mid-cast, recovery pivots to attackToIdle.
  const [attackPhase, setAttackPhase] = useState<AttackPhase>("none");
  const attackPhaseRef = useRef<AttackPhase>("none");
  attackPhaseRef.current = attackPhase;
  // Tracks accepted Q casts so attack/facing effects fire exactly once.
  const lastCastSerialRef = useRef(0);
  const lastFlashSerialRef = useRef(0);
  // Latches once when the local champion dies so the death one-shot + sound fire
  // exactly once; cleared on a rematch when HP is restored.
  const deadRef = useRef(false);
  const forcedFacingAngleRef = useRef(0);
  const forcedFacingUntilRef = useRef(0);
  const qMoveSlowUntilRef = useRef(0);
  // Ctrl+3 dance emote. Spammable: each press restarts the clip + music; moving
  // (or pressing again) stops the current music instance.
  const dancingRef = useRef(false);
  const danceSerialRef = useRef(0);
  const danceAppliedSerialRef = useRef(0);
  const danceTriggerAppliedRef = useRef(0);

  const setAttackPhaseNow = (next: AttackPhase) => {
    attackPhaseRef.current = next;
    setAttackPhase((prev) => (prev === next ? prev : next));
  };

  // Ctrl+3 → dance emote (spammable). The actual start happens in useFrame via
  // danceControl, so the round-win auto-dance shares the exact same path.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "Digit3" || !e.ctrlKey || e.repeat) return;
      e.preventDefault();
      if (deadRef.current) return;
      // In PvP, manual dance only while the round is live (movement locked otherwise).
      if (useTrainerStore.getState().trainer === "pvp" && usePvpStore.getState().phase !== "playing") return;
      requestDance();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      stopDanceSound();
    };
  }, []);

  useEffect(() => {
    // Reset state when this component mounts (e.g. switching trainers).
    // In PvP, snap to the role's spawn point instead of world origin.
    let initialPos: Vec3 = [0, 0, 0];
    let initialFacing = 0;
    const trainer = useTrainerStore.getState().trainer;
    if (trainer === "pvp") {
      const pvp = usePvpStore.getState();
      if (pvp.role === "host" || pvp.role === "client") {
        initialPos = spawnForRole(pvp.role, pvp.settings.wallOrientation, pvp.sidesSwapped);
        // Face toward the arena center (the wall) so casts naturally aim at the enemy side.
        initialFacing = Math.atan2(-initialPos[0], -initialPos[2]);
      }
    }
    positionRef.current = initialPos;
    rotationYRef.current = initialFacing;
    hasDestinationRef.current = false;
    forcedFacingAngleRef.current = 0;
    forcedFacingUntilRef.current = 0;
    qMoveSlowUntilRef.current = 0;
    lastCastSerialRef.current = 0;
    idleStartedAtRef.current = performance.now();
    nextIdle2AtRef.current = scheduleNextIdle2(performance.now());
    playerEntity.position = initialPos;
    playerEntity.velocity = [0, 0, 0];
    playerEntity.rotationY = initialFacing;
  }, []);

  // PvP: snap back to our spawn (and clear the death latch) at the start of each
  // round, when the pre-round countdown begins.
  useEffect(() => {
    if (trainer !== "pvp" || pvpPhase !== "countdown") return;
    const pvp = usePvpStore.getState();
    if (pvp.role !== "host" && pvp.role !== "client") return;
    const spawn = spawnForRole(pvp.role, pvp.settings.wallOrientation, pvp.sidesSwapped);
    const facing = Math.atan2(-spawn[0], -spawn[2]);
    positionRef.current = spawn;
    rotationYRef.current = facing;
    hasDestinationRef.current = false;
    deadRef.current = false;
    dancingRef.current = false;
    stopDanceSound();
    setAttackPhaseNow("none");
    setAction("idle");
    playerEntity.position = spawn;
    playerEntity.velocity = [0, 0, 0];
    playerEntity.rotationY = facing;
    if (ref.current) {
      ref.current.position.set(spawn[0], 0, spawn[2]);
      ref.current.rotation.y = facing;
    }
  }, [trainer, pvpPhase, pvpRound]);

  useFrame((_, dt) => {
    const now = performance.now();

    // Dance request (Ctrl+3 or a round win). Acts like "stop": clears any move
    // destination so Mundo halts and dances. Restarts the clip + music each time.
    if (danceControl.serial !== danceTriggerAppliedRef.current) {
      danceTriggerAppliedRef.current = danceControl.serial;
      if (!deadRef.current) {
        hasDestinationRef.current = false;
        lastMovingAtRef.current = 0;
        dancingRef.current = true;
        danceSerialRef.current += 1;
        void playDanceSound();
        // Let the opponent see (and hear) us dance.
        if (useTrainerStore.getState().trainer === "pvp") send({ type: "dance" });
      }
    }

    // Death (PvP only): when our HP hits 0, play the death one-shot + sound once
    // and freeze — no movement, casting, or facing updates while dead. Cleared
    // automatically on a rematch when HP is restored.
    if (useTrainerStore.getState().trainer === "pvp") {
      const pvp = usePvpStore.getState();
      const myRole = pvp.role === "client" ? "client" : "host";
      const myHp = pvp.hp[myRole];
      if (deadRef.current && myHp > 0) {
        deadRef.current = false;
      } else if (!deadRef.current && myHp <= 0) {
        deadRef.current = true;
        dancingRef.current = false;
        stopDanceSound();
        playerEntity.velocity = [0, 0, 0];
        hasDestinationRef.current = false;
        setAction("death");
        setActionToken((t) => t + 1);
        playMundoDeath(playerEntity.position);
      }
      if (deadRef.current) return;

      // Freeze movement between rounds: during countdown / shop the champion
      // holds at spawn. The round winner can still dance here (auto or Ctrl+3).
      if (pvp.phase !== "playing") {
        hasDestinationRef.current = false;
        playerEntity.velocity = [0, 0, 0];
        if (ref.current) {
          ref.current.position.set(positionRef.current[0], 0, positionRef.current[2]);
          ref.current.rotation.y = rotationYRef.current;
        }
        if (dancingRef.current && danceSerialRef.current !== danceAppliedSerialRef.current) {
          danceAppliedSerialRef.current = danceSerialRef.current;
          setActionToken((t) => t + 1);
        }
        const want: ActionKey = dancingRef.current ? "dance" : "idle";
        setAction((prev) => (prev === want ? prev : want));
        return;
      }
    }

    // Detect a new Flash: snap the internal position to the teleport destination
    // and cancel any in-flight move command so Mundo doesn't walk back to the old
    // destination from his new spot.
    const flashState = useFlashStore.getState();
    if (flashState.castSerial !== lastFlashSerialRef.current) {
      positionRef.current = [flashState.lastDestination[0], 0, flashState.lastDestination[2]];
      hasDestinationRef.current = false;
      lastMovingAtRef.current = 0;
      lastFlashSerialRef.current = flashState.castSerial;
    }

    const [px, , pz] = positionRef.current;

    const aim = aimGroundPoint(camera, inputState.mouseNDC.x, inputState.mouseNDC.y);
    if (aim) setAim(aim);
    const rightDown = inputState.mouseDown.right;
    const rightPressed = rightDown && !rightWasDownRef.current;
    rightWasDownRef.current = rightDown;
    // While right-click is held, continuously track the cursor — same as League's
    // hold-to-move. Updating only on press / at a low Hz makes Mundo run-stop-run-stop
    // between retargets, which feels "clicky".
    if (aim && rightDown) {
      const clamped = clampToCircle(aim[0], aim[2], DODGEBALL_ARENA_RADIUS - BOUNDARY_PADDING);
      destinationRef.current = [clamped[0], 0, clamped[1]];
      hasDestinationRef.current = Math.hypot(clamped[0] - px, clamped[1] - pz) > STOP_DISTANCE;
      if (rightPressed && hasDestinationRef.current) {
        maybePlayMundoMoveQuote(playerEntity.position, now);
      }
    }
    const stopPressed = !!inputState.keys["KeyS"];
    if (stopPressed) {
      hasDestinationRef.current = false;
      lastMovingAtRef.current = 0;
    }

    // Detect new Q cast: kick off the attack phase machine.
    // (Body rotation follows movement — locking it to throw direction while moving causes moonwalk.
    // The cleaver itself still flies in the click direction; only the visual facing is decoupled.)
    const cleaverState = useCleaverStore.getState();
    if (cleaverState.castSerial !== lastCastSerialRef.current) {
      if (cleaverState.castingUntil > 0 && cleaverState.castingUntil > now) {
        // Casting cancels a dance.
        if (dancingRef.current) {
          dancingRef.current = false;
          stopDanceSound();
        }
        const movingCast = hasDestinationRef.current;
        const nextPhase = movingCast ? "attackIntoRun" : "attack";
        setAttackPhaseNow(nextPhase);
        forcedFacingAngleRef.current = cleaverState.castFaceAngle;
        forcedFacingUntilRef.current = movingCast ? now + Q_FACE_HOLD_MS : cleaverState.castingUntil + 100;
        qMoveSlowUntilRef.current = movingCast ? now + Q_FACE_HOLD_MS : 0;
        rotationYRef.current = cleaverState.castFaceAngle;
      }
      lastCastSerialRef.current = cleaverState.castSerial;
    }

    // Mundo can move freely while throwing — no movement lock during any attack phase.
    // The cleaver's flight direction is captured at Q press time, so movement after the throw
    // won't redirect the projectile.

    // Keep movement responsive like click-to-move League pathing, but smooth the visible
    // facing so repeated clicks do not hard-snap Mundo's body direction.
    let mx = 0;
    let mz = 0;
    let moveFacingAngle = rotationYRef.current;
    if (hasDestinationRef.current) {
      const dest = destinationRef.current;
      const dx = dest[0] - px;
      const dz = dest[2] - pz;
      const dist = Math.hypot(dx, dz);
      if (dist <= STOP_DISTANCE) {
        hasDestinationRef.current = false;
      } else {
        mx = dx / dist;
        mz = dz / dist;
        moveFacingAngle = Math.atan2(mx, mz);
      }
    }

    const speedMultiplier = now < qMoveSlowUntilRef.current ? Q_FACE_MOVE_SPEED_MULTIPLIER : 1;
    // PvP exposes a runtime move-speed knob via playerControlState. Default 1.
    const pvpMul = playerControlState.movementSpeedMultiplier;
    let vx = hasDestinationRef.current ? mx * DODGEBALL_PLAYER_SPEED * speedMultiplier * pvpMul : 0;
    let vz = hasDestinationRef.current ? mz * DODGEBALL_PLAYER_SPEED * speedMultiplier * pvpMul : 0;
    let moving = Math.hypot(vx, vz) > 0.03;
    let nx = px + vx * dt;
    let nz = pz + vz * dt;
    const clamped = clampToCircle(nx, nz, DODGEBALL_ARENA_RADIUS - BOUNDARY_PADDING);
    nx = clamped[0];
    nz = clamped[1];
    // PvP wall: clamp the player to their own half of the arena. The wall slab
    // is centered on the perpendicular axis (X for vertical wall, Z for
    // horizontal), so we only need a one-axis sign-aware barrier per role.
    if (useTrainerStore.getState().trainer === "pvp") {
      const pvp = usePvpStore.getState();
      const ownSpawn = spawnForRole(
        pvp.role === "client" ? "client" : "host",
        pvp.settings.wallOrientation,
        pvp.sidesSwapped,
      );
      const barrier = WALL_THICKNESS / 2 + PLAYER_BODY_RADIUS;
      if (pvp.settings.wallOrientation === "vertical") {
        // Wall along Z axis at X = 0. Stay on the same side as ownSpawn.
        if (ownSpawn[0] < 0) nx = Math.min(nx, -barrier);
        else nx = Math.max(nx, barrier);
      } else {
        if (ownSpawn[2] < 0) nz = Math.min(nz, -barrier);
        else nz = Math.max(nz, barrier);
      }
    }
    vx = dt > 0 ? (nx - px) / dt : 0;
    vz = dt > 0 ? (nz - pz) / dt : 0;
    moving = Math.hypot(vx, vz) > 0.03;

    if (hasDestinationRef.current && Math.hypot(destinationRef.current[0] - nx, destinationRef.current[2] - nz) <= STOP_DISTANCE) {
      const dest = destinationRef.current;
      nx = dest[0];
      nz = dest[2];
      vx = 0;
      vz = 0;
      moving = false;
      hasDestinationRef.current = false;
    }

    if (now < forcedFacingUntilRef.current) {
      rotationYRef.current = forcedFacingAngleRef.current;
    } else if (moving) {
      rotationYRef.current = rotateTowardAngle(rotationYRef.current, moveFacingAngle, MOVE_TURN_RATE * dt);
    }

    positionRef.current = [nx, 0, nz];
    playerEntity.position = [nx, 0, nz];
    playerEntity.velocity = [vx, 0, vz];
    playerEntity.rotationY = rotationYRef.current;

    if (ref.current) {
      ref.current.position.set(nx, 0, nz);
      ref.current.rotation.y = rotationYRef.current;
    }

    if (moving) lastMovingAtRef.current = now;
    // Debounced moving flag — treat as "still moving" briefly after stopping, so chained
    // clicks don't churn move/idle crossfades.
    const movingForAnim = !stopPressed && (moving || now - lastMovingAtRef.current < IDLE_DEBOUNCE_MS);

    // Moving (or pressing stop) cancels the dance emote and its music.
    if (dancingRef.current && (moving || hasDestinationRef.current || stopPressed)) {
      dancingRef.current = false;
      stopDanceSound();
    }

    // Attack phase overrides any other animation choice. The run-recovery clip
    // must not continue after real movement stops, or Mundo appears to moonwalk.
    const continuingMoveForAttack = !stopPressed && moving && hasDestinationRef.current;
    let phase = attackPhaseRef.current;
    if (phase === "attackIntoRun" && !continuingMoveForAttack) {
      phase = "attackToIdle";
      setAttackPhaseNow(phase);
    }

    // pick desired action — attack phases override; then moving; then idle/idle2.
    let desired: ActionKey = "idle";
    if (phase === "attack") {
      desired = "attack";
      idle2PlayingRef.current = false;
      idleStartedAtRef.current = now;
      nextIdle2AtRef.current = scheduleNextIdle2(now);
    } else if (phase === "attackToIdle") {
      desired = "attackToIdle";
      idle2PlayingRef.current = false;
      idleStartedAtRef.current = now;
      nextIdle2AtRef.current = scheduleNextIdle2(now);
    } else if (phase === "attackIntoRun") {
      desired = "attackIntoRun";
      idle2PlayingRef.current = false;
      idleStartedAtRef.current = now;
      nextIdle2AtRef.current = scheduleNextIdle2(now);
    } else if (dancingRef.current) {
      desired = "dance";
      idle2PlayingRef.current = false;
      idleStartedAtRef.current = now;
      nextIdle2AtRef.current = scheduleNextIdle2(now);
    } else if (movingForAnim) {
      desired = "move";
      idle2PlayingRef.current = false;
      idleStartedAtRef.current = now;
      nextIdle2AtRef.current = scheduleNextIdle2(now);
    } else {
      if (idle2PlayingRef.current) {
        if (now >= idle2EndsAtRef.current) {
          idle2PlayingRef.current = false;
          idleStartedAtRef.current = now;
          nextIdle2AtRef.current = scheduleNextIdle2(now);
          desired = "idle";
        } else {
          desired = "idle2";
        }
      } else if (now >= nextIdle2AtRef.current) {
        idle2PlayingRef.current = true;
        idle2EndsAtRef.current = now + 3000; // assume idle2 clip ~3s; clipped naturally by mixer too
        desired = "idle2";
      } else {
        desired = "idle";
      }
    }

    // Each Ctrl+3 press restarts the dance clip, even if already dancing.
    if (desired === "dance" && danceSerialRef.current !== danceAppliedSerialRef.current) {
      danceAppliedSerialRef.current = danceSerialRef.current;
      setActionToken((t) => t + 1);
    }

    setAction((prev) => {
      if (prev === desired) return prev;
      // Bump the action token whenever a one-shot starts so AnimatedModel restarts it.
      if (
        desired === "idle2" ||
        desired === "attack" ||
        desired === "attackToIdle" ||
        desired === "attackIntoRun"
      ) {
        setActionToken((t) => t + 1);
      }
      return desired;
    });
  });

  const handleActionFinished = (finished: ActionKey) => {
    if (finished === "attack") {
      // Choose transition based on whether the player has a pending destination.
      if (hasDestinationRef.current) {
        setAttackPhaseNow("attackIntoRun");
      } else {
        setAttackPhaseNow("attackToIdle");
      }
    } else if (finished === "attackToIdle" || finished === "attackIntoRun") {
      setAttackPhaseNow("none");
    } else if (finished === "dance") {
      dancingRef.current = false;
    }
  };

  return (
    <group ref={ref}>
      <AnimatedModel
        config={mundoCfg}
        action={action}
        fallbackColor="#9ec97a"
        materialTexturePath={selectedChromaTexturePath(localSkinId, "mundo")}
        actionToken={actionToken}
        onActionFinished={handleActionFinished}
      />
      {trainer === "pvp" && <SlowGlow active={() => performance.now() < playerEntity.slowedUntil} />}
      {trainer === "pvp" && (
        <Suspense fallback={null}>
          <YoumuuPetals />
        </Suspense>
      )}
    </group>
  );
}

function clampToCircle(x: number, z: number, radius: number): [number, number] {
  const r = Math.hypot(x, z);
  if (r <= radius) return [x, z];
  const s = radius / r;
  return [x * s, z * s];
}

function rotateTowardAngle(current: number, target: number, maxStep: number) {
  const delta = Math.atan2(Math.sin(target - current), Math.cos(target - current));
  if (Math.abs(delta) <= maxStep) return target;
  return current + Math.sign(delta) * maxStep;
}

function scheduleNextIdle2(now: number) {
  const span = DODGEBALL_IDLE2_MAX_MS - DODGEBALL_IDLE2_MIN_MS;
  return now + DODGEBALL_IDLE2_MIN_MS + Math.random() * span;
}
