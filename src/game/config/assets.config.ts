/** A clip source can be the base GLB itself, or a separate animation-only GLB.
 *  - clipName: exact clip name to use; falls back to clipIndex if not found
 *  - clipIndex: which clip in that file to pull (default 0)
 */
export interface AnimationSource {
  path: string;
  clipName?: string;
  clipIndex?: number;
}

export interface ModelAssetConfig {
  name: string;
  type: "model";
  /** Base model — provides the skinned mesh and skeleton. */
  path: string;
  fallback: "capsule" | "box" | "sphere";
  /** Optional target height in game world units before applying scale. */
  autoFitHeight?: number;
  /** Manual multiplier applied after auto-fit. */
  scale: number;
  rotation: [number, number, number];
  positionOffset: [number, number, number];
  /** Legacy in-base-file clip-name mapping (still supported). */
  animations: Record<string, string>;
  /** New: per-action clip source files (loaded separately, played on the base mixer). */
  animationSources?: Partial<Record<string, AnimationSource>>;
  notes?: string;
}

export interface IconAssetConfig {
  name: string;
  type: "icon";
  path: string;
  fallbackSvg: string;
  notes?: string;
}

export interface SoundAssetConfig {
  name: string;
  type: "sound";
  path: string;
  volume: number;
  notes?: string;
}

export type AnyAssetConfig = ModelAssetConfig | IconAssetConfig | SoundAssetConfig;

const FALLBACK_HOOK_SVG = `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path fill="currentColor" d="M14 3v6a4 4 0 1 1-4 4H8a6 6 0 1 0 6-6V3z"/></svg>`;
const FALLBACK_FLASH_SVG = `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path fill="currentColor" d="M13 2L4 14h6l-2 8 10-13h-6z"/></svg>`;
const FALLBACK_DODGE_SVG = `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path fill="currentColor" d="M4 12a8 8 0 0 1 14-5l2-2v6h-6l2-2a6 6 0 0 0-10 3z"/></svg>`;

export interface AssetRegistry {
  playerModel: ModelAssetConfig;
  mundoPlayerModel: ModelAssetConfig;
  defaultDummyModel: ModelAssetConfig;
  hookProjectileModel: ModelAssetConfig;
  cleaverProjectileModel: ModelAssetConfig;
  arenaModel?: ModelAssetConfig;
  cleaverIcon: IconAssetConfig;
  hookIcon: IconAssetConfig;
  flashIcon: IconAssetConfig;
  dodgeIcon: IconAssetConfig;
  moveIcon: IconAssetConfig;
  castSound?: SoundAssetConfig;
  hitSound?: SoundAssetConfig;
  flashSound?: SoundAssetConfig;
}

export const defaultAssetRegistry: AssetRegistry = {
  playerModel: {
    name: "Player Champion",
    type: "model",
    path: "/assets/models/champions/idle.glb",
    fallback: "capsule",
    autoFitHeight: 2.2,
    scale: 1.3,
    rotation: [0, 0, 0],
    positionOffset: [0, 0, 0],
    animations: {
      idle: "Idle1",
      move: "Run",
      cast: "Spell_Cast",
      hit: "Hit",
      recall: "Recall",
      dance: "Celebration",
      pull1: "Spell_Pull1",
      pull2: "Spell_Pull2",
      dash: "Spell_Dash",
    },
    animationSources: {
      idle: { path: "/assets/models/champions/idle.glb", clipName: "Idle1", clipIndex: 0 },
      move: { path: "/assets/models/champions/run.glb", clipName: "Run", clipIndex: 0 },
      cast: { path: "/assets/models/champions/spell_cast_thresh.glb", clipName: "Spell_Cast", clipIndex: 0 },
      dance: { path: "/assets/models/champions/dance_thresh.glb", clipName: "Celebration", clipIndex: 0 },
      pull1: { path: "/assets/models/champions/pull1.glb", clipName: "Spell_Pull1", clipIndex: 0 },
      pull2: { path: "/assets/models/champions/pull2.glb", clipName: "Spell_Pull2", clipIndex: 0 },
      dash: { path: "/assets/models/champions/DASH.glb", clipName: "Spell_Dash", clipIndex: 0 },
    },
    notes: "Multi-GLB Thresh: idle, run, cast, pull1, pull2, dash, and dance (Ctrl+3).",
  },
  mundoPlayerModel: {
    name: "Dr. Mundo",
    type: "model",
    path: "/assets/models/champions/mundo/dr._mundo_idle.glb",
    fallback: "capsule",
    autoFitHeight: 2.2,
    scale: 1.3,
    rotation: [0, 0, 0],
    positionOffset: [0, 0, 0],
    animations: {
      idle: "Idle1",
      idle2: "Idle2",
      move: "Run",
      attack: "Attack",
      attackToIdle: "Attack_To_Idle",
      attackIntoRun: "Attack_Into_Run",
      death: "Death",
    },
    animationSources: {
      idle: { path: "/assets/models/champions/mundo/dr._mundo_idle.glb", clipIndex: 0 },
      idle2: { path: "/assets/models/champions/mundo/dr._mundo_idle2.glb", clipIndex: 0 },
      move: { path: "/assets/models/champions/mundo/mundo_run.glb", clipIndex: 0 },
      attack: { path: "/assets/models/champions/mundo/dr._mundo_attack.glb", clipIndex: 0 },
      attackToIdle: { path: "/assets/models/champions/mundo/dr._mundo_attack_to_idle.glb", clipIndex: 0 },
      attackIntoRun: { path: "/assets/models/champions/mundo/attack_into_run.glb", clipIndex: 0 },
      death: { path: "/assets/models/champions/mundo/dr._mundo_death.glb", clipIndex: 0 },
    },
    notes: "Dr. Mundo: idle, idle2 (every 4-14s), run, attack, attack_to_idle, attack_into_run, death.",
  },
  defaultDummyModel: {
    name: "Default Dummy",
    type: "model",
    path: "/assets/models/dummies/target_dummy.glb",
    fallback: "capsule",
    autoFitHeight: 2,
    scale: 0.7,
    rotation: [0, 0, 0],
    positionOffset: [0, 0, 0],
    animations: {
      idle: "TargetDummy_Idle120.anm",
      hit: "Hit",
    },
    animationSources: {
      idle: { path: "/assets/models/dummies/target_dummy.glb", clipName: "TargetDummy_Idle120.anm", clipIndex: 0 },
      hit: { path: "/assets/models/dummies/target_dummy_death.glb", clipName: "Hit", clipIndex: 0 },
    },
  },
  hookProjectileModel: {
    name: "Hook Projectile",
    type: "model",
    path: "/assets/models/champions/hook.fbx",
    fallback: "sphere",
    autoFitHeight: 0.5,
    scale: 1,
    rotation: [0, 0, 0],
    positionOffset: [0, 0, 0],
    animations: {},
  },
  hookIcon: {
    name: "Hook Icon",
    type: "icon",
    path: "/assets/icons/abilities/THRESHQ.webp",
    fallbackSvg: FALLBACK_HOOK_SVG,
  },
  cleaverIcon: {
    name: "Cleaver Icon",
    type: "icon",
    path: "/assets/icons/abilities/MUNDOQ_ICON.webp",
    fallbackSvg: FALLBACK_HOOK_SVG,
  },
  cleaverProjectileModel: {
    name: "Mundo Cleaver",
    type: "model",
    path: "/assets/models/champions/mundo/cleaver.glb",
    fallback: "box",
    autoFitHeight: 1.5,
    scale: 1,
    rotation: [0, 0, 0],
    positionOffset: [0, 0, 0],
    animations: {},
  },
  flashIcon: {
    name: "Flash Icon",
    type: "icon",
    path: "/assets/icons/abilities/Flash_HD.webp",
    fallbackSvg: FALLBACK_FLASH_SVG,
  },
  dodgeIcon: {
    name: "Dodge Icon",
    type: "icon",
    path: "/assets/icons/ui/dodge.svg",
    fallbackSvg: FALLBACK_DODGE_SVG,
  },
  moveIcon: {
    name: "Move Icon",
    type: "icon",
    path: "/assets/icons/ui/move.svg",
    fallbackSvg: FALLBACK_DODGE_SVG,
  },
};
