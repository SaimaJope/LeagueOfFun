export const PLAY_AREA_BOUND = 12;
export const PLAY_AREA_SIZE = PLAY_AREA_BOUND * 2;
export const LEAGUE_UNITS_PER_WORLD_UNIT = 100;

export function leagueUnits(value: number) {
  return value / LEAGUE_UNITS_PER_WORLD_UNIT;
}
