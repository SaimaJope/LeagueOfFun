import { useEffect, useRef } from "react";
import { usePvpStore } from "@/stores/pvpStore";
import { useNow } from "@/game/ui/useNow";
import { playCountdownTick } from "@/game/audio/uiSounds";
import { COUNTDOWN_MS } from "@/game/config/pvpItems";

/** Big 5→1 pre-round countdown shown over the arena before each round starts. */
export function PvpCountdown() {
  const phase = usePvpStore((s) => s.phase);
  const round = usePvpStore((s) => s.round);
  const startedAt = usePvpStore((s) => s.phaseStartedAt);
  const now = useNow(80);

  const isCountdown = phase === "countdown";
  const remaining = Math.max(0, COUNTDOWN_MS - (now - startedAt));
  const count = Math.min(5, Math.max(1, Math.ceil(remaining / 1000)));

  // Beep once per number (5,4,3,2,1).
  const lastTickRef = useRef(0);
  useEffect(() => {
    if (!isCountdown) {
      lastTickRef.current = 0;
      return;
    }
    if (count !== lastTickRef.current) {
      lastTickRef.current = count;
      playCountdownTick();
    }
  }, [isCountdown, count]);

  if (!isCountdown) return null;

  return (
    <div style={wrap}>
      <div className="lol-label" style={{ letterSpacing: 4, marginBottom: 6 }}>
        Round {round}
      </div>
      <div
        key={count}
        className="lol-result"
        style={{
          fontSize: 120,
          lineHeight: 1,
          color: "var(--lol-gold-1)",
          textShadow: "0 0 30px rgba(200,170,90,0.6), 0 4px 10px rgba(0,0,0,0.7)",
          animation: "lol-count-pop 0.9s ease-out",
        }}
      >
        {count}
      </div>
    </div>
  );
}

const wrap: React.CSSProperties = {
  position: "absolute",
  top: "34%",
  left: "50%",
  transform: "translate(-50%, -50%)",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  pointerEvents: "none",
  zIndex: 12,
  textAlign: "center",
};
