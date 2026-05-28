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

/**
 * Mutable, non-reactive snapshot of the local cleaver projectile's world state.
 * CleaverAbility writes to this every frame; the PvP network layer reads it to
 * broadcast accurate cleaver positions to the opponent.
 */
export const cleaverProjectileState = {
  active: false,
  phase: "idle" as "idle" | "windup" | "flight",
  /** World position of the cleaver tip / center this frame. */
  worldX: 0,
  worldZ: 0,
  dirX: 1,
  dirZ: 0,
  /** performance.now() when the cast was accepted (Q press time). */
  startedAt: 0,
};

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
