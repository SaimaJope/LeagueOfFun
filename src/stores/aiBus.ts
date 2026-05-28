import type { Vec3 } from "@/types/game";

/** Cross-frame signals between AI and ability systems. Mutated in place; no React subscription. */
export const aiBus = {
  /** Set when the dummy flashed during the current cast. Cleared on cast end. */
  flashedThisCast: false as boolean,
  /** Last flash blink, for visual effect. */
  lastFlash: null as { from: Vec3; to: Vec3; at: number } | null,
  /** Time the dummy's Flash is ready again (UI cooldown). */
  dummyFlashReadyAt: 0 as number,
};
