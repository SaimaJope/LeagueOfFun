import { useAudioStore } from "@/stores/audioStore";

export function VolumeSlider() {
  const master = useAudioStore((s) => s.master);
  const setMaster = useAudioStore((s) => s.setMaster);
  const muted = master < 0.001;

  return (
    <div style={wrap}>
      <button
        onClick={() => setMaster(muted ? 0.8 : 0)}
        title={muted ? "Unmute" : "Mute"}
        style={iconBtn}
      >
        {muted ? "🔇" : master < 0.5 ? "🔉" : "🔊"}
      </button>
      <input
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={master}
        onChange={(e) => setMaster(Number(e.target.value))}
        style={range}
      />
      <div style={pctLabel}>{Math.round(master * 100)}</div>
    </div>
  );
}

const wrap: React.CSSProperties = {
  position: "absolute",
  left: 14,
  bottom: 14,
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "8px 12px",
  background: "rgba(15,20,30,0.78)",
  border: "1px solid #243149",
  borderRadius: 10,
  zIndex: 10,
};

const iconBtn: React.CSSProperties = {
  background: "transparent",
  color: "#cfe1ff",
  border: "none",
  fontSize: 18,
  cursor: "pointer",
  padding: 0,
  width: 22,
  height: 22,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

const range: React.CSSProperties = {
  width: 110,
  accentColor: "#5180c4",
};

const pctLabel: React.CSSProperties = {
  fontSize: 11,
  fontVariantNumeric: "tabular-nums",
  color: "#7d8aa1",
  width: 24,
  textAlign: "right",
};
