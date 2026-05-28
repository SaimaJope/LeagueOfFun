import { useEffect, useState } from "react";
import type { IconAssetConfig } from "@/game/config/assets.config";
import { publicAsset } from "@/game/assets/publicPath";

/**
 * Shared ability slot — gold-framed icon with a radial cooldown sweep and an
 * optional hotkey cap, in the old-League style. Used by the Dodgeball + PvP HUDs.
 */
export function AbilityIcon({
  icon,
  cooldownMs,
  totalMs,
  label,
  hotkey,
}: {
  icon: IconAssetConfig;
  cooldownMs: number;
  /** Full cooldown duration; enables the radial sweep when provided. */
  totalMs?: number;
  label?: string;
  /** Single-letter keybind shown as a corner cap. */
  hotkey?: string;
}) {
  const ready = cooldownMs <= 0;
  const sweepDeg = !ready && totalMs ? Math.min(1, cooldownMs / totalMs) * 360 : 0;
  return (
    <div style={{ position: "relative", width: 54, height: 54 }}>
      <div className={`lol-ability${ready ? " ready" : ""}`}>
        <IconImage icon={icon} ready={ready} />
      </div>

      {/* Radial cooldown wipe. */}
      {sweepDeg > 0 && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: 2,
            pointerEvents: "none",
            background: `conic-gradient(rgba(1,10,19,0.78) ${sweepDeg}deg, rgba(0,0,0,0) ${sweepDeg}deg)`,
          }}
        />
      )}

      {!ready && (
        <div
          className="lol-font"
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#f0e6d2",
            fontWeight: 700,
            fontSize: 18,
            pointerEvents: "none",
            textShadow: "0 1px 3px #000",
          }}
        >
          {(cooldownMs / 1000).toFixed(1)}
        </div>
      )}

      {hotkey ? (
        <div
          className="lol-keycap"
          style={{
            position: "absolute",
            right: 2,
            bottom: 2,
            background: "rgba(1,10,19,0.85)",
            border: "1px solid var(--lol-gold-4)",
            borderRadius: 2,
            padding: "0 4px",
            lineHeight: "14px",
            pointerEvents: "none",
          }}
        >
          {hotkey}
        </div>
      ) : label ? (
        <div className="lol-keycap" style={{ textAlign: "center", marginTop: 3 }}>
          {label}
        </div>
      ) : null}
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
