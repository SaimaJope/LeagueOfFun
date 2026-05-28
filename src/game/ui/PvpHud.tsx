import { usePvpStore } from "@/stores/pvpStore";
import { cleanup } from "@/game/network/peerNetwork";

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

  if (phase !== "playing" && phase !== "ended") return null;

  const meKey = role === "host" ? "host" : "client";
  const oppKey = role === "host" ? "client" : "host";
  const meHp = hp[meKey];
  const oppHp = hp[oppKey];
  const youWon = winner === meKey;

  return (
    <>
      <div style={hudWrap}>
        <HpPanel label="You" current={meHp} max={startingHp} color="#5ab9ff" />
        <HpPanel label="Opponent" current={oppHp} max={startingHp} color="#ff7e7e" />
      </div>

      {phase === "ended" && (
        <div style={endOverlay}>
          <div style={endPanel}>
            <div
              style={{
                fontSize: 36,
                fontWeight: 900,
                color: youWon ? "#5dd47b" : "#ff7e7e",
                marginBottom: 12,
              }}
            >
              {youWon ? "Victory" : "Defeat"}
            </div>
            <div style={{ color: "#cfe1ff", marginBottom: 18 }}>
              {youWon ? "You took the last cleaver. " : "Your opponent took the last cleaver. "}
              Back to the lobby for another round.
            </div>
            <button
              style={endBtn}
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
    <div style={hpPanel}>
      <div style={{ fontSize: 12, color: "#7d8aa1", marginBottom: 4 }}>{label}</div>
      <div style={hpTrack}>
        <div style={{ ...hpFill, width: `${pct * 100}%`, background: color }} />
        <div style={hpTicks}>
          {Array.from({ length: max }).map((_, i) => (
            <div key={i} style={{ ...hpTick, left: `${((i + 1) / max) * 100}%` }} />
          ))}
        </div>
      </div>
      <div style={{ fontSize: 14, fontWeight: 700, color: "#e6f1ff", textAlign: "right" }}>
        {current} / {max}
      </div>
    </div>
  );
}

const hudWrap: React.CSSProperties = {
  position: "absolute",
  top: 14,
  left: "50%",
  transform: "translateX(-50%)",
  display: "flex",
  gap: 18,
  pointerEvents: "none",
  zIndex: 8,
};

const hpPanel: React.CSSProperties = {
  background: "rgba(15,20,30,0.78)",
  border: "1px solid #243149",
  borderRadius: 10,
  padding: "8px 12px",
  minWidth: 200,
};

const hpTrack: React.CSSProperties = {
  position: "relative",
  height: 12,
  background: "#0e1622",
  border: "1px solid #2c4366",
  borderRadius: 6,
  overflow: "hidden",
  marginBottom: 4,
};

const hpFill: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  width: "100%",
  transition: "width 120ms ease-out",
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
  background: "rgba(0,0,0,0.5)",
};

const endOverlay: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  background: "rgba(8,11,18,0.7)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 30,
};

const endPanel: React.CSSProperties = {
  background: "rgba(12,16,24,0.95)",
  border: "1px solid #2a3950",
  borderRadius: 14,
  padding: 28,
  width: 420,
  maxWidth: "92vw",
  textAlign: "center",
  boxShadow: "0 10px 30px rgba(0,0,0,0.6)",
};

const endBtn: React.CSSProperties = {
  background: "#244266",
  color: "#e6f1ff",
  border: "1px solid #5180c4",
  padding: "10px 18px",
  borderRadius: 8,
  cursor: "pointer",
  fontWeight: 700,
};
