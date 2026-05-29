import { create } from "zustand";

export type WallOrientation = "horizontal" | "vertical";
export type PvpRole = "none" | "host" | "client";
export type PvpPhase =
  | "lobby"
  | "connecting"
  | "ready"
  | "countdown"
  | "playing"
  | "intermission"
  | "shop"
  | "ended";

export interface PvpSettings {
  /** Multiplier on base move speed; 1 = stock, 3 = max. */
  moveSpeedMul: number;
  qCooldownMs: number;
  flashCooldownMs: number;
  /** Each cleaver hit deals 1 damage. 5 = five-hit kill. */
  startingHp: number;
  wallOrientation: WallOrientation;
  /** How many ward totems line the wall. 0 = none. */
  wardCount: number;
  /** Ward totem height as a multiple of the wall height. */
  wardSize: number;
}

export const DEFAULT_PVP_SETTINGS: PvpSettings = {
  moveSpeedMul: 1,
  qCooldownMs: 3000,
  flashCooldownMs: 20_000,
  startingHp: 5,
  wallOrientation: "vertical",
  wardCount: 5,
  wardSize: 0.55,
};

/** URF preset cooldowns — applied by the lobby's URF toggle. */
export const URF_QCD_MS = 1000;
export const URF_FLASH_CD_MS = 3000;

/** A death that just resolved a round (drives the announcer + gold on both peers). */
export interface RoundDeath {
  victim: "host" | "client";
  /** This death ended the game (the killer reached the win threshold). */
  final: boolean;
  /** This was the first kill of the game (first blood). */
  firstBlood: boolean;
}

/**
 * Authoritative round-flow snapshot. The host computes and broadcasts this on
 * every phase/round transition; both peers apply it verbatim so the match state
 * machine stays in lock-step. Economy (gold/items) is intentionally NOT here —
 * it's tracked locally per peer (see pvpEconomyStore).
 */
export interface RoundSnap {
  round: number;
  phase: Extract<PvpPhase, "countdown" | "playing" | "intermission" | "shop" | "ended">;
  roundWins: { host: number; client: number };
  firstBloodDone: boolean;
  winner: PvpRole | null;
  /** Set on the snapshot that resolves a round; null otherwise. */
  death: RoundDeath | null;
  /** When true, P1/P2 spawn sides are flipped (alternates each rematch). */
  sidesSwapped: boolean;
  /** Monotonic id so peers apply each snapshot (and each death) exactly once. */
  seq: number;
}

interface PvpState {
  role: PvpRole;
  phase: PvpPhase;
  /** Room code shown to the host / typed in by the client. */
  roomCode: string;
  /** Status text the lobby can render — "Waiting for friend…", "Connected!", etc. */
  status: string;
  settings: PvpSettings;
  /** Per-player chroma. P1 = host, P2 = client. */
  hostSkin: string;
  clientSkin: string;
  hp: { host: number; client: number };
  /** Per-player max HP (startingHp + Warmog's bonus). Mirrored via state packets. */
  maxHp: { host: number; client: number };
  winner: PvpRole | null;

  // ─── Best-of-three round flow ───────────────────────────────────────────
  round: number;
  roundWins: { host: number; client: number };
  firstBloodDone: boolean;
  /** Latest resolved death; consumers react when {@link lastDeathSeq} changes. */
  lastDeath: RoundDeath | null;
  lastDeathSeq: number;
  /** performance.now() when the current phase began locally (for UI timers). */
  phaseStartedAt: number;
  /** P1/P2 spawn sides flipped this game (mirrored via round snapshots). */
  sidesSwapped: boolean;
  /** Per-player "ready" state in the between-round shop. Both true = skip ahead. */
  shopReady: { host: boolean; client: boolean };

  setRole: (role: PvpRole) => void;
  setPhase: (phase: PvpPhase) => void;
  setRoomCode: (code: string) => void;
  setStatus: (status: string) => void;
  patchSettings: (patch: Partial<PvpSettings>) => void;
  setHostSkin: (id: string) => void;
  setClientSkin: (id: string) => void;
  damage: (target: "host" | "client", amount: number) => void;
  /** Set this player's own HP (used on round reset to apply per-peer max HP). */
  setHp: (target: "host" | "client", value: number) => void;
  setMaxHp: (target: "host" | "client", value: number) => void;
  /** Apply an authoritative round snapshot from the host. */
  applyRoundSnap: (snap: RoundSnap) => void;
  setShopReady: (who: "host" | "client", ready: boolean) => void;
  reset: () => void;
}

export const usePvpStore = create<PvpState>((set, get) => ({
  role: "none",
  phase: "lobby",
  roomCode: "",
  status: "",
  settings: DEFAULT_PVP_SETTINGS,
  hostSkin: "mundo_default",
  clientSkin: "hulk_green",
  hp: { host: DEFAULT_PVP_SETTINGS.startingHp, client: DEFAULT_PVP_SETTINGS.startingHp },
  maxHp: { host: DEFAULT_PVP_SETTINGS.startingHp, client: DEFAULT_PVP_SETTINGS.startingHp },
  winner: null,
  round: 1,
  roundWins: { host: 0, client: 0 },
  firstBloodDone: false,
  lastDeath: null,
  lastDeathSeq: 0,
  phaseStartedAt: 0,
  sidesSwapped: false,
  shopReady: { host: false, client: false },

  setRole: (role) => set({ role }),
  setPhase: (phase) => set({ phase, phaseStartedAt: performance.now() }),
  setRoomCode: (roomCode) => set({ roomCode }),
  setStatus: (status) => set({ status }),
  patchSettings: (patch) =>
    set((state) => {
      const settings = { ...state.settings, ...patch };
      // Keep current HP in sync with new starting HP only if the match hasn't started.
      const hp =
        state.phase === "lobby" || state.phase === "ready"
          ? { host: settings.startingHp, client: settings.startingHp }
          : state.hp;
      return { settings, hp };
    }),
  setHostSkin: (id) => set({ hostSkin: id }),
  setClientSkin: (id) => set({ clientSkin: id }),
  // Damage only clamps HP now. The round controller (host) watches HP for the
  // 0-hp death and drives round/game resolution via applyRoundSnap.
  damage: (target, amount) =>
    set((state) => ({
      hp: { ...state.hp, [target]: Math.max(0, state.hp[target] - amount) },
    })),
  setHp: (target, value) =>
    set((state) => ({ hp: { ...state.hp, [target]: Math.max(0, value) } })),
  setMaxHp: (target, value) =>
    set((state) => ({ maxHp: { ...state.maxHp, [target]: Math.max(1, value) } })),
  applyRoundSnap: (snap) =>
    set((state) => {
      const phaseChanged = state.phase !== snap.phase;
      const next: Partial<PvpState> = {
        round: snap.round,
        phase: snap.phase,
        roundWins: snap.roundWins,
        firstBloodDone: snap.firstBloodDone,
        winner: snap.winner,
        sidesSwapped: snap.sidesSwapped,
      };
      if (phaseChanged) {
        next.phaseStartedAt = performance.now();
        // "Ready" is per-shop; clear it on any phase transition.
        next.shopReady = { host: false, client: false };
      }
      if (snap.death && snap.seq > state.lastDeathSeq) {
        next.lastDeath = snap.death;
        next.lastDeathSeq = snap.seq;
      }
      return next;
    }),
  setShopReady: (who, ready) =>
    set((state) => ({ shopReady: { ...state.shopReady, [who]: ready } })),
  reset: () =>
    set({
      role: "none",
      phase: "lobby",
      roomCode: "",
      status: "",
      hp: { host: get().settings.startingHp, client: get().settings.startingHp },
      maxHp: { host: get().settings.startingHp, client: get().settings.startingHp },
      winner: null,
      round: 1,
      roundWins: { host: 0, client: 0 },
      firstBloodDone: false,
      lastDeath: null,
      lastDeathSeq: 0,
      sidesSwapped: false,
      shopReady: { host: false, client: false },
    }),
}));
