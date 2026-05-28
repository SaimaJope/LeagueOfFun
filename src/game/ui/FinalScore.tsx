import { useGameStore } from "@/stores/gameStore";

export function FinalScore() {
  const gameMode = useGameStore((s) => s.gameMode);
  const score = useGameStore((s) => s.score);
  const best = useGameStore((s) => s.bestScores[gameMode.mode]);
  const setGameMode = useGameStore((s) => s.setGameMode);
  if (!gameMode.finished) return null;

  const accuracy = score.cast > 0 ? Math.round((score.hit / score.cast) * 100) : 0;
  const isNewBest = gameMode.finalScore >= best;

  return (
    <div style={overlay}>
      <div style={card}>
        <div style={{ fontSize: 13, color: "#7d8aa1", textTransform: "uppercase", letterSpacing: 1 }}>
          {gameMode.mode} complete
        </div>
        <div style={{ fontSize: 56, fontWeight: 800, color: "#ffd166", margin: "8px 0 4px" }}>
          {gameMode.finalScore}
        </div>
        {isNewBest && <div style={{ color: "#5dd47b", marginBottom: 12 }}>NEW BEST</div>}
        <div style={{ color: "#cfe1ff", fontSize: 13, lineHeight: 1.7, marginBottom: 16 }}>
          Hits: <b>{score.hit}</b> / {score.cast} ({accuracy}%) &middot;
          {" "}Best streak: <b>{score.bestStreak}</b><br />
          Flash predicted: <b>{score.flashPredicted}</b> &middot;
          {" "}Near misses: <b>{score.nearMisses}</b>
        </div>
        <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
          <button style={btn} onClick={() => setGameMode(gameMode.mode)}>Try again</button>
          <button style={btn} onClick={() => setGameMode("free")}>Free practice</button>
        </div>
      </div>
    </div>
  );
}

const overlay: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  background: "rgba(2,4,8,0.65)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 60,
  pointerEvents: "auto",
};
const card: React.CSSProperties = {
  background: "#0e131c",
  border: "1px solid #243149",
  borderRadius: 14,
  padding: "28px 36px",
  textAlign: "center",
  minWidth: 320,
};
const btn: React.CSSProperties = {
  background: "#1a2330",
  color: "#cfe1ff",
  border: "1px solid #2c4366",
  padding: "10px 16px",
  borderRadius: 8,
  cursor: "pointer",
  fontSize: 13,
};
