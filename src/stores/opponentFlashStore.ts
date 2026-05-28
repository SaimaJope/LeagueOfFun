import { create } from "zustand";

/**
 * VFX-only mirror of the opponent's Flash. The networked "flash" message feeds
 * {@link trigger}; the {@link FlashVfx} renderer reads these fields to play the
 * same halo/particle burst the caster sees locally. No cooldown or gameplay
 * here — the opponent's position is reconciled separately via state messages.
 */
interface OpponentFlashState {
  castSerial: number;
  lastOrigin: [number, number, number];
  lastDestination: [number, number, number];
  lastCastAt: number;
  trigger: (
    origin: [number, number, number],
    destination: [number, number, number],
    now: number,
  ) => void;
  reset: () => void;
}

export const useOpponentFlashStore = create<OpponentFlashState>((set) => ({
  castSerial: 0,
  lastOrigin: [0, 0, 0],
  lastDestination: [0, 0, 0],
  lastCastAt: 0,
  trigger: (origin, destination, now) =>
    set((state) => ({
      castSerial: state.castSerial + 1,
      lastOrigin: origin,
      lastDestination: destination,
      lastCastAt: now,
    })),
  reset: () =>
    set({
      castSerial: 0,
      lastOrigin: [0, 0, 0],
      lastDestination: [0, 0, 0],
      lastCastAt: 0,
    }),
}));
