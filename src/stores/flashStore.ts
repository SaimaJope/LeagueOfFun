import { create } from "zustand";

interface FlashState {
  /** performance.now() time at which Flash is available again. */
  cooldownUntil: number;
  /** Increments for every accepted Flash so consumers can react once per cast. */
  castSerial: number;
  /** World-space origin where the most recent Flash started (for VFX). */
  lastOrigin: [number, number, number];
  /** World-space destination of the most recent Flash (for VFX). */
  lastDestination: [number, number, number];
  /** performance.now() time at which the most recent Flash was triggered. */
  lastCastAt: number;
  trigger: (
    origin: [number, number, number],
    destination: [number, number, number],
    cooldownEndsAt: number,
    now: number,
  ) => void;
  reset: () => void;
}

export const useFlashStore = create<FlashState>((set) => ({
  cooldownUntil: 0,
  castSerial: 0,
  lastOrigin: [0, 0, 0],
  lastDestination: [0, 0, 0],
  lastCastAt: 0,
  trigger: (origin, destination, cooldownEndsAt, now) =>
    set((state) => ({
      cooldownUntil: cooldownEndsAt,
      castSerial: state.castSerial + 1,
      lastOrigin: origin,
      lastDestination: destination,
      lastCastAt: now,
    })),
  reset: () =>
    set({
      cooldownUntil: 0,
      castSerial: 0,
      lastOrigin: [0, 0, 0],
      lastDestination: [0, 0, 0],
      lastCastAt: 0,
    }),
}));
