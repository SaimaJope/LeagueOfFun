import { useEffect, useRef, useState } from "react";
import { useFlashStore } from "@/stores/flashStore";
import {
  FLASH_SCREEN_ALPHA,
  FLASH_SCREEN_DURATION_MS,
} from "@/game/config/dodgeball.config";

/**
 * Fullscreen white overlay that flashes for ~FLASH_SCREEN_DURATION_MS whenever
 * Flash is cast. Rendered outside the Canvas so it covers the whole screen.
 */
export function FlashScreenOverlay() {
  const castSerial = useFlashStore((s) => s.castSerial);
  const lastSerialRef = useRef(0);
  const [opacity, setOpacity] = useState(0);

  useEffect(() => {
    if (castSerial === lastSerialRef.current) return;
    lastSerialRef.current = castSerial;
    if (castSerial === 0) return;
    setOpacity(FLASH_SCREEN_ALPHA);
    let raf = 0;
    const start = performance.now();
    const tick = () => {
      const elapsed = performance.now() - start;
      const t = Math.min(1, elapsed / FLASH_SCREEN_DURATION_MS);
      setOpacity(FLASH_SCREEN_ALPHA * (1 - t));
      if (t < 1) raf = requestAnimationFrame(tick);
      else setOpacity(0);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [castSerial]);

  if (opacity <= 0) return null;
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        background: "#fff",
        opacity,
        pointerEvents: "none",
        zIndex: 50,
      }}
    />
  );
}
