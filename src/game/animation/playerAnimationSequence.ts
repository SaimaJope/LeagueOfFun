import type { ActionKey } from "@/game/animation/clipMatcher";

export interface PlayerAnimationStep {
  action: ActionKey;
  durationMs: number;
  timeScale?: number;
}

export interface PlayerAnimationFrame {
  action: ActionKey;
  token: number;
  timeScale: number;
}

const state = {
  sequenceId: 0,
  startedAt: 0,
  steps: [] as PlayerAnimationStep[],
};

export function playPlayerAnimationSequence(steps: PlayerAnimationStep[]) {
  state.sequenceId += 1;
  state.startedAt = performance.now();
  state.steps = steps.filter((step) => step.durationMs > 0);
}

export function clearPlayerAnimationSequence() {
  if (state.steps.length === 0) return;
  state.sequenceId += 1;
  state.startedAt = 0;
  state.steps = [];
}

export function getPlayerAnimationFrame(now = performance.now()): PlayerAnimationFrame | null {
  if (state.steps.length === 0) return null;

  let elapsed = now - state.startedAt;
  for (let i = 0; i < state.steps.length; i += 1) {
    const step = state.steps[i];
    if (elapsed < step.durationMs) {
      return {
        action: step.action,
        token: state.sequenceId * 100 + i,
        timeScale: step.timeScale ?? 1,
      };
    }
    elapsed -= step.durationMs;
  }

  return null;
}
