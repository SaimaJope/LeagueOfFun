import { create } from "zustand";

export type Trainer = "hookTrainer" | "dodgeball" | "pvp";

const LS_KEY = "hooktrainer.trainer.v1";
const SHOW_TRAINING_MODES_KEY = "leagueoffun.showTrainingModes.v1";
const DEFAULT_TRAINER: Trainer = "pvp";

export function areTrainingModesVisible() {
  if (typeof window === "undefined") return false;
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get("modes") === "all" || params.get("training") === "1") return true;
    return window.localStorage.getItem(SHOW_TRAINING_MODES_KEY) === "1";
  } catch {
    return false;
  }
}

function loadPersisted(): Trainer {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw === "pvp") return "pvp";
    if (areTrainingModesVisible() && (raw === "dodgeball" || raw === "hookTrainer")) return raw;
  } catch {
    /* ignore */
  }
  return DEFAULT_TRAINER;
}

function persist(t: Trainer) {
  try {
    localStorage.setItem(LS_KEY, t);
  } catch {
    /* ignore */
  }
}

function normalizeTrainer(t: Trainer): Trainer {
  if (t === "pvp" || areTrainingModesVisible()) return t;
  return DEFAULT_TRAINER;
}

interface TrainerState {
  trainer: Trainer;
  setTrainer: (t: Trainer) => void;
}

export const useTrainerStore = create<TrainerState>((set) => ({
  trainer: loadPersisted(),
  setTrainer: (t) => {
    const next = normalizeTrainer(t);
    persist(next);
    set({ trainer: next });
  },
}));
