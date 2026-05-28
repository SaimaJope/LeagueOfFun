import { create } from "zustand";

export type WallOrientation = "horizontal" | "vertical";
export type PvpRole = "none" | "host" | "client";
export type PvpPhase = "lobby" | "connecting" | "ready" | "playing" | "ended";

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
  winner: PvpRole | null;

  setRole: (role: PvpRole) => void;
  setPhase: (phase: PvpPhase) => void;
  setRoomCode: (code: string) => void;
  setStatus: (status: string) => void;
  patchSettings: (patch: Partial<PvpSettings>) => void;
  setHostSkin: (id: string) => void;
  setClientSkin: (id: string) => void;
  damage: (target: "host" | "client", amount: number) => void;
  resetMatch: () => void;
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
  winner: null,

  setRole: (role) => set({ role }),
  setPhase: (phase) => set({ phase }),
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
  damage: (target, amount) =>
    set((state) => {
      const next = Math.max(0, state.hp[target] - amount);
      const hp = { ...state.hp, [target]: next };
      let winner = state.winner;
      let phase = state.phase;
      if (next === 0 && phase === "playing") {
        winner = target === "host" ? "client" : "host";
        phase = "ended";
      }
      return { hp, winner, phase };
    }),
  resetMatch: () => {
    const s = get().settings;
    set({
      hp: { host: s.startingHp, client: s.startingHp },
      winner: null,
      phase: "playing",
    });
  },
  reset: () =>
    set({
      role: "none",
      phase: "lobby",
      roomCode: "",
      status: "",
      hp: { host: get().settings.startingHp, client: get().settings.startingHp },
      winner: null,
    }),
}));
