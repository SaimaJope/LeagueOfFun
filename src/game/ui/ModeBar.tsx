import { useGameStore } from "@/stores/gameStore";
import type { GameMode } from "@/stores/gameStore";
import { applyDifficulty, DIFFICULTY } from "@/game/ai/personalities";

const MODES: { id: GameMode; label: string; hint: string }[] = [
  { id: "free",       label: "Free",       hint: "Unlimited hooks" },
  { id: "prediction", label: "Prediction", hint: "20 hooks · best aim" },
  { id: "flashPred",  label: "Flash Pred", hint: "15 hooks · bait the flash" },
  { id: "pathRead",   label: "Path Read",  hint: "20 hooks · read the path" },
];

export function ModeBar() {
  const gameMode = useGameStore((s) => s.gameMode);
  const score = useGameStore((s) => s.score);
  const setGameMode = useGameStore((s) => s.setGameMode);
  const setAI = useGameStore((s) => s.setAIConfig);
  const aiCfg = useGameStore((s) => s.aiConfig);
  const bestScores = useGameStore((s) => s.bestScores);

  function pick(id: GameMode) {
    setGameMode(id);
    // mode-specific AI nudges
    if (id === "flashPred") {
      setAI(applyDifficulty(DIFFICULTY.hard, aiCfg));
      setAI({ flashChance: 0.95, flashCooldownMs: 6000, mode: "flashDodger" });
    } else if (id === "pathRead") {
      setAI(applyDifficulty(DIFFICULTY.normal, aiCfg));
      setAI({ flashChance: 0, mode: "human", jukeFrequency: 1.4 });
    } else if (id === "prediction") {
      setAI(applyDifficulty(DIFFICULTY.normal, aiCfg));
      setAI({ mode: "human" });
    }
  }

  return (
    <div
      style={{
        position: "absolute",
        top: 12,
        left: "50%",
        transform: "translateX(-50%)",
        display: "flex",
        gap: 6,
        padding: 6,
        background: "rgba(15,20,30,0.78)",
        border: "1px solid #243149",
        borderRadius: 10,
      }}
    >
      {MODES.map((m) => {
        const active = gameMode.mode === m.id;
        return (
          <button
            key={m.id}
            onClick={() => pick(m.id)}
            title={`${m.hint}${bestScores[m.id] ? ` · best ${bestScores[m.id]}` : ""}`}
            style={{
              background: active ? "#244266" : "#1a2330",
              color: active ? "#e6f1ff" : "#9ec9ff",
              border: `1px solid ${active ? "#5180c4" : "#2c4366"}`,
              padding: "8px 12px",
              borderRadius: 7,
              cursor: "pointer",
              fontSize: 12,
              fontWeight: active ? 700 : 500,
            }}
          >
            {m.label}
            {gameMode.mode === m.id && gameMode.hookLimit !== null && (
              <span style={{ marginLeft: 8, color: "#7d8aa1" }}>
                {score.cast}/{gameMode.hookLimit}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
