import { useEffect } from "react";
import { preloadAll, usePreloadStore } from "@/game/assets/preloader";

/**
 * Fullscreen "loading" overlay shown until {@link preloadAll} has resolved
 * every model / texture / audio asset. Blocks user interaction (covers the
 * lobby + scene + UI) so first-cleaver-throw / first-skin-swap don't stall.
 */
export function LoadingScreen() {
  const loaded = usePreloadStore((s) => s.loaded);
  const total = usePreloadStore((s) => s.total);
  const ready = usePreloadStore((s) => s.ready);

  useEffect(() => {
    preloadAll();
  }, []);

  if (ready) return null;

  const pct = total > 0 ? Math.min(100, Math.round((loaded / total) * 100)) : 0;
  return (
    <div style={overlay}>
      <div style={panel}>
        <div style={{ fontSize: 26, fontWeight: 900, color: "#9ec9ff", marginBottom: 12 }}>
          LeagueOfFun
        </div>
        <div style={{ color: "#7d8aa1", marginBottom: 14 }}>Loading assets…</div>
        <div style={track}>
          <div style={{ ...fill, width: `${pct}%` }} />
        </div>
        <div style={pctText}>{pct}% — {loaded}/{total}</div>
      </div>
    </div>
  );
}

const overlay: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  background: "#0b0d12",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 100,
};

const panel: React.CSSProperties = {
  width: 360,
  textAlign: "center",
};

const track: React.CSSProperties = {
  height: 8,
  background: "#0e1622",
  border: "1px solid #2c4366",
  borderRadius: 6,
  overflow: "hidden",
};

const fill: React.CSSProperties = {
  height: "100%",
  background: "linear-gradient(90deg, #5180c4, #9ec9ff)",
  transition: "width 100ms linear",
};

const pctText: React.CSSProperties = {
  fontSize: 12,
  color: "#7d8aa1",
  marginTop: 8,
  fontVariantNumeric: "tabular-nums",
};
