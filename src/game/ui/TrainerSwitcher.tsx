import { areTrainingModesVisible, useTrainerStore, type Trainer } from "@/stores/trainerStore";

const OPTIONS: { id: Trainer; label: string }[] = [
  { id: "pvp", label: "PvP" },
  { id: "dodgeball", label: "Dodgeball" },
  { id: "hookTrainer", label: "Hook" },
];

export function TrainerSwitcher() {
  const trainer = useTrainerStore((s) => s.trainer);
  const setTrainer = useTrainerStore((s) => s.setTrainer);

  if (!areTrainingModesVisible()) return null;

  return (
    <div
      style={{
        position: "absolute",
        top: 12,
        left: 12,
        display: "flex",
        gap: 6,
        padding: 6,
        background: "rgba(15,20,30,0.78)",
        border: "1px solid #243149",
        borderRadius: 10,
        zIndex: 10,
      }}
    >
      {OPTIONS.map((o) => {
        const active = trainer === o.id;
        return (
          <button
            key={o.id}
            onClick={() => setTrainer(o.id)}
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
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
