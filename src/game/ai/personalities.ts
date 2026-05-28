import type { Personality } from "@/types/game";
import type { AIConfig } from "@/game/config/ai.config";

/**
 * Personality modifiers — applied on top of the AIConfig at decision time.
 * Each modifier is a multiplier (1.0 = unchanged) or absolute delta noted in the field name.
 */
export interface PersonalityProfile {
  reactionMul: number;       // multiplies reactionDelayMs
  dodgeMul: number;          // multiplies dodgeChance
  flashEagernessMul: number; // multiplies flashChance and lowers hit-prob threshold
  mistakeMul: number;        // multiplies mistakeRate
  jukeMul: number;           // multiplies jukeFrequency
  flashHoldBias: number;     // -1 (always flash early) .. +1 (always hold flash)
  baitMul: number;           // multiplies baitChance
  fakeDodgeChance: number;   // 0..1 chance to fake a dodge then go the opposite way
}

export const PROFILES: Record<Personality, PersonalityProfile> = {
  coward:  { reactionMul: 0.85, dodgeMul: 1.1,  flashEagernessMul: 1.6, mistakeMul: 1.1, jukeMul: 1.0, flashHoldBias: -0.6, baitMul: 0.3, fakeDodgeChance: 0.05 },
  greedy:  { reactionMul: 1.05, dodgeMul: 0.9,  flashEagernessMul: 0.4, mistakeMul: 0.9, jukeMul: 0.8, flashHoldBias: +0.7, baitMul: 1.2, fakeDodgeChance: 0.1  },
  panic:   { reactionMul: 0.7,  dodgeMul: 1.0,  flashEagernessMul: 1.4, mistakeMul: 1.8, jukeMul: 1.4, flashHoldBias: -0.3, baitMul: 0.4, fakeDodgeChance: 0.2  },
  juker:   { reactionMul: 0.9,  dodgeMul: 1.15, flashEagernessMul: 0.8, mistakeMul: 0.9, jukeMul: 1.9, flashHoldBias: +0.2, baitMul: 0.8, fakeDodgeChance: 0.55 },
  smooth:  { reactionMul: 1.0,  dodgeMul: 0.85, flashEagernessMul: 0.7, mistakeMul: 0.6, jukeMul: 0.5, flashHoldBias:  0.0, baitMul: 0.6, fakeDodgeChance: 0.05 },
  pro:     { reactionMul: 0.75, dodgeMul: 1.2,  flashEagernessMul: 1.0, mistakeMul: 0.3, jukeMul: 1.1, flashHoldBias: +0.1, baitMul: 1.0, fakeDodgeChance: 0.35 },
  baiter:  { reactionMul: 1.0,  dodgeMul: 1.0,  flashEagernessMul: 0.9, mistakeMul: 0.6, jukeMul: 0.9, flashHoldBias: +0.3, baitMul: 1.8, fakeDodgeChance: 0.2  },
  faker:   { reactionMul: 0.85, dodgeMul: 1.05, flashEagernessMul: 0.8, mistakeMul: 0.5, jukeMul: 1.2, flashHoldBias: +0.1, baitMul: 0.7, fakeDodgeChance: 0.8  },
};

export interface DifficultyPreset {
  label: string;
  reactionDelayMs: number;
  dodgeChance: number;
  flashChance: number;
  mistakeRate: number;
  moveSpeed: number;
}

export const DIFFICULTY: Record<string, DifficultyPreset> = {
  easy:   { label: "Easy",   reactionDelayMs: 450, dodgeChance: 0.25, flashChance: 0.20, mistakeRate: 0.45, moveSpeed: 3.0 },
  normal: { label: "Normal", reactionDelayMs: 280, dodgeChance: 0.50, flashChance: 0.40, mistakeRate: 0.25, moveSpeed: 3.5 },
  hard:   { label: "Hard",   reactionDelayMs: 180, dodgeChance: 0.70, flashChance: 0.65, mistakeRate: 0.12, moveSpeed: 4.0 },
  pro:    { label: "Pro",    reactionDelayMs: 110, dodgeChance: 0.85, flashChance: 0.80, mistakeRate: 0.05, moveSpeed: 4.5 },
  insane: { label: "Insane", reactionDelayMs:  70, dodgeChance: 0.95, flashChance: 0.95, mistakeRate: 0.02, moveSpeed: 5.0 },
};

export function applyDifficulty(preset: DifficultyPreset, base: AIConfig): AIConfig {
  return {
    ...base,
    reactionDelayMs: preset.reactionDelayMs,
    dodgeChance: preset.dodgeChance,
    flashChance: preset.flashChance,
    mistakeRate: preset.mistakeRate,
    moveSpeed: preset.moveSpeed,
  };
}
