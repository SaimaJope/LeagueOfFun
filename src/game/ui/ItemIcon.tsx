import { useEffect, useState } from "react";
import { publicAsset } from "@/game/assets/publicPath";
import type { ItemId } from "@/game/config/pvpItems";

/**
 * PvP shop/inventory item icon. Loads a real image from
 *   public/assets/items/<id>.png
 * (drop in authentic icons there), falling back to a clean emoji glyph until
 * the image exists, so the shop never shows a broken/empty box.
 */
export function ItemIcon({ id, size = 44 }: { id: ItemId; size?: number }) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [id]);

  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: 3,
        border: "1px solid var(--lol-gold-4, #876d3a)",
        background: "linear-gradient(160deg, #11202e, #060d16)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flex: "0 0 auto",
        overflow: "hidden",
      }}
    >
      {failed ? (
        <span style={{ fontSize: Math.round(size * 0.56), lineHeight: 1 }}>{EMOJI[id]}</span>
      ) : (
        <img
          src={publicAsset(`assets/items/${id}.webp`)}
          alt={id}
          onError={() => setFailed(true)}
          style={{ width: "100%", height: "100%", objectFit: "contain" }}
        />
      )}
    </div>
  );
}

const EMOJI: Record<ItemId, string> = {
  boots: "👢",
  frozen_mallet: "🔨",
  warmogs: "❤️",
  youmuu: "🗡️",
};
