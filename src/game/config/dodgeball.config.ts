/** Circular arena radius for Dodgeball mode (world units). Tennis-ish — claustrophobic. */
export const DODGEBALL_ARENA_RADIUS = 7;

/** Player movement speed in dodgeball — slightly slower than hook trainer for that boxed-in feel. */
export const DODGEBALL_PLAYER_SPEED = 3.0;

/** When idle for longer than IDLE2_MIN..IDLE2_MAX seconds, play idle2 once, then resume idle. */
export const DODGEBALL_IDLE2_MIN_MS = 4000;
export const DODGEBALL_IDLE2_MAX_MS = 14000;

/** Cleaver Q — Mundo's primary projectile in dodgeball mode. */
export const CLEAVER_RANGE = 13.5;          // world units; nearly arena-wide without changing projectile speed
export const CLEAVER_SPEED_STANDING = 26.5; // world units / s when Mundo is stationary
export const CLEAVER_SPEED_MOVING = 18.8;   // world units / s when cast on the move
export const CLEAVER_WIDTH = 0.35;          // half-width for future hit detection
export const CLEAVER_SIZE = 1.70;            // visual scale multiplier (1.0 = auto-fit height only)
export const CLEAVER_CAST_DELAY_MS = 450;   // windup time before the projectile spawns
export const CLEAVER_MOVING_CAST_DELAY_MS = 45; // shorter windup when Mundo is already running
export const CLEAVER_COOLDOWN_MS = 3000;    // time between casts
export const CLEAVER_ATTACK_ANIMATION_MS = 700; // approx duration of the attack clip
export const CLEAVER_ATTACK_TO_IDLE_MS = 800;   // approx duration of attack_to_idle clip
export const CLEAVER_ATTACK_INTO_RUN_MS = 600;  // approx duration of attack_into_run clip

/** Motion blur — PS2-style afterimage trail behind the cleaver in flight. */
export const CLEAVER_MOTION_BLUR_SAMPLES = 15;   // number of ghost copies (0 = off)
export const CLEAVER_MOTION_BLUR_STRENGTH = 0.15; // peak alpha of the nearest ghost (0..1)
export const CLEAVER_MOTION_BLUR_STRIDE_MS = 12; // time gap between ghosts (ms); bigger = longer smear
export const CLEAVER_MOTION_BLUR_DECAY = 0.1; // per-sample alpha falloff; 0.10 = each ghost is 10% dimmer than the previous one

/** Flash summoner — short blink in the aim direction. */
export const FLASH_RANGE = 4.0;             // world units teleported per Flash
export const FLASH_COOLDOWN_MS = 2_000;    // 20s cooldown
export const FLASH_VFX_DURATION_MS = 300;   // particle glow linger time
export const FLASH_SCREEN_ALPHA = 0.25;     // peak white-flash overlay opacity (0..1)
export const FLASH_SCREEN_DURATION_MS = 50; // how long the white screen flash lasts

/** Old-school blood splatter — radial red shards on champion hit. */
export const BLOOD_SHARD_COUNT = 30;        // number of radial blood streaks
export const BLOOD_DURATION_MS = 420;       // total lifetime of the splatter
export const BLOOD_MAX_LENGTH = 1.85;       // world-unit length of the longest shard at peak
export const BLOOD_BASE_HEIGHT = 10.0;       // splatter centered around this Y above the ground
