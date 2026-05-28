import type { AIMode, Personality } from "@/types/game";

export interface AIConfig {
  mode: AIMode;
  personality: Personality;
  reactionDelayMs: number;
  moveSpeed: number;
  acceleration: number;
  dodgeChance: number;
  flashChance: number;
  flashCooldownMs: number;
  flashRange: number;
  jukeFrequency: number;
  mistakeRate: number;
  pathChangeInterval: number;
  baitChance: number;
  stopChance: number;
  reverseChance: number;
  panicChance: number;
}

export const defaultAIConfig: AIConfig = {
  mode: "basicMover",
  personality: "smooth",
  reactionDelayMs: 220,
  moveSpeed: 3.5,
  acceleration: 14,
  dodgeChance: 0.5,
  flashChance: 0.4,
  flashCooldownMs: 15000,
  flashRange: 4.0,
  jukeFrequency: 0.4,
  mistakeRate: 0.2,
  pathChangeInterval: 1400,
  baitChance: 0.1,
  stopChance: 0.15,
  reverseChance: 0.15,
  panicChance: 0.1,
};
