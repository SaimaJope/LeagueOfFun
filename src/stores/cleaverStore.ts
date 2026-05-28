import { create } from "zustand";

interface CleaverState {
  /** performance.now() time at which the current cast (if any) finishes its windup. */
  castingUntil: number;
  /** performance.now() time at which Q is available again. */
  cooldownUntil: number;
  /** Direction Mundo should face when this cast starts. */
  castFaceAngle: number;
  /** Increments for every accepted cast so consumers can react once per Q. */
  castSerial: number;
  startCast: (windupEndsAt: number, cooldownEndsAt: number, faceAngle: number) => void;
  endCast: () => void;
  reset: () => void;
}

export const useCleaverStore = create<CleaverState>((set) => ({
  castingUntil: 0,
  cooldownUntil: 0,
  castFaceAngle: 0,
  castSerial: 0,
  startCast: (windupEndsAt, cooldownEndsAt, faceAngle) =>
    set((state) => ({
      castingUntil: windupEndsAt,
      cooldownUntil: cooldownEndsAt,
      castFaceAngle: faceAngle,
      castSerial: state.castSerial + 1,
    })),
  endCast: () => set({ castingUntil: 0 }),
  reset: () => set({ castingUntil: 0, cooldownUntil: 0, castFaceAngle: 0, castSerial: 0 }),
}));
