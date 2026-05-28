import { useEffect, useState } from "react";
import { usePvpStore } from "@/stores/pvpStore";
import { cleanup } from "@/game/network/peerNetwork";
import { useAssetStore } from "@/stores/assetStore";
import { useCleaverStore } from "@/stores/cleaverStore";
import { useFlashStore } from "@/stores/flashStore";
import { AbilityIcon } from "@/game/ui/AbilityIcon";

function useNow(intervalMs = 80) {
  const [, setT] = useState(0);
  useEffect(() => {
    const i = window.setInterval(() => setT((x) => x + 1), intervalMs);
    return () => window.clearInterval(i);
  }, [intervalMs]);
  return performance.now();
}

/**
 * In-match HUD: per-player HP bars at the top of the screen, plus a winner
 * overlay when the match ends.
 */
export function PvpHud() {
  const phase = usePvpStore((s) => s.phase);
  const role = usePvpStore((s) => s.role);
  const hp = usePvpStore((s) => s.hp);
  const winner = usePvpStore((s) => s.winner);
  const startingHp = usePvpStore((s) => s.settings.startingHp);
  const resetLobby = usePvpStore((s) => s.reset);

  const now = useNow(80);
  const cleaverCdUntil = useCleaverStore((s) => s.cooldownUntil);
  const flashCdUntil = useFlashStore((s) => s.cooldownUntil);
  const cleaverIcon = useAssetStore((s) => s.registry.cleaverIcon);
  const flashIcon = useAssetStore((s) => s.registry.flashIcon);

  if (phase !== "playing" && phase !== "ended") return null;

  const cleaverCdLeft = Math.max(0, cleaverCdUntil - now);
  const flashCdLeft = Math.max(0, flashCdUntil - now);

  const meKey = role === "host" ? "host" : "client";
  const oppKey = role === "host" ? "client" : "host";
  const meHp = hp[meKey];
  const oppHp = hp[oppKey];
  const youWon = winner === meKey;
  const qTotal = usePvpStore.getState().settings.qCooldownMs;
  const flashTotal = usePvpStore.getState().settings.flashCooldownMs;

  return (
    <>
      <div style={hudWrap}>
        <HpPanel label="You" current={meHp} max={startingHp} color="#3aa0ff" />
        <HpPanel label="Opponent" current={oppHp} max={startingHp} color="#e8483f" />
      </div>

      {/* Ability bar */}
      <div className="lol-panel" style={abilityBar}>
        <AbilityIcon icon={cleaverIcon} cooldownMs={cleaverCdLeft} totalMs={qTotal} hotkey="Q" />
        <AbilityIcon icon={flashIcon} cooldownMs={flashCdLeft} totalMs={flashTotal} hotkey="F" />
      </div>

      {phase === "ended" && (
        <div className="lol-overlay">
          <div className="lol-panel" style={endPanel}>
            <div
              className="lol-result"
              style={{
                fontSize: 44,
                color: youWon ? "#1ec8a5" : "#e8483f",
                marginBottom: 8,
                filter: `drop-shadow(0 0 18px ${youWon ? "rgba(30,200,165,0.5)" : "rgba(232,72,63,0.5)"})`,
              }}
            >
              {youWon ? "Victory" : "Defeat"}
            </div>
            <hr className="lol-divider" style={{ marginBottom: 16 }} />
            <div style={{ color: "var(--lol-grey)", marginBottom: 20, lineHeight: 1.5 }}>
              {youWon ? "You took the last cleaver. " : "Your opponent took the last cleaver. "}
              Back to the lobby for another round.
            </div>
            <button
              className="lol-btn lol-btn-primary"
              style={{ padding: "11px 22px", fontSize: 14 }}
              onClick={() => {
                cleanup();
                resetLobby();
              }}
            >
              Back to lobby
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function HpPanel({
  label,
  current,
  max,
  color,
}: {
  label: string;
  current: number;
  max: number;
  color: string;
}) {
  const pct = max > 0 ? Math.max(0, current / max) : 0;
  return (
    <div className="lol-panel" style={hpPanel}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 5 }}>
        <span className="lol-label">{label}</span>
        <span className="lol-hp-count" style={{ fontSize: 14 }}>
          {current} / {max}
        </span>
      </div>
      <div className="lol-hp-track">
        <div className="lol-hp-fill" style={{ width: `${pct * 100}%`, background: color }} />
        <div style={hpTicks}>
          {Array.from({ length: max }).map((_, i) => (
            <div key={i} style={{ ...hpTick, left: `${((i + 1) / max) * 100}%` }} />
          ))}
        </div>
      </div>
    </div>
  );
}

const abilityBar: React.CSSProperties = {
  position: "absolute",
  bottom: 18,
  left: "50%",
  transform: "translateX(-50%)",
  display: "flex",
  gap: 16,
  padding: 12,
  zIndex: 8,
};

const hudWrap: React.CSSProperties = {
  position: "absolute",
  top: 16,
  left: "50%",
  transform: "translateX(-50%)",
  display: "flex",
  gap: 18,
  pointerEvents: "none",
  zIndex: 8,
};

const hpPanel: React.CSSProperties = {
  padding: "9px 13px",
  minWidth: 210,
};

const hpTicks: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  pointerEvents: "none",
};

const hpTick: React.CSSProperties = {
  position: "absolute",
  top: 0,
  bottom: 0,
  width: 1,
  background: "rgba(0,0,0,0.55)",
};

const endPanel: React.CSSProperties = {
  padding: 30,
  width: 440,
  maxWidth: "92vw",
  textAlign: "center",
};
