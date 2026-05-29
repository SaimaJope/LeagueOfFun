import { useEffect, useRef } from "react";
import { usePvpStore } from "@/stores/pvpStore";
import { usePvpEconomyStore } from "@/stores/pvpEconomyStore";
import { subscribe } from "@/game/network/peerNetwork";
import {
  hostBeginNextRound,
  hostBeginRound,
  hostOpenShop,
  hostResolveDeath,
} from "@/game/network/pvpMatch";
import {
  COUNTDOWN_MS,
  GOLD_PER_KILL,
  INTERMISSION_MS,
  SHOP_MS,
} from "@/game/config/pvpItems";
import {
  announceDefeat,
  announceFirstBlood,
  announceKill,
  announceSlain,
  announceVictory,
} from "@/game/audio/announcer";

/**
 * Non-visual PvP match brain. On the host it runs the round-flow timers and
 * watches HP for deaths; on both peers it applies incoming round snapshots and
 * reacts to resolved deaths (gold + announcer). Mounted whenever trainer=pvp.
 */
export function PvpMatchController() {
  const role = usePvpStore((s) => s.role);
  const phase = usePvpStore((s) => s.phase);
  const round = usePvpStore((s) => s.round);
  const lastDeathSeq = usePvpStore((s) => s.lastDeathSeq);

  const isHost = role === "host";

  // ─── Apply authoritative snapshots from the host (client side) ─────────────
  // The host resets its own economy in hostStartGame/hostRematch; the client
  // mirrors that here BEFORE applying the snapshot, so PvpSync's round-reset
  // sees the cleared item set (no leftover Warmog HP into a fresh game).
  useEffect(() => {
    return subscribe((msg) => {
      if (msg.type !== "round") return;
      const snap = msg.snap;
      const gameStart =
        snap.phase === "countdown" &&
        snap.round === 1 &&
        snap.roundWins.host === 0 &&
        snap.roundWins.client === 0;
      if (gameStart) usePvpEconomyStore.getState().resetGame();
      usePvpStore.getState().applyRoundSnap(snap);
    });
  }, []);

  // ─── React to a resolved death: gold + announcer (both peers) ──────────────
  const reactedDeathRef = useRef(0);
  useEffect(() => {
    if (lastDeathSeq === 0 || lastDeathSeq === reactedDeathRef.current) return;
    reactedDeathRef.current = lastDeathSeq;
    const s = usePvpStore.getState();
    const death = s.lastDeath;
    if (!death) return;
    const myRole = s.role === "client" ? "client" : "host";
    const amKiller = death.victim !== myRole;

    if (amKiller) usePvpEconomyStore.getState().addGold(GOLD_PER_KILL);

    if (death.final) {
      if (amKiller) announceVictory();
      else announceDefeat();
    } else if (death.firstBlood) {
      announceFirstBlood();
    } else if (amKiller) {
      announceKill();
    } else {
      announceSlain();
    }
  }, [lastDeathSeq]);

  // ─── Host: countdown timer → begin the round ───────────────────────────────
  useEffect(() => {
    if (!isHost || phase !== "countdown") return;
    const id = window.setTimeout(hostBeginRound, COUNTDOWN_MS);
    return () => window.clearTimeout(id);
  }, [isHost, phase, round]);

  // ─── Host: post-death intermission → open the shop ─────────────────────────
  useEffect(() => {
    if (!isHost || phase !== "intermission") return;
    const id = window.setTimeout(hostOpenShop, INTERMISSION_MS);
    return () => window.clearTimeout(id);
  }, [isHost, phase, round]);

  // ─── Host: shop window → next round ────────────────────────────────────────
  useEffect(() => {
    if (!isHost || phase !== "shop") return;
    const id = window.setTimeout(hostBeginNextRound, SHOP_MS);
    return () => window.clearTimeout(id);
  }, [isHost, phase, round]);

  // ─── Host: watch HP for the round-ending death ─────────────────────────────
  useEffect(() => {
    if (!isHost || phase !== "playing") return;
    const id = window.setInterval(() => {
      const s = usePvpStore.getState();
      if (s.phase !== "playing") return;
      if (s.hp.host <= 0) hostResolveDeath("host");
      else if (s.hp.client <= 0) hostResolveDeath("client");
    }, 50);
    return () => window.clearInterval(id);
  }, [isHost, phase, round]);

  return null;
}
