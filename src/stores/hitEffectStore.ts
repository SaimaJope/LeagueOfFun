import { create } from "zustand";

interface HitEffectState {
  /** Increments per triggered hit so VFX can fire once per event. */
  serial: number;
  /** World-space position of the most recent hit. */
  position: [number, number, number];
  /** Damage magnitude, used to scale the splatter (0..1). */
  intensity: number;
  trigger: (position: [number, number, number], intensity?: number) => void;
}

export const useHitEffectStore = create<HitEffectState>((set) => ({
  serial: 0,
  position: [0, 0, 0],
  intensity: 1,
  trigger: (position, intensity = 1) =>
    set((state) => ({
      serial: state.serial + 1,
      position,
      intensity,
    })),
}));
