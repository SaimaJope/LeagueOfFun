import { create } from "zustand";
import {
  defaultAssetRegistry,
  type AssetRegistry,
  type ModelAssetConfig,
  type IconAssetConfig,
} from "@/game/config/assets.config";
import type { ActionKey } from "@/game/animation/clipMatcher";

type SlotName = keyof AssetRegistry;
type EntityKey = "player" | "dummy";

interface AssetState {
  registry: AssetRegistry;
  /** Clip name overrides per entity per action. */
  clipOverrides: Record<EntityKey, Partial<Record<ActionKey, string>>>;
  /** Animation clip names detected from the currently loaded model. */
  detectedClips: Record<EntityKey, string[]>;
  /** Runtime-imported blob URLs (kept separately so we can revoke). */
  runtimeBlobs: Partial<Record<SlotName, string>>;

  setModelPath: (slot: SlotName, path: string) => void;
  setModelTransform: (slot: SlotName, patch: Partial<Pick<ModelAssetConfig, "scale" | "rotation" | "positionOffset">>) => void;
  setIconPath: (slot: SlotName, path: string) => void;
  setClipOverride: (entity: EntityKey, action: ActionKey, clipName: string | null) => void;
  setDetectedClips: (entity: EntityKey, clipNames: string[]) => void;
  importRuntimeFile: (slot: SlotName, file: File) => Promise<void>;
  resetSlot: (slot: SlotName) => void;
  resetAll: () => void;
}

const LS_KEY = "hooktrainer.assets.v1";

function loadPersisted(): Partial<{
  registry: AssetRegistry;
  clipOverrides: AssetState["clipOverrides"];
}> {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function persist(state: { registry: AssetRegistry; clipOverrides: AssetState["clipOverrides"] }) {
  try {
    const safeRegistry = JSON.parse(JSON.stringify(state.registry));
    localStorage.setItem(LS_KEY, JSON.stringify({ registry: safeRegistry, clipOverrides: state.clipOverrides }));
  } catch {
    /* ignore quota errors */
  }
}

const persisted = loadPersisted();

function mergeAssetRegistry(saved: Partial<AssetRegistry> | undefined): AssetRegistry {
  if (!saved) return { ...defaultAssetRegistry };

  const merged = { ...defaultAssetRegistry } as AssetRegistry;
  const mergedSlots = merged as unknown as Record<string, AnyRegistrySlot>;
  for (const key of Object.keys(saved) as SlotName[]) {
    const savedSlot = saved[key] as AnyRegistrySlot | undefined;
    const defaultSlot = defaultAssetRegistry[key] as AnyRegistrySlot | undefined;
    if (!savedSlot) continue;
    if (!defaultSlot) {
      mergedSlots[key] = savedSlot;
      continue;
    }
    if (savedSlot.type !== defaultSlot.type) continue;

    if (defaultSlot.type === "model" && savedSlot.type === "model") {
      const useDefaultClipConfig = savedSlot.path === defaultSlot.path;
      mergedSlots[key] = {
        ...defaultSlot,
        ...savedSlot,
        ...(useDefaultClipConfig
          ? {
              autoFitHeight: defaultSlot.autoFitHeight,
              scale: defaultSlot.scale,
              rotation: defaultSlot.rotation,
              positionOffset: defaultSlot.positionOffset,
            }
          : {}),
        animations: useDefaultClipConfig
          ? { ...savedSlot.animations, ...defaultSlot.animations }
          : { ...defaultSlot.animations, ...savedSlot.animations },
        animationSources: useDefaultClipConfig
          ? { ...(savedSlot.animationSources ?? {}), ...(defaultSlot.animationSources ?? {}) }
          : { ...(defaultSlot.animationSources ?? {}), ...(savedSlot.animationSources ?? {}) },
      };
      continue;
    }

    if (defaultSlot.type === "icon" && savedSlot.type === "icon") {
      const savedOldDefault = key === "hookIcon" && savedSlot.path === "/assets/icons/abilities/hook.svg";
      mergedSlots[key] = savedOldDefault ? defaultSlot : { ...defaultSlot, ...savedSlot };
      continue;
    }

    mergedSlots[key] = { ...defaultSlot, ...savedSlot } as AnyRegistrySlot;
  }
  return merged;
}

type AnyRegistrySlot = AssetRegistry[keyof AssetRegistry];

export const useAssetStore = create<AssetState>((set, get) => ({
  registry: mergeAssetRegistry(persisted.registry),
  clipOverrides: persisted.clipOverrides ?? { player: {}, dummy: {} },
  detectedClips: { player: [], dummy: [] },
  runtimeBlobs: {},

  setModelPath: (slot, path) =>
    set((s) => {
      const cfg = s.registry[slot] as ModelAssetConfig;
      if (cfg.type !== "model") return s;
      const next = { ...s.registry, [slot]: { ...cfg, path } };
      const nextState = { ...s, registry: next };
      persist(nextState);
      return { registry: next };
    }),

  setModelTransform: (slot, patch) =>
    set((s) => {
      const cfg = s.registry[slot] as ModelAssetConfig;
      if (cfg.type !== "model") return s;
      const next = { ...s.registry, [slot]: { ...cfg, ...patch } };
      persist({ registry: next, clipOverrides: s.clipOverrides });
      return { registry: next };
    }),

  setIconPath: (slot, path) =>
    set((s) => {
      const cfg = s.registry[slot] as IconAssetConfig;
      if (cfg.type !== "icon") return s;
      const next = { ...s.registry, [slot]: { ...cfg, path } };
      persist({ registry: next, clipOverrides: s.clipOverrides });
      return { registry: next };
    }),

  setClipOverride: (entity, action, clipName) =>
    set((s) => {
      const next = { ...s.clipOverrides };
      const map = { ...(next[entity] ?? {}) };
      if (clipName === null) delete map[action];
      else map[action] = clipName;
      next[entity] = map;
      persist({ registry: s.registry, clipOverrides: next });
      return { clipOverrides: next };
    }),

  setDetectedClips: (entity, clipNames) =>
    set((s) => ({ detectedClips: { ...s.detectedClips, [entity]: clipNames } })),

  importRuntimeFile: async (slot, file) => {
    const url = URL.createObjectURL(file);
    const lower = file.name.toLowerCase();
    const isModel = lower.endsWith(".glb") || lower.endsWith(".gltf") || lower.endsWith(".fbx");
    const isIcon = lower.endsWith(".svg") || lower.endsWith(".png") || lower.endsWith(".webp") || lower.endsWith(".jpg");
    // revoke any previous blob for this slot
    const prev = get().runtimeBlobs[slot];
    if (prev) URL.revokeObjectURL(prev);
    set((s) => ({ runtimeBlobs: { ...s.runtimeBlobs, [slot]: url } }));
    if (isModel) get().setModelPath(slot, url);
    else if (isIcon) get().setIconPath(slot, url);
    else throw new Error(`Unsupported file: ${file.name}`);
  },

  resetSlot: (slot) =>
    set((s) => {
      const def = (defaultAssetRegistry as any)[slot];
      if (!def) return s;
      const next = { ...s.registry, [slot]: def };
      persist({ registry: next, clipOverrides: s.clipOverrides });
      return { registry: next };
    }),

  resetAll: () =>
    set(() => {
      const fresh = { ...defaultAssetRegistry };
      const overrides = { player: {}, dummy: {} };
      persist({ registry: fresh, clipOverrides: overrides });
      return { registry: fresh, clipOverrides: overrides, detectedClips: { player: [], dummy: [] } };
    }),
}));
