import { useEffect, useRef, useState } from "react";
import { usePvpStore } from "@/stores/pvpStore";

const DURATION_MS = 700;
const MAX_OPACITY = 0.4;

/**
 * Subtle red vignette at the screen edges when the local player takes damage.
 * Fades in then out over ~0.7s. Deliberately low-contrast / short.
 */
export function DamageIndicator() {
  const role = usePvpStore((s) => s.role);
  const me = role === "client" ? "client" : "host";
  const hp = usePvpStore((s) => s.hp[me]);

  const prevHpRef = useRef(hp);
  const [opacity, setOpacity] = useState(0);

  useEffect(() => {
    const prev = prevHpRef.current;
    prevHpRef.current = hp;
    // Only flash on a real decrease (not on round-reset HP restores).
    if (hp >= prev) return;

    let raf = 0;
    const start = performance.now();
    const tick = () => {
      const t = (performance.now() - start) / DURATION_MS;
      if (t >= 1) {
        setOpacity(0);
        return;
      }
      // Fast fade-in (first ~25%), slow fade-out.
      const shape = t < 0.25 ? t / 0.25 : 1 - (t - 0.25) / 0.75;
      setOpacity(MAX_OPACITY * shape);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [hp]);

  if (opacity <= 0) return null;

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        zIndex: 9,
        opacity,
        boxShadow: "inset 0 0 160px 50px rgba(190,20,20,0.9)",
        background:
          "radial-gradient(ellipse at center, rgba(0,0,0,0) 55%, rgba(170,15,15,0.55) 100%)",
      }}
    />
  );
}
