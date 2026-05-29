import { useEffect, useRef } from "react";
import { usePvpStore } from "@/stores/pvpStore";
import { usePvpEconomyStore } from "@/stores/pvpEconomyStore";
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
import { requestDance } from "@/game/entities/danceControl";

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

  // Note: incoming round snapshots are applied directly in peerNetwork.wireConn
  // (so they survive cleanup()'s listeners.clear()), not via a subscribe here.

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

    if (amKiller) {
      usePvpEconomyStore.getState().addGold(GOLD_PER_KILL);
      // Winner celebrates every round (and the game).
      requestDance();
    }

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
