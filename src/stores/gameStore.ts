import { create } from "zustand";
import type { AIConfig } from "@/game/config/ai.config";
import { defaultAIConfig } from "@/game/config/ai.config";
import type { HookConfig } from "@/game/config/hook.config";
import { defaultHookConfig } from "@/game/config/hook.config";
import type { HookResult, Vec3 } from "@/types/game";

export interface HookCastInfo {
  origin: Vec3;
  direction: Vec3;
  startedAt: number;
  castDelayMs: number;
  speed: number;
  width: number;
  range: number;
}

export interface ScoreState {
  cast: number;
  hit: number;
  streak: number;
  bestStreak: number;
  flashPredicted: number;
  nearMisses: number;
  totalMissDistance: number;
}

export type GameMode = "free" | "prediction" | "flashPred" | "pathRead";

export interface GameModeConfig {
  mode: GameMode;
  hookLimit: number | null;
  flashBonus: number;
  finished: boolean;
  finalScore: number;
}

export interface AnalysisSnapshot {
  result: HookResult;
  castOrigin: Vec3;
  direction: Vec3;
  dummyAtCast: Vec3;
  dummyAtImpact: Vec3;
  dummyFinal: Vec3;
  flashAvailable: boolean;
  flashUsed: boolean;
  missDistance: number;
  timeToImpactMs: number;
  correctAimPoint: Vec3;
}

export interface HookSensorState {
  phase: "idle" | "windup" | "flight";
  castStartedAt: number | null;
  castDelayMs: number;
  origin: Vec3;
  direction: Vec3;
  speed: number;
  range: number;
  width: number;
}

interface GameState {
  hookConfig: HookConfig;
  aiConfig: AIConfig;
  hook: {
    casting: boolean;
    active: boolean;
    cooldownUntil: number;
    castInfo: HookCastInfo | null;
    lastResult: HookResult;
  };
  /** Mutable, read by AI every frame. NOT a reactive source — mutate in place. */
  hookSensor: HookSensorState;
  score: ScoreState;
  lastAnalysis: AnalysisSnapshot | null;
  gameMode: GameModeConfig;
  bestScores: Record<GameMode, number>;
  devMode: {
    freezeDummies: boolean;
  };
  showAssetManager: boolean;
  showSettings: boolean;

  setHookConfig: (patch: Partial<HookConfig>) => void;
  setAIConfig: (patch: Partial<AIConfig>) => void;
  startCast: (info: HookCastInfo) => void;
  launchHook: () => void;
  endHook: (result: HookResult, analysis?: AnalysisSnapshot | null) => void;
  resetDrill: () => void;
  setGameMode: (mode: GameMode) => void;
  setFreezeDummies: (freeze: boolean) => void;
  toggleFreezeDummies: () => void;
  toggleAssetManager: () => void;
  toggleSettings: () => void;
}

const MODE_DEFAULTS: Record<GameMode, GameModeConfig> = {
  free:       { mode: "free",       hookLimit: null, flashBonus: 0,  finished: false, finalScore: 0 },
  prediction: { mode: "prediction", hookLimit: 20,   flashBonus: 10, finished: false, finalScore: 0 },
  flashPred:  { mode: "flashPred",  hookLimit: 15,   flashBonus: 25, finished: false, finalScore: 0 },
  pathRead:   { mode: "pathRead",   hookLimit: 20,   flashBonus: 5,  finished: false, finalScore: 0 },
};

const BEST_LS_KEY = "hooktrainer.bestScores.v1";
function loadBest(): Record<GameMode, number> {
  try {
    const raw = localStorage.getItem(BEST_LS_KEY);
    if (raw) return { free: 0, prediction: 0, flashPred: 0, pathRead: 0, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return { free: 0, prediction: 0, flashPred: 0, pathRead: 0 };
}
function saveBest(b: Record<GameMode, number>) {
  try { localStorage.setItem(BEST_LS_KEY, JSON.stringify(b)); } catch { /* ignore */ }
}

export const useGameStore = create<GameState>((set) => ({
  hookConfig: defaultHookConfig,
  aiConfig: defaultAIConfig,
  hook: {
    casting: false,
    active: false,
    cooldownUntil: 0,
    castInfo: null,
    lastResult: "pending",
  },
  hookSensor: {
    phase: "idle",
    castStartedAt: null,
    castDelayMs: defaultHookConfig.castDelayMs,
    origin: [0, 0, 0],
    direction: [1, 0, 0],
    speed: defaultHookConfig.speed,
    range: defaultHookConfig.range,
    width: defaultHookConfig.width,
  },
  score: {
    cast: 0,
    hit: 0,
    streak: 0,
    bestStreak: 0,
    flashPredicted: 0,
    nearMisses: 0,
    totalMissDistance: 0,
  },
  lastAnalysis: null,
  gameMode: MODE_DEFAULTS.free,
  bestScores: loadBest(),
  devMode: {
    freezeDummies: false,
  },
  showAssetManager: false,
  showSettings: false,

  setHookConfig: (patch) =>
    set((s) => ({ hookConfig: { ...s.hookConfig, ...patch } })),
  setAIConfig: (patch) =>
    set((s) => ({ aiConfig: { ...s.aiConfig, ...patch } })),

  startCast: (info) =>
    set((s) => ({
      hook: { ...s.hook, casting: true, active: false, castInfo: info },
    })),
  launchHook: () =>
    set((s) => ({
      hook: { ...s.hook, casting: false, active: true },
      score: { ...s.score, cast: s.score.cast + 1 },
    })),
  endHook: (result, analysis = null) =>
    set((s) => {
      const isHit = result === "hit";
      const newStreak = isHit ? s.score.streak + 1 : 0;
      const newScore = {
        ...s.score,
        hit: s.score.hit + (isHit ? 1 : 0),
        streak: newStreak,
        bestStreak: Math.max(s.score.bestStreak, newStreak),
        totalMissDistance: s.score.totalMissDistance + (analysis?.missDistance ?? 0),
        nearMisses:
          s.score.nearMisses + (!isHit && analysis && analysis.missDistance < 1 ? 1 : 0),
        flashPredicted:
          s.score.flashPredicted + (analysis?.flashUsed && result !== "flashed" ? 1 : 0),
      };

      // Game-mode end check
      let mode = s.gameMode;
      let bests = s.bestScores;
      if (mode.hookLimit !== null && newScore.cast >= mode.hookLimit && !mode.finished) {
        const final = computeModeScore(newScore, mode);
        mode = { ...mode, finished: true, finalScore: final };
        if (final > (bests[mode.mode] ?? 0)) {
          bests = { ...bests, [mode.mode]: final };
          saveBest(bests);
        }
      }

      return {
        hook: {
          ...s.hook,
          active: false,
          casting: false,
          castInfo: null,
          cooldownUntil: performance.now() + s.hookConfig.cooldownMs,
          lastResult: result,
        },
        score: newScore,
        gameMode: mode,
        bestScores: bests,
        lastAnalysis: analysis,
      };
    }),
  resetDrill: () =>
    set((s) => ({
      hook: {
        casting: false,
        active: false,
        cooldownUntil: 0,
        castInfo: null,
        lastResult: "pending",
      },
      score: {
        cast: 0,
        hit: 0,
        streak: 0,
        bestStreak: 0,
        flashPredicted: 0,
        nearMisses: 0,
        totalMissDistance: 0,
      },
      lastAnalysis: null,
      gameMode: { ...MODE_DEFAULTS[s.gameMode.mode] },
    })),
  setGameMode: (mode) =>
    set((s) => ({
      gameMode: { ...MODE_DEFAULTS[mode] },
      score: { cast: 0, hit: 0, streak: 0, bestStreak: 0, flashPredicted: 0, nearMisses: 0, totalMissDistance: 0 },
      lastAnalysis: null,
      hook: { ...s.hook, casting: false, active: false, cooldownUntil: 0, castInfo: null, lastResult: "pending" },
    })),
  setFreezeDummies: (freeze) =>
    set((s) => ({ devMode: { ...s.devMode, freezeDummies: freeze } })),
  toggleFreezeDummies: () =>
    set((s) => ({ devMode: { ...s.devMode, freezeDummies: !s.devMode.freezeDummies } })),
  toggleAssetManager: () => set((s) => ({ showAssetManager: !s.showAssetManager })),
  toggleSettings: () => set((s) => ({ showSettings: !s.showSettings })),
}));

function computeModeScore(score: ScoreState, mode: GameModeConfig): number {
  const accuracy = score.cast > 0 ? score.hit / score.cast : 0;
  const base = score.hit * 100;
  const flash = score.flashPredicted * mode.flashBonus;
  const streakBonus = score.bestStreak * 25;
  const nearMissBonus = score.nearMisses * 5;
  return Math.round(base + flash + streakBonus + nearMissBonus + accuracy * 100);
}
