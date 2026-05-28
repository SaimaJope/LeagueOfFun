import type { Vector3Tuple } from "three";

export type Vec3 = Vector3Tuple;

export type HookResult = "hit" | "miss" | "flashed" | "juked" | "pending";

export interface EntityState {
  id: string;
  position: Vec3;
  velocity: Vec3;
  rotationY: number;
  alive: boolean;
}

export interface HookState {
  active: boolean;
  origin: Vec3;
  direction: Vec3;
  traveled: number;
  startedAt: number;
  cooldownUntil: number;
  castingUntil: number;
  lastResult: HookResult;
}

export type AIMode =
  | "standing"
  | "basicMover"
  | "sidestep"
  | "flashDodger"
  | "juker"
  | "human"
  | "pro";

export type Personality =
  | "coward"
  | "greedy"
  | "panic"
  | "juker"
  | "smooth"
  | "pro"
  | "baiter"
  | "faker";
