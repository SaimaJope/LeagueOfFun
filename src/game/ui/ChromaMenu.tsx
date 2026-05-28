import { useEffect } from "react";
import { chromasForTarget, useChromaStore } from "@/stores/chromaStore";
import { useTrainerStore } from "@/stores/trainerStore";

export function ChromaMenu() {
  const open = useChromaStore((s) => s.open);
  const selectedId = useChromaStore((s) => s.selectedId);
  const toggleOpen = useChromaStore((s) => s.toggleOpen);
  const close = useChromaStore((s) => s.close);
  const setChroma = useChromaStore((s) => s.setChroma);
  const trainer = useTrainerStore((s) => s.trainer);
  const target = trainer === "dodgeball" ? "mundo" : "thresh";
  const chromas = chromasForTarget(target);
  const activeId = chromas.some((chroma) => chroma.id === selectedId) ? selectedId : chromas[0]?.id;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "Escape") return;
      e.preventDefault();
      toggleOpen();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleOpen]);

  if (!open) return null;

  return (
    <div style={overlay} onClick={close}>
      <div style={panel} onClick={(e) => e.stopPropagation()}>
        <div style={header}>
          <div style={{ fontWeight: 700, color: "#cfe1ff" }}>Chromas</div>
          <button onClick={close} style={btn}>Close</button>
        </div>
        <div style={grid}>
          {chromas.map((chroma) => {
            const active = chroma.id === activeId;
            return (
              <button
                key={chroma.id}
                onClick={() => setChroma(chroma.id)}
                style={{
                  ...chromaBtn,
                  borderColor: active ? "#8fb8ff" : "#2c4366",
                  background: active ? "#1f3554" : "#121925",
                }}
              >
                {chroma.texturePath ? <img src={chroma.texturePath} alt="" style={swatch} /> : <span style={defaultSwatch} />}
                <span>{chroma.name}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

const overlay: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  background: "rgba(2,4,8,0.52)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 60,
};
const panel: React.CSSProperties = {
  width: "min(440px, 92vw)",
  background: "#0e131c",
  border: "1px solid #243149",
  borderRadius: 10,
  boxShadow: "0 20px 60px rgba(0,0,0,0.6)",
};
const header: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  padding: "14px 16px",
  borderBottom: "1px solid #243149",
};
const grid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: 10,
  padding: 16,
};
const chromaBtn: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  color: "#cfe1ff",
  border: "1px solid #2c4366",
  borderRadius: 8,
  padding: "10px 12px",
  cursor: "pointer",
  fontSize: 12.5,
};
const swatch: React.CSSProperties = {
  width: 34,
  height: 34,
  borderRadius: 4,
  border: "1px solid rgba(255,255,255,0.28)",
  flex: "0 0 auto",
  objectFit: "cover",
};
const defaultSwatch: React.CSSProperties = {
  ...swatch,
  background: "linear-gradient(135deg, #285b32, #7bbd61)",
};
const btn: React.CSSProperties = {
  background: "#1a2330",
  color: "#cfe1ff",
  border: "1px solid #2c4366",
  padding: "8px 12px",
  borderRadius: 8,
  cursor: "pointer",
  fontSize: 12.5,
};
