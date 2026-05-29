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
  /** Dev mode: infinite gold, shop on demand (P), right-click to sell. */
  dev: boolean;
  /** Whether the dev shop overlay is currently open. */
  devShopOpen: boolean;

  addGold: (amount: number) => void;
  /** Buy an item. In dev mode it's free. Returns true if newly acquired. */
  buy: (id: ItemId, cost: number) => boolean;
  /** Sell (remove) an owned item — dev mode only. */
  sell: (id: ItemId) => void;
  has: (id: ItemId) => boolean;
  /** Extra max HP from owned items (Warmog's). */
  bonusHp: () => number;
  activateYoumuu: (activeUntil: number, readyAt: number) => void;
  enableDev: () => void;
  toggleDevShop: () => void;
  /** Reset for a brand-new game (gold = starting, no items). Keeps dev flags. */
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
  dev: false,
  devShopOpen: false,

  addGold: (amount) => set((s) => ({ gold: s.gold + amount })),
  buy: (id, cost) => {
    const s = get();
    if (s.owned[id]) return false;
    if (s.dev) {
      set({ owned: { ...s.owned, [id]: true } });
      return true;
    }
    if (s.gold < cost) return false;
    set({ gold: s.gold - cost, owned: { ...s.owned, [id]: true } });
    return true;
  },
  sell: (id) => {
    const s = get();
    if (!s.dev || !s.owned[id]) return;
    set({ owned: { ...s.owned, [id]: false } });
  },
  has: (id) => get().owned[id],
  bonusHp: () => (get().owned.warmogs ? WARMOGS_BONUS_HP : 0),
  activateYoumuu: (activeUntil, readyAt) =>
    set({ youmuuActiveUntil: activeUntil, youmuuReadyAt: readyAt }),
  enableDev: () => set({ dev: true }),
  toggleDevShop: () => set((s) => ({ devShopOpen: !s.devShopOpen })),
  resetGame: () =>
    set({
      gold: GOLD_PER_MATCH,
      owned: { ...NO_ITEMS },
      youmuuActiveUntil: 0,
      youmuuReadyAt: 0,
    }),
}));
