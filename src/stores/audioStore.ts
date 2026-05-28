import { create } from "zustand";

const LS_KEY = "leagueoffun.audio.master.v1";

function loadPersisted(): number {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw == null) return 0.8;
    const n = Number(raw);
    return Number.isFinite(n) ? clamp01(n) : 0.8;
  } catch {
    return 0.8;
  }
}

function persist(v: number) {
  try {
    localStorage.setItem(LS_KEY, String(v));
  } catch {
    /* ignore */
  }
}

interface AudioState {
  master: number;
  setMaster: (v: number) => void;
}

export const useAudioStore = create<AudioState>((set) => ({
  master: loadPersisted(),
  setMaster: (v) => {
    const clamped = clamp01(v);
    persist(clamped);
    set({ master: clamped });
  },
}));

/** Imperative getter for use inside audio playback paths (no React subscription). */
export function getMasterVolume() {
  return useAudioStore.getState().master;
}

function clamp01(v: number) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
