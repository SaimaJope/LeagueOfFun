import { create } from "zustand";
import { loadModel } from "@/game/assets/modelLoader";
import { loadTexture } from "@/game/animation/AnimatedModel";
import { warmAudioBuffer } from "@/game/audio/mundoAudio";
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

/** Max time the loading screen blocks before letting the user in regardless. */
const MAX_PRELOAD_MS = 9000;

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
  items.push({ kind: "model", path: "/assets/models/environment/vision_ward.glb" });
  items.push({ kind: "model", path: "/assets/models/environment/environment_rift_final.glb" });

  // Textures
  for (const c of CHROMAS) {
    if (c.texturePath) items.push({ kind: "texture", path: c.texturePath });
  }
  items.push({ kind: "texture", path: "/assets/effects/blood_streak.png" });
  items.push({ kind: "texture", path: "/assets/effects/youmuu_petal.png" });

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
    "/assets/sounds/mundo/death.mp3",
    // PvP match audio (announcer, UI, items) so first cast / round / buy is smooth.
    "/assets/sounds/Accept.mp3",
    "/assets/sounds/countdown.mp3",
    "/assets/sounds/Dance.mp3",
    "/assets/sounds/items/youmuus.ogg",
    "/assets/sounds/ui/69_ui-generic_button_click_01.wav",
    "/assets/sounds/ui/81_ui-store_buy_01.wav",
    "/assets/sounds/ui/10_scn1_btn_1.wav",
    "/assets/sounds/announcer/first_blood.ogg",
    "/assets/sounds/announcer/you_have_been_slaind.ogg",
    "/assets/sounds/announcer/kill1.ogg",
    "/assets/sounds/announcer/kill2.ogg",
    "/assets/sounds/announcer/kill3.ogg",
    "/assets/sounds/announcer/victory.ogg",
    "/assets/sounds/announcer/defeat.ogg",
  ];
  for (const p of audioPaths) items.push({ kind: "audio", path: p });

  // Dedupe (registry + animationSources can repeat the same .glb).
  const seen = new Set<string>();
  const unique = items.filter((i) => {
    if (seen.has(i.path)) return false;
    seen.add(i.path);
    return true;
  });

  // Only visual assets (models + textures) gate the loading screen. Audio is
  // warmed in the BACKGROUND — decodeAudioData on a pre-gesture AudioContext can
  // hang on some browsers (Safari/iOS), and we must never let that block load.
  const blocking = unique.filter((i) => i.kind !== "audio");
  const audio = unique.filter((i) => i.kind === "audio");

  usePreloadStore.setState({ loaded: 0, total: blocking.length, ready: false, errors: [] });

  const finish = () => {
    if (!usePreloadStore.getState().ready) usePreloadStore.setState({ ready: true });
  };

  const tick = (path: string, err?: unknown) => {
    const s = usePreloadStore.getState();
    const errors = err ? [...s.errors, `${path}: ${String(err)}`] : s.errors;
    const loaded = s.loaded + 1;
    usePreloadStore.setState({ loaded, errors, ready: loaded >= s.total });
  };

  for (const item of blocking) {
    if (item.kind === "model") {
      loadModel(item.path)
        .then(() => tick(item.path))
        .catch((e) => tick(item.path, e));
    } else {
      loadTexture(item.path)
        .then(() => tick(item.path))
        .catch((e) => tick(item.path, e));
    }
  }

  // Warm audio buffers off the critical path (fire-and-forget).
  for (const item of audio) {
    warmAudioBuffer(item.path).catch(() => {});
  }

  // Hard safety net: never keep the loading screen up longer than this, even if
  // an asset stalls on a slow connection — remaining assets stream on demand.
  if (blocking.length === 0) finish();
  else window.setTimeout(finish, MAX_PRELOAD_MS);
}
