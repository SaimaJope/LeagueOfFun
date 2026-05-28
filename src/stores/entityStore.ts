import { create } from "zustand";
import type { Vec3 } from "@/types/game";
import { PLAY_AREA_BOUND } from "@/game/config/playArea.config";

/**
 * Mutable, non-reactive entity state. We keep position/velocity outside the
 * normal store snapshots to avoid React re-rendering on every frame; consumers
 * read these refs directly inside useFrame.
 */
export interface MutableEntity {
  position: Vec3;
  velocity: Vec3;
  rotationY: number;
  alive: boolean;
  hitSerial: number;
}

export const playerEntity: MutableEntity = {
  position: [0, 0, 0],
  velocity: [0, 0, 0],
  rotationY: 0,
  alive: true,
  hitSerial: 0,
};

/** Networked PvP opponent — driven by remote-state messages, never by local input. */
export interface OpponentEntity extends MutableEntity {
  /** Last known cleaver projectile (mirrored from the network). null = not in flight. */
  cleaver: {
    px: number;
    pz: number;
    dirX: number;
    dirZ: number;
    distance: number;
    phase: "windup" | "flight";
    castStartedAt: number;
  } | null;
}

export const opponentEntity: OpponentEntity = {
  position: [0, 0, 0],
  velocity: [0, 0, 0],
  rotationY: 0,
  alive: true,
  hitSerial: 0,
  cleaver: null,
};

export const MAX_DUMMIES = 5;

export const dummyEntities: MutableEntity[] = Array.from({ length: MAX_DUMMIES }, (_, index) =>
  createDummyEntity(index),
);

export const dummyEntity = dummyEntities[0];

let activeDummyCount = 1;

export const playerControlState = {
  movementLockedUntil: 0,
  cancelMoveToken: 0,
  dashActive: false,
  faceTarget: null as MutableEntity | null,
  movementSpeedMultiplier: 1,
  animationSpeedMultiplier: 1,
};

interface DummyState {
  count: number;
  version: number;
  setCount: (count: number) => void;
  resetPositions: () => void;
}

export const useDummyStore = create<DummyState>((set, get) => ({
  count: activeDummyCount,
  version: 0,
  setCount: (count) => {
    activeDummyCount = clamp(Math.round(count), 1, MAX_DUMMIES);
    resetDummyPositions(activeDummyCount);
    set((s) => ({ count: activeDummyCount, version: s.version + 1 }));
  },
  resetPositions: () => {
    resetDummyPositions(get().count);
    set((s) => ({ version: s.version + 1 }));
  },
}));

export function getActiveDummies() {
  return dummyEntities.slice(0, activeDummyCount);
}

function createDummyEntity(index: number): MutableEntity {
  return {
    position: dummySpawnPosition(index),
    velocity: [0, 0, 0],
    rotationY: 0,
    alive: true,
    hitSerial: 0,
  };
}

function resetDummyPositions(count: number) {
  for (let i = 0; i < MAX_DUMMIES; i += 1) {
    const dummy = dummyEntities[i];
    dummy.position = i < count ? dummySpawnPosition(i, count) : [0, 0, 0];
    dummy.velocity = [0, 0, 0];
    dummy.rotationY = 0;
    dummy.alive = i < count;
    dummy.hitSerial = 0;
  }
}

function dummySpawnPosition(index: number, count = 1): Vec3 {
  if (count === 1) return [6, 0, 0];
  const radius = Math.min(8, PLAY_AREA_BOUND - 2);
  const angle = -Math.PI / 2 + (index / count) * Math.PI * 2;
  return [
    clamp(Math.cos(angle) * radius, -PLAY_AREA_BOUND, PLAY_AREA_BOUND),
    0,
    clamp(Math.sin(angle) * radius, -PLAY_AREA_BOUND, PLAY_AREA_BOUND),
  ];
}

interface AimState {
  aim: Vec3;
  setAim: (v: Vec3) => void;
}

export const useAimStore = create<AimState>((set) => ({
  aim: [10, 0, 0],
  setAim: (aim) => set({ aim }),
}));

function clamp(v: number, lo: number, hi: number) {
  return v < lo ? lo : v > hi ? hi : v;
}
