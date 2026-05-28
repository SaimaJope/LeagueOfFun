import { useEffect, useState } from "react";
import type { CSSProperties } from "react";

export function FpsCounter() {
  const [fps, setFps] = useState<number | null>(null);

  useEffect(() => {
    let raf = 0;
    let frames = 0;
    let last = performance.now();

    const loop = (now: number) => {
      frames += 1;
      const elapsed = now - last;
      if (elapsed >= 500) {
        setFps(Math.round((frames * 1000) / elapsed));
        frames = 0;
        last = now;
      }
      raf = requestAnimationFrame(loop);
    };

    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  return <div style={fpsStyle}>{fps === null ? "--" : fps} FPS</div>;
}

const fpsStyle: CSSProperties = {
  position: "absolute",
  top: 12,
  right: 12,
  zIndex: 45,
  pointerEvents: "none",
  minWidth: 62,
  padding: "5px 8px",
  border: "1px solid rgba(81,128,196,0.55)",
  borderRadius: 6,
  background: "rgba(8,12,18,0.72)",
  color: "#b8d7ff",
  fontSize: 12,
  fontWeight: 800,
  fontVariantNumeric: "tabular-nums",
  textAlign: "center",
};
