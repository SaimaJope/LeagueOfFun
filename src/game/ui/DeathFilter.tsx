import { usePvpStore } from "@/stores/pvpStore";

/**
 * League-style death screen: while the local champion is dead, desaturate the
 * game view to ~70% grayscale and darken it slightly. Sits above the canvas but
 * below the HUD/overlays (which stay full-color and readable).
 */
export function DeathFilter() {
  const phase = usePvpStore((s) => s.phase);
  const role = usePvpStore((s) => s.role);
  const me = role === "client" ? "client" : "host";
  const hp = usePvpStore((s) => s.hp[me]);

  const inMatch =
    phase === "countdown" ||
    phase === "playing" ||
    phase === "intermission" ||
    phase === "shop" ||
    phase === "ended";
  const dead = inMatch && hp <= 0;

  if (!dead) return null;

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        zIndex: 6,
        backdropFilter: "grayscale(0.7) brightness(0.78)",
        WebkitBackdropFilter: "grayscale(0.7) brightness(0.78)",
        background: "rgba(10,10,14,0.12)",
        transition: "backdrop-filter 200ms ease, opacity 200ms ease",
      }}
    />
  );
}
