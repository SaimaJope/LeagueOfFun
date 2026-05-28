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
        <div className="lol-title" style={{ fontSize: 34, marginBottom: 4 }}>
          LeagueOfFun
        </div>
        <div
          style={{
            fontSize: 11,
            letterSpacing: 4,
            textTransform: "uppercase",
            color: "var(--lol-grey)",
            marginBottom: 22,
          }}
        >
          Loading assets…
        </div>
        <div style={track}>
          <div style={{ ...fill, width: `${pct}%` }} />
        </div>
        <div style={pctText}>
          {pct}% — {loaded}/{total}
        </div>
      </div>
    </div>
  );
}

const overlay: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  background: "radial-gradient(circle at center, #0a1622 0%, #010a13 80%)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 100,
};

const panel: React.CSSProperties = {
  width: 380,
  textAlign: "center",
};

const track: React.CSSProperties = {
  height: 10,
  background: "linear-gradient(180deg, #010a13, #0a1822)",
  border: "1px solid var(--lol-gold-4)",
  borderRadius: 1,
  overflow: "hidden",
  boxShadow: "inset 0 0 6px rgba(0,0,0,0.8)",
};

const fill: React.CSSProperties = {
  height: "100%",
  background: "linear-gradient(90deg, #785a28, #c8aa6e 70%, #f0e6d2)",
  boxShadow: "0 0 8px rgba(200,170,110,0.5)",
  transition: "width 100ms linear",
};

const pctText: React.CSSProperties = {
  fontSize: 12,
  color: "var(--lol-gold-3)",
  marginTop: 10,
  fontVariantNumeric: "tabular-nums",
  letterSpacing: 1,
};
