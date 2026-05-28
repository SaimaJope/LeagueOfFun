import { create } from "zustand";
import { publicAsset } from "@/game/assets/publicPath";
import { loadModel } from "@/game/assets/modelLoader";
import { loadTexture } from "@/game/animation/AnimatedModel";
import { defaultAssetRegistry } from "@/game/config/assets.config";
import { CHROMAS } from "@/stores/chromaStore";

/**
 * One-shot preload of everything the gameplay scenes actually touch on first
 * use — models, textures, audio buffers. Without this, the first cleaver
 * throw / chroma swap / sound effect each take 200-1500ms to fetch+decode and
 * the game stutters for ~10 seconds while everything trickles in.
 */

interface PreloadState {
  loaded: number;
  total: number;
  ready: boolean;
  errors: string[];
}

export const usePreloadStore = create<PreloadState>(() => ({
  loaded: 0,
  total: 0,
  ready: false,
  errors: [],
}));

let started = false;

export function preloadAll() {
  if (started) return;
  started = true;
  const items: { kind: "model" | "texture" | "audio"; path: string }[] = [];

  // Models from the registry
  for (const cfg of Object.values(defaultAssetRegistry)) {
    if (cfg && (cfg as any).type === "model") items.push({ kind: "model", path: (cfg as any).path });
  }
  // Animation source files for the player models
  for (const cfg of Object.values(defaultAssetRegistry)) {
    if (cfg && (cfg as any).type === "model" && (cfg as any).animationSources) {
      for (const src of Object.values((cfg as any).animationSources)) {
        if (src && (src as any).path) items.push({ kind: "model", path: (src as any).path });
      }
    }
  }
  // Hook chain
  items.push({ kind: "model", path: "/assets/models/champions/chain.fbx" });

  // Textures
  for (const c of CHROMAS) {
    if (c.texturePath) items.push({ kind: "texture", path: c.texturePath });
  }
  items.push({ kind: "texture", path: "/assets/effects/blood_streak.png" });

  // Audio files
  const audioPaths = [
    "/assets/sounds/Q1.mp3",
    "/assets/sounds/Q2.mp3",
    "/assets/sounds/Q3.mp3",
    "/assets/sounds/Q_HITS_DUMMY_1.mp3",
    "/assets/sounds/Q_HITS_DUMMY_2.mp3",
    "/assets/sounds/Q pull.mp3",
    "/assets/sounds/Thresh_Original_Q_0.ogg",
    "/assets/sounds/Thresh_Original_Q_1.ogg",
    "/assets/sounds/Thresh_Original_Q_2.ogg",
    "/assets/sounds/Quotes/Thresh_Original_Move_0.ogg",
    "/assets/sounds/Quotes/Thresh_Original_Move_2.ogg",
    "/assets/sounds/Quotes/Thresh_Original_Move_6.ogg",
    "/assets/sounds/Quotes/Thresh_Original_Move_9.ogg",
    "/assets/sounds/mundo/mundo_q.mp3",
    "/assets/sounds/mundo/mundo_q_impact.mp3",
    "/assets/sounds/mundo/flash.mp3",
    "/assets/sounds/mundo/wow.mp3",
    "/assets/sounds/mundo/haha.mp3",
    "/assets/sounds/mundo/mundo_quote.mp3",
  ];
  for (const p of audioPaths) items.push({ kind: "audio", path: p });

  // Dedupe (registry + animationSources can repeat the same .glb).
  const seen = new Set<string>();
  const unique = items.filter((i) => {
    if (seen.has(i.path)) return false;
    seen.add(i.path);
    return true;
  });

  usePreloadStore.setState({ loaded: 0, total: unique.length, ready: false, errors: [] });

  const tick = (path: string, err?: unknown) => {
    const s = usePreloadStore.getState();
    const errors = err ? [...s.errors, `${path}: ${String(err)}`] : s.errors;
    const loaded = s.loaded + 1;
    usePreloadStore.setState({ loaded, errors, ready: loaded >= s.total });
  };

  for (const item of unique) {
    const url = publicAsset(item.path);
    if (item.kind === "model") {
      loadModel(item.path)
        .then(() => tick(item.path))
        .catch((e) => tick(item.path, e));
    } else if (item.kind === "texture") {
      loadTexture(item.path)
        .then(() => tick(item.path))
        .catch((e) => tick(item.path, e));
    } else {
      // Audio — just fetch + decode so the buffer cache is warm.
      fetch(url)
        .then((r) => r.arrayBuffer())
        .then(() => tick(item.path))
        .catch((e) => tick(item.path, e));
    }
  }

  // Safety net: if everything errors, never block forever.
  if (unique.length === 0) usePreloadStore.setState({ ready: true });
}
