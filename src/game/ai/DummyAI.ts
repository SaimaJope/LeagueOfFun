import type { Vec3 } from "@/types/game";
import type { AIConfig } from "@/game/config/ai.config";
import { PROFILES } from "@/game/ai/personalities";
import { distancePointToSegmentXZ } from "@/game/abilities/hookMath";
import { PLAY_AREA_BOUND } from "@/game/config/playArea.config";

const ARENA_BOUND = PLAY_AREA_BOUND;
const WALL_GOAL_MARGIN = 2.4;
const WALL_AVOID_MARGIN = 2.1;
const WALL_AVOID_STRENGTH = 1.7;

export interface HookSensor {
  /** Cast started timestamp (performance.now ms). null when no cast pending. */
  castStartedAt: number | null;
  /** Cast windup duration. */
  castDelayMs: number;
  /** Hook origin (player position at cast start). */
  origin: Vec3;
  /** Hook direction (unit XZ). */
  direction: Vec3;
  /** Hook projectile current speed and range. */
  speed: number;
  range: number;
  width: number;
  /** Phase: "windup" before launch, "flight" after, "idle" otherwise. */
  phase: "idle" | "windup" | "flight";
}

export interface DummyMemory {
  /** When the dummy first noticed the cast (windup + reaction). null if not yet reacted. */
  reactedAt: number | null;
  /** Random per-cast roll: 0..1 used as the dodge/mistake gate. */
  rollDodge: number;
  rollFlash: number;
  rollMistake: number;
  rollFake: number;
  /** Cached random perpendicular dodge direction (XZ unit). */
  dodgeDir: Vec3;
  /** Whether the dummy intends to flash for this cast. */
  intendsFlash: boolean;
  /** Whether the dummy is faking a sidestep first. */
  faking: boolean;
  /** Time the fake should reverse direction. */
  fakeReverseAt: number;
  /** When the dummy is allowed to use flash again. */
  flashReadyAt: number;
  /** Last time path goal was changed. */
  lastPathChangeAt: number;
  /** Current wander goal (XZ). */
  pathGoal: Vec3;
  /** Last juke timestamp. */
  lastJukeAt: number;
  /** Velocity (for inertia). */
  velocity: Vec3;
  /** Was a flash used this cast (for analysis). */
  usedFlashThisCast: boolean;
  /** Track the cast we have reacted to so we don't react twice. */
  reactedCastStartedAt: number | null;
}

export function newMemory(): DummyMemory {
  return {
    reactedAt: null,
    rollDodge: 0,
    rollFlash: 0,
    rollMistake: 0,
    rollFake: 0,
    dodgeDir: [1, 0, 0],
    intendsFlash: false,
    faking: false,
    fakeReverseAt: 0,
    flashReadyAt: 0,
    lastPathChangeAt: 0,
    pathGoal: [0, 0, 0],
    lastJukeAt: 0,
    velocity: [0, 0, 0],
    usedFlashThisCast: false,
    reactedCastStartedAt: null,
  };
}

export interface UpdateResult {
  /** New position after this step. */
  position: Vec3;
  /** Whether a flash blink occurred (so visuals can play). */
  flashed: { from: Vec3; to: Vec3 } | null;
}

/**
 * Update the dummy: pathing + reaction to incoming hook. Returns new state.
 *
 * Strategy:
 *  1. Maintain a wander goal. Switch goal every pathChangeInterval (+ juke triggers).
 *  2. Steer toward goal with simple velocity smoothing.
 *  3. When a cast is detected (and reaction delay elapsed), decide once:
 *     - flash?     -> instantly blink perpendicular to hook line
 *     - dodge?     -> set perpendicular dodge direction
 *     - fake?      -> dodge one way then reverse
 *     - mistake?   -> walk into the hook instead
 */
export function updateDummy(
  position: Vec3,
  cfg: AIConfig,
  sensor: HookSensor,
  mem: DummyMemory,
  dt: number,
  now: number,
): UpdateResult {
  const profile = PROFILES[cfg.personality];
  const result: UpdateResult = { position, flashed: null };

  // Reset reaction state when a *new* cast starts
  if (sensor.castStartedAt !== mem.reactedCastStartedAt) {
    mem.reactedCastStartedAt = sensor.castStartedAt;
    mem.reactedAt = null;
    mem.intendsFlash = false;
    mem.faking = false;
    mem.fakeReverseAt = 0;
    mem.usedFlashThisCast = false;
    if (sensor.castStartedAt !== null) {
      // Decide what to do this cast (rolled at cast start, used after reaction)
      mem.rollDodge = Math.random();
      mem.rollFlash = Math.random();
      mem.rollMistake = Math.random();
      mem.rollFake = Math.random();
      const perp: Vec3 = [-sensor.direction[2], 0, sensor.direction[0]];
      // pick left or right
      const side = Math.random() < 0.5 ? -1 : 1;
      mem.dodgeDir = [perp[0] * side, 0, perp[2] * side];
    }
  }

  // -------- React to cast --------
  if (sensor.castStartedAt !== null && cfg.mode !== "standing") {
    const reactionDelay = cfg.reactionDelayMs * profile.reactionMul;
    const elapsed = now - sensor.castStartedAt;
    if (elapsed >= reactionDelay && mem.reactedAt === null) {
      mem.reactedAt = now;
      // Estimate whether the hook will hit us if we keep walking the goal
      const hitProb = estimateHitProbability(position, mem.velocity, sensor);
      const dodgeChance = Math.min(0.99, cfg.dodgeChance * profile.dodgeMul);
      const flashEager = Math.min(0.99, cfg.flashChance * profile.flashEagernessMul);

      const flashAvailable = now >= mem.flashReadyAt;
      const flashHoldBias = profile.flashHoldBias; // -1..+1, + means hold
      const flashThreshold = 0.55 + flashHoldBias * 0.35; // probability above which we flash
      const willFlash =
        flashAvailable &&
        (cfg.mode === "flashDodger" || cfg.mode === "human" || cfg.mode === "pro" || cfg.mode === "juker") &&
        hitProb >= flashThreshold &&
        mem.rollFlash < flashEager;

      const willDodge =
        (cfg.mode !== "basicMover") &&
        mem.rollDodge < dodgeChance &&
        hitProb > 0.25;

      const willFake = willDodge && mem.rollFake < profile.fakeDodgeChance;
      const willMistake = mem.rollMistake < cfg.mistakeRate * profile.mistakeMul;

      mem.intendsFlash = willFlash;
      mem.faking = willFake;
      mem.fakeReverseAt = now + 120 + Math.random() * 180;

      if (willMistake) {
        // walk INTO the hook instead of perpendicular (panic / bad read)
        mem.dodgeDir = [sensor.direction[0], 0, sensor.direction[2]];
      } else if (!willDodge && !willFlash) {
        // hold position / continue path (do nothing extra)
        mem.dodgeDir = [0, 0, 0];
      }

      if (willFlash) {
        const flashRange = cfg.flashRange;
        const fromPos: Vec3 = [position[0], 0, position[2]];
        // Flash perpendicular to the hook line, away from the closest point
        const perp: Vec3 = [-sensor.direction[2], 0, sensor.direction[0]];
        // Choose the side that increases distance to the hook line
        const sidePos: Vec3 = [position[0] + perp[0], 0, position[2] + perp[2]];
        const distPos = distancePointToSegmentXZ(sidePos, sensor.origin, addRay(sensor.origin, sensor.direction, sensor.range));
        const sideNeg: Vec3 = [position[0] - perp[0], 0, position[2] - perp[2]];
        const distNeg = distancePointToSegmentXZ(sideNeg, sensor.origin, addRay(sensor.origin, sensor.direction, sensor.range));
        const sign = distPos >= distNeg ? 1 : -1;
        // small randomness so it's not always "perfect"
        const errAngle = (Math.random() - 0.5) * 0.4 * (1 - profile.mistakeMul * 0.2);
        const cs = Math.cos(errAngle), sn = Math.sin(errAngle);
        const fx = perp[0] * cs - perp[2] * sn;
        const fz = perp[0] * sn + perp[2] * cs;
        let to: Vec3 = [
          clamp(position[0] + fx * flashRange * sign, -ARENA_BOUND, ARENA_BOUND),
          0,
          clamp(position[2] + fz * flashRange * sign, -ARENA_BOUND, ARENA_BOUND),
        ];
        position = to;
        result.position = to;
        result.flashed = { from: fromPos, to };
        mem.flashReadyAt = now + cfg.flashCooldownMs;
        mem.usedFlashThisCast = true;
      }
    }
  } else if (sensor.castStartedAt === null) {
    mem.reactedAt = null;
  }

  // -------- Movement decision --------
  const goalSpeed = cfg.moveSpeed;
  let desired: Vec3 = [0, 0, 0];

  if (cfg.mode === "standing") {
    desired = [0, 0, 0];
  } else {
    // Default: head toward path goal (with re-pick on interval)
    const pathInterval = cfg.pathChangeInterval / (1 + profile.jukeMul * cfg.jukeFrequency);
    if (now - mem.lastPathChangeAt > pathInterval || dist2(mem.pathGoal, position) < 0.6) {
      mem.lastPathChangeAt = now;
      mem.pathGoal = pickWanderGoal(position);
    }
    desired = unitToward(position, mem.pathGoal);

    // While reacting to a cast, blend in dodge direction if we have one
    if (mem.reactedAt !== null && (mem.dodgeDir[0] !== 0 || mem.dodgeDir[2] !== 0)) {
      let dir = mem.dodgeDir;
      // faking? flip after fakeReverseAt
      if (mem.faking && now > mem.fakeReverseAt) {
        dir = [-dir[0], 0, -dir[2]];
        mem.faking = false;
      }
      desired = [dir[0], 0, dir[2]];
    }

    // Juker: occasional stops and reverses (outside of cast reaction)
    if (cfg.mode === "juker" || cfg.mode === "human" || cfg.mode === "pro") {
      if (now - mem.lastJukeAt > 600) {
        if (Math.random() < cfg.stopChance * 0.02) {
          desired = [0, 0, 0];
          mem.lastJukeAt = now;
        } else if (Math.random() < cfg.reverseChance * 0.02) {
          desired = [-desired[0], 0, -desired[2]];
          mem.lastJukeAt = now;
        }
      }
    }
  }

  desired = steerAwayFromWalls(position, desired);

  // Smooth velocity
  const acc = cfg.acceleration;
  mem.velocity = [
    approach(mem.velocity[0], desired[0] * goalSpeed, acc * dt),
    0,
    approach(mem.velocity[2], desired[2] * goalSpeed, acc * dt),
  ];

  const nextX = position[0] + mem.velocity[0] * dt;
  const nextZ = position[2] + mem.velocity[2] * dt;
  const hitWallX = nextX <= -ARENA_BOUND || nextX >= ARENA_BOUND;
  const hitWallZ = nextZ <= -ARENA_BOUND || nextZ >= ARENA_BOUND;
  result.position = [
    clamp(nextX, -ARENA_BOUND, ARENA_BOUND),
    0,
    clamp(nextZ, -ARENA_BOUND, ARENA_BOUND),
  ];

  if (hitWallX || hitWallZ) {
    if (hitWallX) mem.velocity[0] = -mem.velocity[0] * 0.8;
    if (hitWallZ) mem.velocity[2] = -mem.velocity[2] * 0.8;
    mem.lastPathChangeAt = now;
    mem.pathGoal = pickWanderGoalTowardCenter(result.position);
  }
  return result;
}

/**
 * Probability 0..1 that the hook would hit the dummy if it kept moving with its current velocity.
 * Uses simple lookahead: estimate where the hook tip will be at the predicted impact time,
 * compare to where the dummy will be, return a soft 1 - distance/threshold.
 */
function estimateHitProbability(pos: Vec3, vel: Vec3, sensor: HookSensor): number {
  if (sensor.castStartedAt === null) return 0;
  // Time until projectile reaches the dummy's *current* X-projection on the hook line
  const dx = pos[0] - sensor.origin[0];
  const dz = pos[2] - sensor.origin[2];
  const tAlong = dx * sensor.direction[0] + dz * sensor.direction[2]; // distance along line
  if (tAlong < 0 || tAlong > sensor.range + 2) return 0;
  const travelTimeMs = (tAlong / sensor.speed) * 1000;
  const remainingWindupMs = Math.max(0, sensor.castDelayMs - (performance.now() - sensor.castStartedAt));
  const totalMs = travelTimeMs + remainingWindupMs;
  const futurePos: Vec3 = [pos[0] + vel[0] * (totalMs / 1000), 0, pos[2] + vel[2] * (totalMs / 1000)];
  const hookTip: Vec3 = [
    sensor.origin[0] + sensor.direction[0] * tAlong,
    0,
    sensor.origin[2] + sensor.direction[2] * tAlong,
  ];
  const d = Math.hypot(futurePos[0] - hookTip[0], futurePos[2] - hookTip[2]);
  // 0 distance -> 1.0; > (width + 1.2) -> ~0
  const threshold = sensor.width + 1.2;
  return clamp01(1 - d / threshold);
}

function pickWanderGoal(from: Vec3): Vec3 {
  // pick a point ~5-12u away
  const r = 5 + Math.random() * 7;
  const a = Math.random() * Math.PI * 2;
  return [
    clamp(from[0] + Math.cos(a) * r, -ARENA_BOUND + WALL_GOAL_MARGIN, ARENA_BOUND - WALL_GOAL_MARGIN),
    0,
    clamp(from[2] + Math.sin(a) * r, -ARENA_BOUND + WALL_GOAL_MARGIN, ARENA_BOUND - WALL_GOAL_MARGIN),
  ];
}

function pickWanderGoalTowardCenter(from: Vec3): Vec3 {
  const centerAngle = Math.atan2(-from[2], -from[0]);
  const a = centerAngle + (Math.random() - 0.5) * Math.PI * 0.7;
  const r = 5 + Math.random() * 5;
  return [
    clamp(from[0] + Math.cos(a) * r, -ARENA_BOUND + WALL_GOAL_MARGIN, ARENA_BOUND - WALL_GOAL_MARGIN),
    0,
    clamp(from[2] + Math.sin(a) * r, -ARENA_BOUND + WALL_GOAL_MARGIN, ARENA_BOUND - WALL_GOAL_MARGIN),
  ];
}

function steerAwayFromWalls(position: Vec3, desired: Vec3): Vec3 {
  let x = desired[0];
  let z = desired[2];
  const left = position[0] + ARENA_BOUND;
  const right = ARENA_BOUND - position[0];
  const bottom = position[2] + ARENA_BOUND;
  const top = ARENA_BOUND - position[2];

  if (left < WALL_AVOID_MARGIN) x += ((WALL_AVOID_MARGIN - left) / WALL_AVOID_MARGIN) * WALL_AVOID_STRENGTH;
  if (right < WALL_AVOID_MARGIN) x -= ((WALL_AVOID_MARGIN - right) / WALL_AVOID_MARGIN) * WALL_AVOID_STRENGTH;
  if (bottom < WALL_AVOID_MARGIN) z += ((WALL_AVOID_MARGIN - bottom) / WALL_AVOID_MARGIN) * WALL_AVOID_STRENGTH;
  if (top < WALL_AVOID_MARGIN) z -= ((WALL_AVOID_MARGIN - top) / WALL_AVOID_MARGIN) * WALL_AVOID_STRENGTH;

  const len = Math.hypot(x, z);
  if (len < 0.001) return [0, 0, 0];
  return [x / len, 0, z / len];
}

function unitToward(from: Vec3, to: Vec3): Vec3 {
  const dx = to[0] - from[0];
  const dz = to[2] - from[2];
  const len = Math.hypot(dx, dz) || 1;
  return [dx / len, 0, dz / len];
}

function approach(curr: number, target: number, max: number): number {
  const d = target - curr;
  if (Math.abs(d) <= max) return target;
  return curr + Math.sign(d) * max;
}

function dist2(a: Vec3, b: Vec3): number {
  const dx = a[0] - b[0], dz = a[2] - b[2];
  return dx * dx + dz * dz;
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
function addRay(o: Vec3, d: Vec3, t: number): Vec3 {
  return [o[0] + d[0] * t, 0, o[2] + d[2] * t];
}
