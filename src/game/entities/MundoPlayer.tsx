import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef, useState } from "react";
import type { Group } from "three";
import { useAssetStore } from "@/stores/assetStore";
import { AnimatedModel } from "@/game/animation/AnimatedModel";
import { inputState } from "@/game/input/useInput";
import { aimGroundPoint } from "@/game/input/aimRaycaster";
import { playerEntity, playerControlState, useAimStore } from "@/stores/entityStore";
import { useCleaverStore } from "@/stores/cleaverStore";
import { useFlashStore } from "@/stores/flashStore";
import { selectedChromaTexturePath, useChromaStore } from "@/stores/chromaStore";
import { maybePlayMundoMoveQuote } from "@/game/audio/mundoAudio";
import type { ActionKey } from "@/game/animation/clipMatcher";
import type { Vec3 } from "@/types/game";
import {
  DODGEBALL_ARENA_RADIUS,
  DODGEBALL_PLAYER_SPEED,
  DODGEBALL_IDLE2_MIN_MS,
  DODGEBALL_IDLE2_MAX_MS,
} from "@/game/config/dodgeball.config";

const STOP_DISTANCE = 0.1;
const MOVE_TURN_RATE = 52; // rad/s; quick visual facing without a one-frame snap
const Q_FACE_HOLD_MS = 120; // brief but visible throw-facing cue while moving
const Q_FACE_MOVE_SPEED_MULTIPLIER = 0.7;
const BOUNDARY_PADDING = 0.2; // keep the model's feet a bit inside the visible ring
// Animation hysteresis: only switch to 'idle' after this many ms of being stationary.
// Stops the move/idle flicker when clicking destinations close together.
const IDLE_DEBOUNCE_MS = 140;

/** Click-to-move Mundo player, clamped to a circular arena. Plays idle2 randomly between actions. */
export function MundoPlayer() {
  const ref = useRef<Group>(null);
  const { camera } = useThree();
  const mundoCfg = useAssetStore((s) => s.registry.mundoPlayerModel);
  const setAim = useAimStore((s) => s.setAim);
  const chromaId = useChromaStore((s) => s.selectedId);

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

  // Attack phase machine — drives the attack → attackToIdle/attackIntoRun → normal chain.
  // Phases now advance on the mixer's "finished" event (via onActionFinished), so the timing
  // matches the actual clip length — no freezes, no early cuts.
  const [attackPhase, setAttackPhase] = useState<"none" | "attack" | "attackToIdle" | "attackIntoRun">("none");
  const attackPhaseRef = useRef<"none" | "attack" | "attackToIdle" | "attackIntoRun">("none");
  attackPhaseRef.current = attackPhase;
  // Tracks accepted Q casts so attack/facing effects fire exactly once.
  const lastCastSerialRef = useRef(0);
  const lastFlashSerialRef = useRef(0);
  const forcedFacingAngleRef = useRef(0);
  const forcedFacingUntilRef = useRef(0);
  const qMoveSlowUntilRef = useRef(0);

  useEffect(() => {
    // Reset state when this component mounts (e.g. switching trainers)
    positionRef.current = [0, 0, 0];
    rotationYRef.current = 0;
    hasDestinationRef.current = false;
    forcedFacingAngleRef.current = 0;
    forcedFacingUntilRef.current = 0;
    qMoveSlowUntilRef.current = 0;
    lastCastSerialRef.current = 0;
    idleStartedAtRef.current = performance.now();
    nextIdle2AtRef.current = scheduleNextIdle2(performance.now());
    playerEntity.position = [0, 0, 0];
    playerEntity.velocity = [0, 0, 0];
    playerEntity.rotationY = 0;
  }, []);

  useFrame((_, dt) => {
    const now = performance.now();

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
        const movingCast = hasDestinationRef.current;
        const nextPhase = movingCast ? "attackIntoRun" : "attack";
        attackPhaseRef.current = nextPhase;
        setAttackPhase(nextPhase);
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

    // Attack phase overrides any other animation choice.
    const phase = attackPhaseRef.current;

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
        attackPhaseRef.current = "attackIntoRun";
        setAttackPhase("attackIntoRun");
        setActionToken((t) => t + 1);
      } else {
        attackPhaseRef.current = "attackToIdle";
        setAttackPhase("attackToIdle");
        setActionToken((t) => t + 1);
      }
    } else if (finished === "attackToIdle" || finished === "attackIntoRun") {
      attackPhaseRef.current = "none";
      setAttackPhase("none");
    }
  };

  return (
    <group ref={ref}>
      <AnimatedModel
        config={mundoCfg}
        action={action}
        fallbackColor="#9ec97a"
        materialTexturePath={selectedChromaTexturePath(chromaId, "mundo")}
        actionToken={actionToken}
        onActionFinished={handleActionFinished}
      />
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

