import { create } from "zustand";
import {
  GOLD_PER_MATCH,
  WARMOGS_BONUS_HP,
  type ItemId,
} from "@/game/config/pvpItems";

/**
 * Local (per-peer) PvP economy: this player's gold, owned items, and the
 * Youmuu active timers. Never networked directly — the opponent only learns
 * about effects that touch them (Frozen Mallet slow) via gameplay messages.
 */
interface PvpEconomyState {
  gold: number;
  owned: Record<ItemId, boolean>;
  /** performance.now() until which Youmuu's active move-speed buff is live. */
  youmuuActiveUntil: number;
  /** performance.now() at which Youmuu can be activated again. */
  youmuuReadyAt: number;

  addGold: (amount: number) => void;
  buy: (id: ItemId, cost: number) => boolean;
  has: (id: ItemId) => boolean;
  /** Extra max HP from owned items (Warmog's). */
  bonusHp: () => number;
  activateYoumuu: (activeUntil: number, readyAt: number) => void;
  /** Reset for a brand-new game (gold = starting, no items). */
  resetGame: () => void;
}

const NO_ITEMS: Record<ItemId, boolean> = {
  boots: false,
  frozen_mallet: false,
  warmogs: false,
  youmuu: false,
};

export const usePvpEconomyStore = create<PvpEconomyState>((set, get) => ({
  gold: GOLD_PER_MATCH,
  owned: { ...NO_ITEMS },
  youmuuActiveUntil: 0,
  youmuuReadyAt: 0,

  addGold: (amount) => set((s) => ({ gold: s.gold + amount })),
  buy: (id, cost) => {
    const s = get();
    if (s.owned[id] || s.gold < cost) return false;
    set({ gold: s.gold - cost, owned: { ...s.owned, [id]: true } });
    return true;
  },
  has: (id) => get().owned[id],
  bonusHp: () => (get().owned.warmogs ? WARMOGS_BONUS_HP : 0),
  activateYoumuu: (activeUntil, readyAt) =>
    set({ youmuuActiveUntil: activeUntil, youmuuReadyAt: readyAt }),
  resetGame: () =>
    set({
      gold: GOLD_PER_MATCH,
      owned: { ...NO_ITEMS },
      youmuuActiveUntil: 0,
      youmuuReadyAt: 0,
    }),
}));
