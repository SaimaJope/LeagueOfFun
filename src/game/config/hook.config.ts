import { leagueUnits } from "@/game/config/playArea.config";

export interface HookConfig {
  range: number;
  speed: number;
  width: number;
  castDelayMs: number;
  cooldownMs: number;
  maxTravelTimeMs: number;
  recastDelayMs: number;
  recastWindowMs: number;
  recastDashSpeed: number;
  showAimLine: boolean;
  showRangeCircle: boolean;
  showPostCastLine: boolean;
  showCorrectAimPoint: boolean;
  pullTargetOnHit: boolean;
}

// Thresh Q wiki data: 1100 range, 1900 outgoing missile speed, 140 listed width, 0.5s cast time.
// Default missile speed is tuned slightly below the raw 19u/s value because the simulator screen scale made it read too fast.
// The recast dash uses the second listed Q speed value, 1400.

export const defaultHookConfig: HookConfig = {
  range: leagueUnits(1100),
  speed: leagueUnits(1600),
  width: leagueUnits(70), // half of the 140-unit listed missile width
  castDelayMs: 500,
  cooldownMs: 2000,
  maxTravelTimeMs: 3000,
  recastDelayMs: 500,
  recastWindowMs: 2000,
  recastDashSpeed: leagueUnits(750),
  showAimLine: true,
  showRangeCircle: true,
  showPostCastLine: true,
  showCorrectAimPoint: false,
  pullTargetOnHit: true,
};
