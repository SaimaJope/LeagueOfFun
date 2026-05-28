import { create } from "zustand";

export type Trainer = "hookTrainer" | "dodgeball" | "pvp";

const LS_KEY = "hooktrainer.trainer.v1";

function loadPersisted(): Trainer {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw === "dodgeball" || raw === "hookTrainer" || raw === "pvp") return raw;
  } catch {
    /* ignore */
  }
  return "hookTrainer";
}

function persist(t: Trainer) {
  try {
    localStorage.setItem(LS_KEY, t);
  } catch {
    /* ignore */
  }
}

interface TrainerState {
  trainer: Trainer;
  setTrainer: (t: Trainer) => void;
}

export const useTrainerStore = create<TrainerState>((set) => ({
  trainer: loadPersisted(),
  setTrainer: (t) => {
    persist(t);
    set({ trainer: t });
  },
}));
