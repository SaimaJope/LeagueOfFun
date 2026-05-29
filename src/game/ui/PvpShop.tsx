import { usePvpStore } from "@/stores/pvpStore";
import { usePvpEconomyStore } from "@/stores/pvpEconomyStore";
import { useNow } from "@/game/ui/useNow";
import { ItemIcon } from "@/game/ui/ItemIcon";
import { playUiBuy, playUiDenied } from "@/game/audio/uiSounds";
import { PVP_ITEMS, SHOP_MS, type ItemId } from "@/game/config/pvpItems";

/**
 * Between-round shop. Opens after each non-final round for {@link SHOP_MS}; the
 * player spends locally-tracked gold on items. Items apply immediately (boots,
 * Frozen Mallet, Youmuu) or next round (Warmog's HP).
 */
export function PvpShop() {
  const phase = usePvpStore((s) => s.phase);
  const startedAt = usePvpStore((s) => s.phaseStartedAt);
  const gold = usePvpEconomyStore((s) => s.gold);
  const owned = usePvpEconomyStore((s) => s.owned);
  const buy = usePvpEconomyStore((s) => s.buy);
  const now = useNow(120);

  if (phase !== "shop") return null;

  const secondsLeft = Math.max(0, Math.ceil((SHOP_MS - (now - startedAt)) / 1000));

  return (
    <div style={overlay}>
      <div className="lol-panel" style={panel}>
        <div style={header}>
          <div className="lol-title" style={{ fontSize: 20 }}>
            Shop
          </div>
          <div className="lol-chip" style={{ fontSize: 15, color: "var(--lol-gold-1)" }}>
            {gold} g
          </div>
          <div className="lol-label">Match begins in {secondsLeft}s</div>
        </div>
        <hr className="lol-divider" style={{ margin: "12px 0" }} />
        <div style={grid}>
          {PVP_ITEMS.map((item) => {
            const isOwned = owned[item.id as ItemId];
            const affordable = gold >= item.cost;
            return (
              <div key={item.id} className="lol-panel" style={card}>
                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <ItemIcon id={item.id as ItemId} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 6 }}>
                      <span className="lol-font" style={{ fontWeight: 700, color: "var(--lol-gold-1)" }}>
                        {item.name}
                      </span>
                      <span className="lol-chip" style={{ fontSize: 12 }}>{item.cost} g</span>
                    </div>
                    <div style={{ color: "var(--lol-grey)", fontSize: 12, lineHeight: 1.35, marginTop: 6 }}>
                      {item.desc}
                      {item.active ? " (Press 1)" : ""}
                    </div>
                  </div>
                </div>
                <button
                  data-no-click-sound="true"
                  className={`lol-btn${affordable && !isOwned ? " lol-btn-primary" : ""}`}
                  style={{ width: "100%", padding: "8px 10px", fontSize: 13, marginTop: 12 }}
                  disabled={isOwned}
                  onClick={() => {
                    if (isOwned) return;
                    if (gold >= item.cost && buy(item.id, item.cost)) playUiBuy();
                    else playUiDenied();
                  }}
                >
                  {isOwned ? "Owned" : affordable ? "Buy" : "Not enough gold"}
                </button>
              </div>
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
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "radial-gradient(circle at center, rgba(3,9,17,0.35), rgba(0,0,0,0.6))",
  zIndex: 14,
};

const panel: React.CSSProperties = {
  width: 640,
  maxWidth: "94vw",
  padding: 22,
  color: "#cfe1ff",
};

const header: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
};

const grid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 14,
};

const card: React.CSSProperties = {
  padding: 14,
};
