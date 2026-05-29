import { usePvpStore } from "@/stores/pvpStore";
import { usePvpEconomyStore } from "@/stores/pvpEconomyStore";
import { cleanup } from "@/game/network/peerNetwork";
import { hostRematch } from "@/game/network/pvpMatch";
import { useAssetStore } from "@/stores/assetStore";
import { useCleaverStore } from "@/stores/cleaverStore";
import { useFlashStore } from "@/stores/flashStore";
import { AbilityIcon } from "@/game/ui/AbilityIcon";
import { ItemIcon } from "@/game/ui/ItemIcon";
import { useNow } from "@/game/ui/useNow";
import { PVP_ITEMS, YOUMUU_COOLDOWN_MS, type ItemId } from "@/game/config/pvpItems";

/**
 * In-match HUD: per-player HP bars + series score at the top, ability/item bar
 * and gold at the bottom, and a (non-intrusive) game-over screen that keeps you
 * in the arena with a rematch option.
 */
export function PvpHud() {
  const phase = usePvpStore((s) => s.phase);
  const role = usePvpStore((s) => s.role);
  const hp = usePvpStore((s) => s.hp);
  const maxHp = usePvpStore((s) => s.maxHp);
  const winner = usePvpStore((s) => s.winner);
  const round = usePvpStore((s) => s.round);
  const roundWins = usePvpStore((s) => s.roundWins);
  const resetLobby = usePvpStore((s) => s.reset);

  const gold = usePvpEconomyStore((s) => s.gold);
  const owned = usePvpEconomyStore((s) => s.owned);
  const ownsYoumuu = usePvpEconomyStore((s) => s.owned.youmuu);
  const youmuuReadyAt = usePvpEconomyStore((s) => s.youmuuReadyAt);
  const youmuuActiveUntil = usePvpEconomyStore((s) => s.youmuuActiveUntil);

  const now = useNow(80);
  const cleaverCdUntil = useCleaverStore((s) => s.cooldownUntil);
  const flashCdUntil = useFlashStore((s) => s.cooldownUntil);
  const cleaverIcon = useAssetStore((s) => s.registry.cleaverIcon);
  const flashIcon = useAssetStore((s) => s.registry.flashIcon);

  const inMatch =
    phase === "countdown" ||
    phase === "playing" ||
    phase === "intermission" ||
    phase === "shop" ||
    phase === "ended";
  if (!inMatch) return null;

  const cleaverCdLeft = Math.max(0, cleaverCdUntil - now);
  const flashCdLeft = Math.max(0, flashCdUntil - now);

  const meKey = role === "host" ? "host" : "client";
  const oppKey = role === "host" ? "client" : "host";
  const youWon = winner === meKey;
  const qTotal = usePvpStore.getState().settings.qCooldownMs;
  const flashTotal = usePvpStore.getState().settings.flashCooldownMs;
  const isHost = role === "host";

  const youmuuActive = now < youmuuActiveUntil;
  const youmuuCdLeft = youmuuActive ? 0 : Math.max(0, youmuuReadyAt - now);
  const ownedItems = PVP_ITEMS.filter((i) => owned[i.id as ItemId]);

  return (
    <>
      <div style={hudWrap}>
        <HpPanel label="You" current={hp[meKey]} max={maxHp[meKey]} color="#3aa0ff" />
        <div className="lol-panel" style={scorePanel}>
          <div className="lol-label" style={{ textAlign: "center" }}>Round {round}</div>
          <div className="lol-result" style={{ fontSize: 22, textAlign: "center", letterSpacing: 2 }}>
            {roundWins[meKey]} <span style={{ color: "var(--lol-grey)" }}>–</span> {roundWins[oppKey]}
          </div>
        </div>
        <HpPanel label="Opponent" current={hp[oppKey]} max={maxHp[oppKey]} color="#e8483f" />
      </div>

      {/* Owned items (inventory) */}
      {ownedItems.length > 0 && (
        <div className="lol-panel" style={inventoryStrip}>
          {ownedItems.map((i) => (
            <ItemIcon key={i.id} id={i.id as ItemId} size={38} />
          ))}
        </div>
      )}

      {/* Gold */}
      <div className="lol-panel" style={goldChip}>
        <span className="lol-label">Gold</span>
        <span className="lol-hp-count" style={{ color: "var(--lol-gold-1)", fontSize: 15 }}>{gold}</span>
      </div>

      {/* Ability + item bar */}
      <div className="lol-panel" style={abilityBar}>
        <AbilityIcon icon={cleaverIcon} cooldownMs={cleaverCdLeft} totalMs={qTotal} hotkey="Q" />
        <AbilityIcon icon={flashIcon} cooldownMs={flashCdLeft} totalMs={flashTotal} hotkey="F" />
        {ownsYoumuu && (
          <YoumuuSlot active={youmuuActive} cooldownMs={youmuuCdLeft} totalMs={YOUMUU_COOLDOWN_MS} />
        )}
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
            <div className="lol-label" style={{ marginBottom: 8 }}>
              Series {roundWins[meKey]} – {roundWins[oppKey]}
            </div>
            <hr className="lol-divider" style={{ marginBottom: 16 }} />
            <div style={{ color: "var(--lol-grey)", marginBottom: 20, lineHeight: 1.5 }}>
              {youWon ? "You won the match." : "Your opponent won the match."}
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
              {isHost && (
                <button
                  className="lol-btn lol-btn-primary"
                  style={{ padding: "11px 22px", fontSize: 14 }}
                  onClick={() => hostRematch()}
                >
                  Rematch
                </button>
              )}
              <button
                className="lol-btn"
                style={{ padding: "11px 22px", fontSize: 14 }}
                onClick={() => {
                  cleanup();
                  resetLobby();
                }}
              >
                Back to lobby
              </button>
            </div>
            {!isHost && (
              <div className="lol-font" style={{ marginTop: 12, color: "var(--lol-grey)", fontStyle: "italic", fontSize: 12 }}>
                Waiting for host to start a rematch…
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function YoumuuSlot({
  active,
  cooldownMs,
  totalMs,
}: {
  active: boolean;
  cooldownMs: number;
  totalMs: number;
}) {
  const ready = active || cooldownMs <= 0;
  const sweepDeg = !ready ? Math.min(1, cooldownMs / totalMs) * 360 : 0;
  return (
    <div style={{ position: "relative", width: 54, height: 54 }}>
      <div
        className={`lol-ability${ready ? " ready" : ""}`}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: active ? "#7fe0ff" : "var(--lol-gold-1)",
          fontWeight: 700,
          fontSize: 22,
          boxShadow: active ? "0 0 16px rgba(110,200,255,0.7)" : undefined,
        }}
      >
        ⚔
      </div>
      {sweepDeg > 0 && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: 2,
            pointerEvents: "none",
            background: `conic-gradient(rgba(1,10,19,0.78) ${sweepDeg}deg, rgba(0,0,0,0) ${sweepDeg}deg)`,
          }}
        />
      )}
      <div
        className="lol-keycap"
        style={{
          position: "absolute",
          right: 2,
          bottom: 2,
          background: "rgba(1,10,19,0.85)",
          border: "1px solid var(--lol-gold-4)",
          borderRadius: 2,
          padding: "0 4px",
          lineHeight: "14px",
          pointerEvents: "none",
        }}
      >
        1
      </div>
    </div>
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
  const pct = max > 0 ? Math.min(1, Math.max(0, current / max)) : 0;
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
  alignItems: "stretch",
  pointerEvents: "none",
  zIndex: 8,
};

const hpPanel: React.CSSProperties = {
  padding: "9px 13px",
  minWidth: 210,
};

const scorePanel: React.CSSProperties = {
  padding: "6px 16px",
  display: "flex",
  flexDirection: "column",
  justifyContent: "center",
};

const inventoryStrip: React.CSSProperties = {
  position: "absolute",
  bottom: 70,
  right: 22,
  display: "flex",
  gap: 6,
  padding: "7px 9px",
  zIndex: 8,
};

const goldChip: React.CSSProperties = {
  position: "absolute",
  bottom: 22,
  right: 22,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: 2,
  padding: "8px 14px",
  zIndex: 8,
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
