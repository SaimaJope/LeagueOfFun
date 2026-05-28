import { useGameStore } from "@/stores/gameStore";

export function AnalysisPanel() {
  const a = useGameStore((s) => s.lastAnalysis);
  if (!a) return null;
  const dist = (p: [number, number, number], q: [number, number, number]) =>
    Math.hypot(p[0] - q[0], p[2] - q[2]).toFixed(2);
  const dummyTravel = dist(a.dummyAtCast, a.dummyAtImpact);

  return (
    <div
      style={{
        position: "absolute",
        left: 12,
        bottom: 18,
        width: 290,
        background: "rgba(15,20,30,0.86)",
        border: "1px solid #243149",
        borderRadius: 10,
        padding: 12,
        fontSize: 12.5,
        lineHeight: 1.55,
      }}
    >
      <div style={{ fontWeight: 700, color: titleColor(a.result), marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5 }}>
        {a.result}
      </div>
      <Row k="Miss distance" v={`${a.missDistance.toFixed(2)}u`} />
      <Row k="Time to impact" v={`${Math.round(a.timeToImpactMs)} ms`} />
      <Row k="Dummy moved" v={`${dummyTravel}u`} />
      <Row k="Flash available" v={a.flashAvailable ? "yes" : "no"} />
      <Row k="Flash used" v={a.flashUsed ? "yes" : "no"} highlight={a.flashUsed ? "#ffd166" : undefined} />
      <div style={{ marginTop: 8, fontSize: 11, color: "#7d8aa1" }}>
        Blue ring = dummy at cast &middot; Red = at impact &middot; Green = where to aim
      </div>
    </div>
  );
}

function Row({ k, v, highlight }: { k: string; v: string; highlight?: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", color: "#cfe1ff" }}>
      <span style={{ color: "#7d8aa1" }}>{k}</span>
      <b style={{ color: highlight ?? "#cfe1ff" }}>{v}</b>
    </div>
  );
}

function titleColor(r: string): string {
  switch (r) {
    case "hit": return "#5dd47b";
    case "miss": return "#ff6b6b";
    case "flashed": return "#ffd166";
    case "juked": return "#c792ea";
    default: return "#9ec9ff";
  }
}
