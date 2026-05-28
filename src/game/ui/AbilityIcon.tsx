import { useEffect, useState } from "react";
import type { IconAssetConfig } from "@/game/config/assets.config";
import { publicAsset } from "@/game/assets/publicPath";

/**
 * Shared ability slot — icon + cooldown overlay + label. Used by both the
 * Dodgeball HUD and PvP HUD so they stay visually identical.
 */
export function AbilityIcon({
  icon,
  cooldownMs,
  label,
}: {
  icon: IconAssetConfig;
  cooldownMs: number;
  label: string;
}) {
  const ready = cooldownMs <= 0;
  return (
    <div style={{ position: "relative", width: 56, height: 56 }}>
      <div
        style={{
          width: 56,
          height: 56,
          borderRadius: 10,
          background: ready ? "#1a2330" : "#0f1620",
          border: `1px solid ${ready ? "#3d6fa8" : "#2a3950"}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: ready ? "#9ec9ff" : "#3e4a5c",
          padding: 6,
          boxSizing: "border-box",
          overflow: "hidden",
        }}
      >
        <IconImage icon={icon} ready={ready} />
      </div>
      {!ready && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#e6e8ee",
            fontWeight: 700,
            fontSize: 18,
            pointerEvents: "none",
            textShadow: "0 1px 2px #000",
          }}
        >
          {(cooldownMs / 1000).toFixed(1)}
        </div>
      )}
      <div style={{ textAlign: "center", fontSize: 11, color: "#7d8aa1", marginTop: 2 }}>
        {label}
      </div>
    </div>
  );
}

function IconImage({ icon, ready }: { icon: IconAssetConfig; ready: boolean }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setFailed(false);
  }, [icon.path]);
  if (failed || !icon.path) {
    return (
      <div
        style={{ width: "100%", height: "100%", opacity: ready ? 1 : 0.4 }}
        dangerouslySetInnerHTML={{ __html: icon.fallbackSvg }}
      />
    );
  }
  return (
    <img
      src={publicAsset(icon.path)}
      alt={icon.name}
      onError={() => setFailed(true)}
      style={{ width: "100%", height: "100%", objectFit: "contain", opacity: ready ? 1 : 0.4 }}
    />
  );
}
