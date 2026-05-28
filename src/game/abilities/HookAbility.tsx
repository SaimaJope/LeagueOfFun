import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { Box3, Group, Mesh, MeshStandardMaterial, Quaternion, Vector3 } from "three";
import { clone as cloneSkeleton } from "three/examples/jsm/utils/SkeletonUtils.js";
import { useGameStore, type HookCastInfo } from "@/stores/gameStore";
import { useAssetStore } from "@/stores/assetStore";
import { useChromaStore, selectedChromaHookGlow } from "@/stores/chromaStore";
import { useModel } from "@/game/assets/modelLoader";
import {
  getActiveDummies,
  playerControlState,
  playerEntity,
  useAimStore,
  type MutableEntity,
} from "@/stores/entityStore";
import { inputState } from "@/game/input/useInput";
import { add, dirXZ, distancePointToSegmentXZ, distXZ } from "@/game/abilities/hookMath";
import { aiBus } from "@/stores/aiBus";
import { PLAY_AREA_BOUND, leagueUnits } from "@/game/config/playArea.config";
import { playThreshQCast, playThreshQHit, playThreshQPull } from "@/game/audio/threshAudio";
import { clearPlayerAnimationSequence, playPlayerAnimationSequence } from "@/game/animation/playerAnimationSequence";

const TARGET_GAMEPLAY_RADIUS = leagueUnits(65);
const HITBOX_SCALE = 0.7;
const DASH_STOP_DISTANCE = 0.9;
const HOOKED_SELF_SPEED_MULTIPLIER = 0.35;
const HOOKED_SELF_SLOW_DURATION_MS = 1500;
const PULL1_ANIMATION_MS = 570;
const PULL2_ANIMATION_MS = 970;
const DASH_CLIP_MS = 2000;
const DASH_ANIMATION_MIN_MS = 450;
const DASH_ANIMATION_MAX_MS = 900;

/**
 * Hook ability: handles Q press, cast windup, projectile travel, hit/miss detection.
 *
 * Visuals:
 *  - range circle under the player (while idle)
 *  - aim line from player to ground aim point
 *  - cast windup tint (the line goes yellow)
 *  - traveling projectile (sphere) + trail
 *  - post-cast line that lingers briefly
 */
export function HookAbility() {
  const hookCfg = useGameStore((s) => s.hookConfig);
  const hook = useGameStore((s) => s.hook);
  const sensor = useGameStore((s) => s.hookSensor);
  const startCast = useGameStore((s) => s.startCast);
  const launchHook = useGameStore((s) => s.launchHook);
  const endHook = useGameStore((s) => s.endHook);
  const resetDrill = useGameStore((s) => s.resetDrill);

  const writeSensor = (phase: "idle" | "windup" | "flight", castStartedAt: number | null, origin: [number, number, number], dir: [number, number, number]) => {
    sensor.phase = phase;
    sensor.castStartedAt = castStartedAt;
    sensor.castDelayMs = hookCfg.castDelayMs;
    sensor.origin = origin;
    sensor.direction = dir;
    sensor.speed = hookCfg.speed;
    sensor.range = hookCfg.range;
    sensor.width = hookCfg.width;
  };

  const aim = useAimStore((s) => s.aim);

  const projectileRef = useRef<Group>(null);
  const chainRef = useRef<Group>(null);
  const aimLineRef = useRef<Mesh>(null);
  const rangeRingRef = useRef<Mesh>(null);

  // Track travel state in a ref (avoid re-renders).
  const travel = useRef<{
    origin: [number, number, number];
    dir: [number, number, number];
    distance: number;
    startTime: number;
    castStartTime: number;
    dummyAtCast: [number, number, number];
    dummyPositionsAtCast: [number, number, number][];
    width: number;
    speed: number;
    range: number;
    castDelayMs: number;
    phase: "windup" | "flight" | "idle";
  }>({
    origin: [0, 0, 0],
    dir: [1, 0, 0],
    distance: 0,
    startTime: 0,
    castStartTime: 0,
    dummyAtCast: [0, 0, 0],
    dummyPositionsAtCast: [],
    width: 0.5,
    speed: 18,
    range: 11,
    castDelayMs: 380,
    phase: "idle",
  });

  // Post-cast line state (for the brief "where did the hook go" indicator).
  const postCast = useRef<{ until: number; from: [number, number, number]; to: [number, number, number] } | null>(null);
  const queuedTugs = useRef<Array<{ at: number; distance: number; target: MutableEntity }>>([]);
  const activeTug = useRef<{
    target: MutableEntity;
    from: [number, number, number];
    to: [number, number, number];
    start: number;
    duration: number;
  } | null>(null);
  const tether = useRef<{ target: MutableEntity; until: number; recastReadyAt: number } | null>(null);
  const activeDash = useRef<{ target: MutableEntity; until: number } | null>(null);
  const slowUntil = useRef<number | null>(null);
  // While attached, hook stays on the target and chain stays connected (through the pull animation).
  const attached = useRef<{ target: MutableEntity; until: number; flightDir: [number, number, number] } | null>(null);

  const updatePullTugs = (now: number) => {
    if (!hookCfg.pullTargetOnHit) {
      queuedTugs.current = [];
      activeTug.current = null;
      return;
    }

    if (!activeTug.current && queuedTugs.current.length > 0 && now >= queuedTugs.current[0].at) {
      const next = queuedTugs.current.shift()!;
      const from: [number, number, number] = [...next.target.position];
      const dx = playerEntity.position[0] - from[0];
      const dz = playerEntity.position[2] - from[2];
      const dist = Math.hypot(dx, dz);
      if (dist > 2) {
        const pull = Math.min(next.distance, dist - 2);
        activeTug.current = {
          target: next.target,
          from,
          to: [from[0] + (dx / dist) * pull, 0, from[2] + (dz / dist) * pull],
          start: now,
          duration: 180,
        };
      }
    }

    const tug = activeTug.current;
    if (!tug) return;
    const t = Math.min(1, (now - tug.start) / tug.duration);
    const eased = 1 - (1 - t) * (1 - t);
    tug.target.position = [
      tug.from[0] + (tug.to[0] - tug.from[0]) * eased,
      0,
      tug.from[2] + (tug.to[2] - tug.from[2]) * eased,
    ];
    if (t >= 1) activeTug.current = null;
  };

  const updateDash = (now: number, dt: number) => {
    const dash = activeDash.current;
    if (!dash) return;
    if (now > dash.until) {
      activeDash.current = null;
      playerControlState.dashActive = false;
      restorePlayerSpeed();
      playerEntity.velocity = [0, 0, 0];
      playerControlState.movementLockedUntil = now;
      return;
    }

    const dx = dash.target.position[0] - playerEntity.position[0];
    const dz = dash.target.position[2] - playerEntity.position[2];
    const dist = Math.hypot(dx, dz);
    if (dist <= DASH_STOP_DISTANCE) {
      activeDash.current = null;
      playerControlState.dashActive = false;
      restorePlayerSpeed();
      playerEntity.velocity = [0, 0, 0];
      playerControlState.movementLockedUntil = now;
      return;
    }

    const step = Math.min(hookCfg.recastDashSpeed * dt, dist - DASH_STOP_DISTANCE);
    const vx = (dx / dist) * hookCfg.recastDashSpeed;
    const vz = (dz / dist) * hookCfg.recastDashSpeed;
    playerEntity.position = [
      clamp(playerEntity.position[0] + (dx / dist) * step, -PLAY_AREA_BOUND, PLAY_AREA_BOUND),
      0,
      clamp(playerEntity.position[2] + (dz / dist) * step, -PLAY_AREA_BOUND, PLAY_AREA_BOUND),
    ];
    playerEntity.velocity = [vx, 0, vz];
    playerEntity.rotationY = Math.atan2(dx, dz);
    playerControlState.movementLockedUntil = now + 80;
  };

  const startDeathlyLeap = (now: number) => {
    const target = tether.current?.target;
    if (!target) return;
    queuedTugs.current = [];
    activeTug.current = null;
    tether.current = null;
    const dashAnimationMs = dashAnimationDurationToTarget(target, hookCfg.recastDashSpeed);
    const dashEnd = now + dashAnimationMs + 80;
    activeDash.current = { target, until: dashEnd };
    playerControlState.dashActive = true;
    slowUntil.current = null;
    // Keep hook + chain attached through the dash so they only disappear once it lands.
    if (attached.current) {
      attached.current.until = Math.max(attached.current.until, dashEnd);
    } else {
      attached.current = {
        target,
        until: dashEnd,
        flightDir: [
          target.position[0] - playerEntity.position[0],
          0,
          target.position[2] - playerEntity.position[2],
        ],
      };
    }
    restorePlayerSpeed();
    playPlayerAnimationSequence([{
      action: "dash",
      durationMs: dashAnimationMs,
      timeScale: DASH_CLIP_MS / dashAnimationMs,
    }]);
    playerControlState.cancelMoveToken += 1;
    playerControlState.movementLockedUntil = now + dashAnimationMs + 80;
    playThreshQPull(playerEntity.position);
  };

  // Key handler — Q to cast, R to reset.
  const qWasDown = useRef(false);
  const rWasDown = useRef(false);

  useFrame((_, dt) => {
    const now = performance.now();
    updatePullTugs(now);
    updateDash(now, dt);
    if (slowUntil.current !== null && now >= slowUntil.current) {
      slowUntil.current = null;
      restorePlayerSpeed();
    }
    // Drive hook + chain off the attached state (post-hit, during pull animation).
    if (attached.current) {
      if (now >= attached.current.until) {
        attached.current = null;
        if (projectileRef.current) projectileRef.current.visible = false;
        if (chainRef.current) chainRef.current.visible = false;
      } else {
        const tgt = attached.current.target;
        const dir = attached.current.flightDir;
        if (projectileRef.current) {
          projectileRef.current.position.set(tgt.position[0], 1.0, tgt.position[2]);
          projectileRef.current.rotation.y = Math.atan2(dir[0], dir[2]);
          projectileRef.current.visible = true;
        }
        const tipPos: [number, number, number] = [tgt.position[0], 1.0, tgt.position[2]];
        updateChain(chainRef, pullHandAnchor(playerEntity.position, tipPos), tipPos);
      }
    }
    if (tether.current && now > tether.current.until) {
      tether.current = null;
      clearPlayerAnimationSequence();
      restorePlayerSpeed();
    }
    const qDown = !!inputState.keys["KeyQ"];
    const rDown = !!inputState.keys["KeyR"];

    if (rDown && !rWasDown.current) {
      resetDrill();
      travel.current.phase = "idle";
      postCast.current = null;
      queuedTugs.current = [];
      activeTug.current = null;
      tether.current = null;
      activeDash.current = null;
      playerControlState.dashActive = false;
      slowUntil.current = null;
      attached.current = null;
      if (projectileRef.current) projectileRef.current.visible = false;
      if (chainRef.current) chainRef.current.visible = false;
      clearPlayerAnimationSequence();
      restorePlayerSpeed();
      playerControlState.cancelMoveToken += 1;
    }
    rWasDown.current = rDown;

    // Cast trigger
    const modeFinished = useGameStore.getState().gameMode.finished;
    const canCast = !modeFinished && travel.current.phase === "idle" && now >= hook.cooldownUntil;
    const canRecast = tether.current && now >= tether.current.recastReadyAt && now <= tether.current.until;
    if (qDown && !qWasDown.current && canRecast) {
      startDeathlyLeap(now);
      qWasDown.current = qDown;
      return;
    }

    if (qDown && !qWasDown.current && canCast) {
      const origin: [number, number, number] = [...playerEntity.position];
      const d = dirXZ(origin, aim);
      const info: HookCastInfo = {
        origin,
        direction: d,
        startedAt: now,
        castDelayMs: hookCfg.castDelayMs,
        speed: hookCfg.speed,
        width: hookCfg.width,
        range: hookCfg.range,
      };
      travel.current.origin = origin;
      travel.current.dir = d;
      travel.current.distance = 0;
      travel.current.castStartTime = now;
      travel.current.dummyPositionsAtCast = getActiveDummies().map((dummy) => [...dummy.position]);
      travel.current.dummyAtCast = travel.current.dummyPositionsAtCast[0] ?? [0, 0, 0];
      travel.current.width = hookCfg.width;
      travel.current.speed = hookCfg.speed;
      travel.current.range = hookCfg.range;
      travel.current.castDelayMs = hookCfg.castDelayMs;
      travel.current.phase = "windup";
      playerControlState.cancelMoveToken += 1;
      clearPlayerAnimationSequence();
      restorePlayerSpeed();
      playerControlState.movementLockedUntil = now + hookCfg.castDelayMs;
      playThreshQCast(origin);
      startCast(info);
      writeSensor("windup", now, origin, d);
    }
    qWasDown.current = qDown;

    // State machine
    const t = travel.current;
    if (t.phase === "windup") {
      if (now - t.castStartTime >= t.castDelayMs) {
        t.phase = "flight";
        t.startTime = now;
        playerEntity.rotationY = Math.atan2(t.dir[0], t.dir[2]);
        launchHook();
        writeSensor("flight", t.castStartTime, t.origin, t.dir);
      }
    }

    if (t.phase === "flight") {
      t.distance += t.speed * dt;
      const pos = add(t.origin, t.dir, t.distance);
      pos[1] = 1.0;

      const segA = t.origin;
      const segB = add(t.origin, t.dir, t.distance);
      const hitRadius = (t.width + TARGET_GAMEPLAY_RADIUS) * HITBOX_SCALE;
      const hit = findHitDummy(segA, segB, pos, hitRadius, t.dir);

      if (projectileRef.current) {
        projectileRef.current.position.set(pos[0], pos[1], pos[2]);
        projectileRef.current.rotation.y = Math.atan2(t.dir[0], t.dir[2]);
        projectileRef.current.visible = true;
      }
      updateChain(chainRef, handAnchor(playerEntity.position, pos), pos);

      if (hit) {
        const target = hit.dummy;
        const final: [number, number, number] = [...target.position];
        playThreshQHit(target.position);
        playPlayerAnimationSequence([
          { action: "pull1", durationMs: PULL1_ANIMATION_MS },
          { action: "pull2", durationMs: PULL2_ANIMATION_MS },
        ]);
        playerControlState.faceTarget = target;
        applyHookedSelfSlow();
        slowUntil.current = now + HOOKED_SELF_SLOW_DURATION_MS;
        attached.current = {
          target,
          until: now + PULL1_ANIMATION_MS + PULL2_ANIMATION_MS,
          flightDir: [t.dir[0], t.dir[1], t.dir[2]],
        };
        target.alive = false;
        target.hitSerial += 1;
        if (hookCfg.pullTargetOnHit) {
          queuedTugs.current = [
            { at: now + 120, distance: 0.7, target },
            { at: now + 520, distance: 0.7, target },
          ];
          activeTug.current = null;
        }
        tether.current = {
          target,
          until: now + hookCfg.recastWindowMs,
          recastReadyAt: now + hookCfg.recastDelayMs,
        };
        playerControlState.movementLockedUntil = Math.max(playerControlState.movementLockedUntil, now + 120);
        const correctAim: [number, number, number] = [
          target.position[0],
          0,
          target.position[2],
        ];
        const missDistance = 0;
        postCast.current = { until: now + 700, from: t.origin, to: pos };
        endHook("hit", {
          result: "hit",
          castOrigin: t.origin,
          direction: t.dir,
          dummyAtCast: t.dummyPositionsAtCast[hit.index] ?? [...target.position],
          dummyAtImpact: [...target.position],
          dummyFinal: final,
          flashAvailable: false,
          flashUsed: false,
          missDistance,
          timeToImpactMs: now - t.startTime,
          correctAimPoint: correctAim,
        });
        t.phase = "idle";
        writeSensor("idle", null, t.origin, t.dir);
        // NOTE: do not hide the projectile/chain here — `attached` keeps them visible
        // until the pull animation finishes, driven in the per-frame `updateAttached` block.
        return;
      }

      if (t.distance >= t.range || now - t.startTime > hookCfg.maxTravelTimeMs) {
        const tip = add(t.origin, t.dir, t.range);
        postCast.current = { until: now + 900, from: t.origin, to: tip };
        const missTarget = findClosestDummyToSegment(t.origin, tip);
        const targetAtCast = missTarget ? t.dummyPositionsAtCast[missTarget.index] ?? [...missTarget.dummy.position] : t.dummyAtCast;
        const targetPosition = missTarget?.dummy.position ?? t.dummyAtCast;
        const targetVelocity = missTarget?.dummy.velocity ?? [0, 0, 0] as [number, number, number];
        // Correct aim point: where the dummy was when the hook would arrive at its X.
        const correctAim = predictCorrectAim(t.origin, targetPosition, targetVelocity, t.speed);
        const missDistance = missTarget?.distance ?? distancePointToSegmentXZ(targetPosition, t.origin, tip);
        const finalResult = aiBus.flashedThisCast ? "flashed" : "miss";
        endHook(finalResult, {
          result: finalResult,
          castOrigin: t.origin,
          direction: t.dir,
          dummyAtCast: targetAtCast,
          dummyAtImpact: [...targetPosition],
          dummyFinal: [...targetPosition],
          flashAvailable: aiBus.dummyFlashReadyAt <= now,
          flashUsed: aiBus.flashedThisCast,
          missDistance,
          timeToImpactMs: now - t.startTime,
          correctAimPoint: correctAim,
        });
        t.phase = "idle";
        restorePlayerSpeed();
        clearPlayerAnimationSequence();
        writeSensor("idle", null, t.origin, t.dir);
        if (projectileRef.current) projectileRef.current.visible = false;
      }
    } else if (!attached.current) {
      if (projectileRef.current) projectileRef.current.visible = false;
      if (chainRef.current) chainRef.current.visible = false;
    }

    // Aim line + range circle (idle visualization)
    if (rangeRingRef.current) {
      rangeRingRef.current.position.set(playerEntity.position[0], 0.02, playerEntity.position[2]);
      rangeRingRef.current.scale.setScalar(hookCfg.range);
      rangeRingRef.current.visible = hookCfg.showRangeCircle && t.phase !== "flight";
    }
    if (aimLineRef.current) {
      const p = playerEntity.position;
      const a = aim;
      // Clip aim to range
      const fullLen = Math.hypot(a[0] - p[0], a[2] - p[2]);
      const clipped = Math.min(fullLen, hookCfg.range);
      const mid: [number, number, number] = [
        p[0] + ((a[0] - p[0]) / (fullLen || 1)) * (clipped / 2),
        0.03,
        p[2] + ((a[2] - p[2]) / (fullLen || 1)) * (clipped / 2),
      ];
      aimLineRef.current.position.set(mid[0], mid[1], mid[2]);
      aimLineRef.current.scale.set(t.width * 2, 1, clipped);
      aimLineRef.current.rotation.y = Math.atan2(a[0] - p[0], a[2] - p[2]);
      aimLineRef.current.visible = hookCfg.showAimLine && t.phase !== "flight";
      const mat = aimLineRef.current.material as THREE.MeshBasicMaterial & { color: any };
      if (mat) {
        mat.color.set(t.phase === "windup" ? "#ffd166" : canCast ? "#4ea1ff" : "#5a6478");
      }
    }
  });

  return (
    <group>
      {/* range circle */}
      <mesh ref={rangeRingRef} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.985, 1.0, 96]} />
        <meshBasicMaterial color="#3d6fa8" transparent opacity={0.65} />
      </mesh>

      {/* aim indicator */}
      <mesh ref={aimLineRef} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial color="#4ea1ff" transparent opacity={0.35} />
      </mesh>

      {/* projectile — Thresh hook model (falls back to sphere if it fails to load) */}
      <group ref={projectileRef} visible={false}>
        <HookProjectileModel />
      </group>

      {/* chain — FBX stretched 1u along +Y, scaled to player→hook distance at runtime */}
      <group ref={chainRef} visible={false}>
        <HookChainModel />
      </group>

      <PostCastLine refState={postCast} />
    </group>
  );
}

function PostCastLine({
  refState,
}: {
  refState: React.MutableRefObject<{ until: number; from: [number, number, number]; to: [number, number, number] } | null>;
}) {
  const meshRef = useRef<Mesh>(null);
  useFrame(() => {
    const m = meshRef.current;
    if (!m) return;
    const st = refState.current;
    const now = performance.now();
    if (!st || now > st.until) {
      m.visible = false;
      return;
    }
    const remaining = st.until - now;
    const fade = Math.min(1, remaining / 900);
    m.visible = true;
    const a = st.from, b = st.to;
    const len = Math.hypot(b[0] - a[0], b[2] - a[2]);
    m.position.set((a[0] + b[0]) / 2, 0.04, (a[2] + b[2]) / 2);
    m.scale.set(0.2, 1, len);
    m.rotation.y = Math.atan2(b[0] - a[0], b[2] - a[2]);
    const mat = m.material as THREE.MeshBasicMaterial;
    (mat as any).opacity = 0.7 * fade;
  });
  return (
    <mesh ref={meshRef} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
      <planeGeometry args={[1, 1]} />
      <meshBasicMaterial color="#ffd166" transparent opacity={0.7} />
    </mesh>
  );
}

function findHitDummy(
  segA: [number, number, number],
  segB: [number, number, number],
  hookHead: [number, number, number],
  hitRadius: number,
  dir: [number, number, number],
) {
  let best: { dummy: MutableEntity; index: number; along: number } | null = null;
  const dummies = getActiveDummies();
  for (let index = 0; index < dummies.length; index += 1) {
    const dummy = dummies[index];
    if (!dummy.alive) continue;
    const distToLine = distancePointToSegmentXZ(dummy.position, segA, segB);
    const headDist = distXZ(hookHead, dummy.position);
    if (distToLine > hitRadius && headDist > hitRadius) continue;

    const along = (dummy.position[0] - segA[0]) * dir[0] + (dummy.position[2] - segA[2]) * dir[2];
    if (!best || along < best.along) best = { dummy, index, along };
  }
  return best;
}

function findClosestDummyToSegment(segA: [number, number, number], segB: [number, number, number]) {
  let best: { dummy: MutableEntity; index: number; distance: number } | null = null;
  const dummies = getActiveDummies();
  for (let index = 0; index < dummies.length; index += 1) {
    const dummy = dummies[index];
    if (!dummy.alive) continue;
    const distance = distancePointToSegmentXZ(dummy.position, segA, segB);
    if (!best || distance < best.distance) best = { dummy, index, distance };
  }
  return best;
}

/**
 * Lead-the-target: where should the hook have been aimed so it would have intercepted
 * the dummy (assuming straight-line dummy motion)?
 *
 *  Hook tip at time t:    origin + dir * (speed * t)   (any direction we choose, fixed speed)
 *  Dummy at time t:       dummyPos + dummyVel * t
 *  Need:  |hookTip - dummy| ~= 0, with hook speed scalar fixed.
 *
 * Solve |D + V*t|^2 = (speed*t)^2 where D = dummyPos - origin, V = dummyVel.
 * Quadratic in t: (V·V - speed^2) t^2 + 2 (D·V) t + D·D = 0
 */
function predictCorrectAim(
  origin: [number, number, number],
  dummyPos: [number, number, number],
  dummyVel: [number, number, number],
  hookSpeed: number,
): [number, number, number] {
  const Dx = dummyPos[0] - origin[0];
  const Dz = dummyPos[2] - origin[2];
  const Vx = dummyVel[0];
  const Vz = dummyVel[2];
  const a = Vx * Vx + Vz * Vz - hookSpeed * hookSpeed;
  const b = 2 * (Dx * Vx + Dz * Vz);
  const c = Dx * Dx + Dz * Dz;
  let t: number | null = null;
  if (Math.abs(a) < 1e-4) {
    // dummy speed ~= hook speed; linear: -c / b
    if (Math.abs(b) > 1e-4) t = -c / b;
  } else {
    const disc = b * b - 4 * a * c;
    if (disc >= 0) {
      const sq = Math.sqrt(disc);
      const t1 = (-b - sq) / (2 * a);
      const t2 = (-b + sq) / (2 * a);
      // smallest positive
      const cands = [t1, t2].filter((x) => x > 0);
      if (cands.length) t = Math.min(...cands);
    }
  }
  if (t === null || !isFinite(t) || t < 0) {
    return [dummyPos[0], 0, dummyPos[2]];
  }
  return [dummyPos[0] + Vx * t, 0, dummyPos[2] + Vz * t];
}

const CHAIN_UP = new Vector3(0, 1, 0);
const chainDir = new Vector3();
const chainQuat = new Quaternion();

/**
 * Approximate hand position: offset from the player center forward (along chain direction)
 * and to the right, at roughly chest/shoulder height. Avoids needing a bone lookup on the
 * skinned mesh — close enough that the chain visibly emerges from the hand area.
 */
// Cast/flight hand anchor — where the chain emerges while the hook is travelling.
const HAND_FORWARD = 0.65;
const HAND_RIGHT = -0.05;
const HAND_HEIGHT = 1.3;

// Pull/attached hand anchor — where the chain emerges while Thresh is pulling the target in.
// (Pull animation puts his arm in a different pose, so this needs its own offsets.)
const PULL_HAND_FORWARD = 0.1;
const PULL_HAND_RIGHT = -0.1;
const PULL_HAND_HEIGHT = 1;

function handAnchor(
  playerPos: [number, number, number],
  toward: [number, number, number],
): [number, number, number] {
  return computeHandAnchor(playerPos, toward, HAND_FORWARD, HAND_RIGHT, HAND_HEIGHT);
}

function pullHandAnchor(
  playerPos: [number, number, number],
  toward: [number, number, number],
): [number, number, number] {
  return computeHandAnchor(playerPos, toward, PULL_HAND_FORWARD, PULL_HAND_RIGHT, PULL_HAND_HEIGHT);
}

function computeHandAnchor(
  playerPos: [number, number, number],
  toward: [number, number, number],
  forward: number,
  right: number,
  height: number,
): [number, number, number] {
  const dx = toward[0] - playerPos[0];
  const dz = toward[2] - playerPos[2];
  const len = Math.hypot(dx, dz) || 1;
  const fx = dx / len;
  const fz = dz / len;
  // Right vector (90° CW of forward on XZ plane).
  const rx = fz;
  const rz = -fx;
  return [
    playerPos[0] + fx * forward + rx * right,
    height,
    playerPos[2] + fz * forward + rz * right,
  ];
}

function updateChain(
  ref: React.MutableRefObject<Group | null>,
  from: [number, number, number],
  to: [number, number, number],
) {
  const m = ref.current;
  if (!m) return;
  const ax = from[0];
  const ay = from[1];
  const az = from[2];
  const bx = to[0], by = to[1], bz = to[2];
  const dx = bx - ax, dy = by - ay, dz = bz - az;
  const len = Math.hypot(dx, dy, dz) || 0.0001;
  m.position.set((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2);
  m.scale.set(1, len, 1);
  chainDir.set(dx / len, dy / len, dz / len);
  chainQuat.setFromUnitVectors(CHAIN_UP, chainDir);
  m.quaternion.copy(chainQuat);
  m.visible = true;
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function applyHookedSelfSlow() {
  playerControlState.movementSpeedMultiplier = HOOKED_SELF_SPEED_MULTIPLIER;
  playerControlState.animationSpeedMultiplier = HOOKED_SELF_SPEED_MULTIPLIER;
}

function restorePlayerSpeed() {
  playerControlState.movementSpeedMultiplier = 1;
  playerControlState.animationSpeedMultiplier = 1;
  playerControlState.faceTarget = null;
}

function dashAnimationDurationToTarget(target: MutableEntity, dashSpeed: number) {
  const dx = target.position[0] - playerEntity.position[0];
  const dz = target.position[2] - playerEntity.position[2];
  const distance = Math.max(0, Math.hypot(dx, dz) - DASH_STOP_DISTANCE);
  const duration = dashSpeed > 0 ? (distance / dashSpeed) * 1000 : DASH_ANIMATION_MAX_MS;
  return clamp(duration, DASH_ANIMATION_MIN_MS, DASH_ANIMATION_MAX_MS);
}

function HookProjectileModel() {
  const cfg = useAssetStore((s) => s.registry.hookProjectileModel);
  const state = useModel(cfg.path);
  const glow = useChromaStore((s) => selectedChromaHookGlow(s.selectedId));
  const prepared = useMemo(() => {
    if (state.status !== "ready") return null;
    const scene = cloneSkeleton(state.model.scene) as Group;
    const materials: MeshStandardMaterial[] = [];
    scene.traverse((o: any) => {
      if (o.isMesh) {
        const mat = new MeshStandardMaterial({
          color: "#0c0f14",
          emissive: glow,
          emissiveIntensity: 1.8,
          metalness: 0.75,
          roughness: 0.35,
        });
        o.material = mat;
        materials.push(mat);
        o.castShadow = true;
        o.frustumCulled = false;
      }
    });
    const { size, center } = computeMeshBounds(scene);
    const fitDim = size.y > 0 ? size.y : Math.max(size.x, size.z) || 1;
    const autoScale = cfg.autoFitHeight ? cfg.autoFitHeight / fitDim : 1;
    return { scene, autoScale, center, materials };
  }, [state, cfg.autoFitHeight, glow]);

  if (!prepared) {
    return (
      <mesh castShadow>
        <sphereGeometry args={[0.28, 16, 16]} />
        <meshStandardMaterial color="#ffd166" emissive="#ff9d2f" emissiveIntensity={1.6} />
      </mesh>
    );
  }

  const finalScale = cfg.scale * prepared.autoScale;
  return (
    <group
      scale={finalScale}
      rotation={cfg.rotation}
      position={cfg.positionOffset}
    >
      <primitive
        object={prepared.scene}
        position={[-prepared.center.x, -prepared.center.y, -prepared.center.z]}
      />
    </group>
  );
}

function HookChainModel() {
  const state = useModel("/assets/models/champions/chain.fbx");
  const glow = useChromaStore((s) => selectedChromaHookGlow(s.selectedId));
  const prepared = useMemo(() => {
    if (state.status !== "ready") return null;
    const scene = cloneSkeleton(state.model.scene) as Group;
    scene.traverse((o: any) => {
      if (o.isMesh) {
        o.material = new MeshStandardMaterial({
          color: "#0c0f14",
          emissive: glow,
          emissiveIntensity: 1.6,
          metalness: 0.7,
          roughness: 0.4,
        });
        o.castShadow = true;
        o.frustumCulled = false;
      }
    });
    const { size, center } = computeMeshBounds(scene);
    // Normalize the chain to exactly 1 unit tall along +Y, centered at origin.
    // The wrapping ref's scale.y then directly becomes "chain length in world units".
    const heightScale = size.y > 0 ? 1 / size.y : 1;
    return { scene, heightScale, center };
  }, [state, glow]);

  if (!prepared) return null;
  return (
    <group scale={[prepared.heightScale, prepared.heightScale, prepared.heightScale]}>
      <primitive
        object={prepared.scene}
        position={[-prepared.center.x, -prepared.center.y, -prepared.center.z]}
      />
    </group>
  );
}

/**
 * Bounding box from mesh geometry only — ignores bones, empties, and other non-renderable nodes.
 * FBX exports often include bone hierarchies that extend far beyond the visible mesh, which
 * makes Box3.setFromObject return a giant misaligned box. Walking just the meshes fixes that.
 */
function computeMeshBounds(scene: Group): { size: Vector3; center: Vector3 } {
  const box = new Box3();
  let started = false;
  scene.updateMatrixWorld(true);
  scene.traverse((o: any) => {
    if (!o.isMesh) return;
    const geom = o.geometry;
    if (!geom) return;
    if (!geom.boundingBox) geom.computeBoundingBox();
    const meshBox = geom.boundingBox.clone().applyMatrix4(o.matrixWorld);
    if (!started) {
      box.copy(meshBox);
      started = true;
    } else {
      box.union(meshBox);
    }
  });
  const size = new Vector3();
  const center = new Vector3();
  box.getSize(size);
  box.getCenter(center);
  return { size, center };
}

// Re-export THREE type ambient (keeps file compact)
import type * as THREE from "three";
