/**
 * PvP shop items + match economy constants. Items are owned locally per peer
 * (see pvpEconomyStore); their gameplay effects are applied client-side and,
 * where they affect the opponent (Frozen Mallet slow), ride along on the
 * existing network hit/state messages.
 */

export type ItemId = "boots" | "frozen_mallet" | "warmogs" | "youmuu";

export interface ItemDef {
  id: ItemId;
  name: string;
  cost: number;
  /** Short shop blurb. */
  desc: string;
  /** true for click-to-activate items (Youmuu). Passives apply on purchase. */
  active?: boolean;
}

export const PVP_ITEMS: ItemDef[] = [
  {
    id: "boots",
    name: "Boots of Speed",
    cost: 500,
    desc: "+15% Movement Speed",
  },
  {
    id: "frozen_mallet",
    name: "Frozen Mallet",
    cost: 800,
    desc: "Your cleaver slows the enemy by 50% for 1s (subtle blue chill).",
  },
  {
    id: "warmogs",
    name: "Warmog's Armor",
    cost: 800,
    desc: "+2 Max HP each round.",
  },
  {
    id: "youmuu",
    name: "Youmuu's Ghostblade",
    cost: 600, // not specified by design — chosen default.
    desc: "Active: +35% Movement Speed for 4s.",
    active: true,
  },
];

export function itemDef(id: ItemId): ItemDef {
  const def = PVP_ITEMS.find((i) => i.id === id);
  if (!def) throw new Error(`Unknown PvP item: ${id}`);
  return def;
}

// ─── Economy ────────────────────────────────────────────────────────────────
/** Gold each player starts the game with. */
export const GOLD_PER_MATCH = 500;
/** Gold awarded to the killer for each round won (kill). */
export const GOLD_PER_KILL = 200;
/** Participation gold both players get each round, win or lose, so everyone
 *  can keep shopping (more items = more fun). */
export const GOLD_PER_ROUND = 300;

// ─── Item effect tuning ───────────────────────────────────────────────────────
export const BOOTS_MS_MULT = 1.15;
export const WARMOGS_BONUS_HP = 2;
export const FROZEN_MALLET_SLOW_MULT = 0.5;
export const FROZEN_MALLET_SLOW_MS = 1000;
export const YOUMUU_MS_MULT = 1.35;
export const YOUMUU_DURATION_MS = 4000;
export const YOUMUU_COOLDOWN_MS = 15_000;

// ─── Round flow timing ────────────────────────────────────────────────────────
/** First side to this many round wins takes the game (race to 3). */
export const ROUND_WINS_TO_WIN = 3;
/** Max rounds in a game (best of 5). */
export const MAX_ROUNDS = 5;
/** Pre-round countdown (shows 5→1). */
export const COUNTDOWN_MS = 5000;
/** Pause after a death before the shop opens (lets the announcer land). */
export const INTERMISSION_MS = 4000;
/** Shop buy window between rounds. */
export const SHOP_MS = 15_000;
