import { send } from "@/game/network/peerNetwork";
import { usePvpStore, type PvpRole, type RoundSnap } from "@/stores/pvpStore";
import { usePvpEconomyStore } from "@/stores/pvpEconomyStore";
import { ROUND_WINS_TO_WIN, MAX_ROUNDS } from "@/game/config/pvpItems";

/**
 * Host-authoritative best-of-three round flow. The host calls these to advance
 * the match; each builds a {@link RoundSnap}, applies it locally, and broadcasts
 * it so the client mirrors the exact same state. The client never calls these —
 * it only applies incoming snapshots (see PvpMatchController).
 */

let snapSeq = 0;

function emit(partial: Omit<RoundSnap, "seq">) {
  snapSeq += 1;
  const snap: RoundSnap = { ...partial, seq: snapSeq };
  usePvpStore.getState().applyRoundSnap(snap);
  send({ type: "round", snap });
}

/** Re-sync settings/skins, then kick off round 1 with the pre-round countdown. */
export function hostStartGame() {
  const s = usePvpStore.getState();
  usePvpEconomyStore.getState().resetGame();
  send({ type: "settings", settings: s.settings, hostSkin: s.hostSkin, clientSkin: s.clientSkin });
  emit({
    round: 1,
    phase: "countdown",
    roundWins: { host: 0, client: 0 },
    firstBloodDone: false,
    winner: null,
    death: null,
  });
}

/** Countdown finished → fight. */
export function hostBeginRound() {
  const s = usePvpStore.getState();
  if (s.phase !== "countdown") return;
  emit({
    round: s.round,
    phase: "playing",
    roundWins: s.roundWins,
    firstBloodDone: s.firstBloodDone,
    winner: null,
    death: null,
  });
}

/**
 * A champion hit 0 HP → award the round. Non-final deaths go to a short
 * intermission (so the announcer lands) before the shop opens; the final death
 * ends the game.
 */
export function hostResolveDeath(victim: "host" | "client") {
  const s = usePvpStore.getState();
  if (s.phase !== "playing") return;
  const killer: "host" | "client" = victim === "host" ? "client" : "host";
  const roundWins = { ...s.roundWins, [killer]: s.roundWins[killer] + 1 };
  const firstBlood = !s.firstBloodDone;
  const final = roundWins[killer] >= ROUND_WINS_TO_WIN || s.round >= MAX_ROUNDS;
  emit({
    round: s.round,
    phase: final ? "ended" : "intermission",
    roundWins,
    firstBloodDone: true,
    winner: final ? (killer as PvpRole) : null,
    death: { victim, final, firstBlood },
  });
}

/** Intermission elapsed → open the shop. */
export function hostOpenShop() {
  const s = usePvpStore.getState();
  if (s.phase !== "intermission") return;
  emit({
    round: s.round,
    phase: "shop",
    roundWins: s.roundWins,
    firstBloodDone: s.firstBloodDone,
    winner: null,
    death: null,
  });
}

/** Shop window closed → next round countdown. */
export function hostBeginNextRound() {
  const s = usePvpStore.getState();
  if (s.phase !== "shop") return;
  emit({
    round: s.round + 1,
    phase: "countdown",
    roundWins: s.roundWins,
    firstBloodDone: s.firstBloodDone,
    winner: null,
    death: null,
  });
}

/** Rematch after a finished game — fresh series from round 1. */
export function hostRematch() {
  const s = usePvpStore.getState();
  usePvpEconomyStore.getState().resetGame();
  send({ type: "settings", settings: s.settings, hostSkin: s.hostSkin, clientSkin: s.clientSkin });
  emit({
    round: 1,
    phase: "countdown",
    roundWins: { host: 0, client: 0 },
    firstBloodDone: false,
    winner: null,
    death: null,
  });
}
