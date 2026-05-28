import { useEffect, useState } from "react";
import { useAssetStore } from "@/stores/assetStore";
import { useCleaverStore } from "@/stores/cleaverStore";
import { useFlashStore } from "@/stores/flashStore";
import type { IconAssetConfig } from "@/game/config/assets.config";
import { publicAsset } from "@/game/assets/publicPath";

function useNow(intervalMs = 100) {
  const [, setT] = useState(0);
  useEffect(() => {
    const i = window.setInterval(() => setT((x) => x + 1), intervalMs);
    return () => window.clearInterval(i);
  }, [intervalMs]);
  return performance.now();
}

export function DodgeballHUD() {
  const now = useNow(80);
  const cleaverCdUntil = useCleaverStore((s) => s.cooldownUntil);
  const flashCdUntil = useFlashStore((s) => s.cooldownUntil);
  const cleaverIcon = useAssetStore((s) => s.registry.cleaverIcon);
  const flashIcon = useAssetStore((s) => s.registry.flashIcon);

  const cleaverCdLeft = Math.max(0, cleaverCdUntil - now);
  const flashCdLeft = Math.max(0, flashCdUntil - now);

  return (
    <>
      <div
        style={{
          position: "absolute",
          bottom: 18,
          left: "50%",
          transform: "translateX(-50%)",
          display: "flex",
          gap: 16,
          padding: 12,
          background: "rgba(15,20,30,0.78)",
          border: "1px solid #243149",
          borderRadius: 12,
        }}
      >
        <AbilityIcon icon={cleaverIcon} cooldownMs={cleaverCdLeft} label="Q Cleaver" />
        <AbilityIcon icon={flashIcon} cooldownMs={flashCdLeft} label="F Flash" />
      </div>

      <div
        style={{
          position: "absolute",
          bottom: 18,
          right: 18,
          fontSize: 11,
          color: "#7d8aa1",
          background: "rgba(15,20,30,0.6)",
          padding: "8px 10px",
          borderRadius: 8,
          border: "1px solid #1f2a3d",
          pointerEvents: "none",
        }}
      >
        Right-click move &middot; S stop &middot; Q cleaver &middot; F flash
      </div>
    </>
  );
}

function AbilityIcon({ icon, cooldownMs, label }: { icon: IconAssetConfig; cooldownMs: number; label: string }) {
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
      <div style={{ textAlign: "center", fontSize: 11, color: "#7d8aa1", marginTop: 2 }}>{label}</div>
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
