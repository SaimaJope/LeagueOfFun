import { useEffect, useState } from "react";
import { useGameStore } from "@/stores/gameStore";
import { useAssetStore } from "@/stores/assetStore";
import type { IconAssetConfig } from "@/game/config/assets.config";
import { publicAsset } from "@/game/assets/publicPath";
import { aiBus } from "@/stores/aiBus";

function useNow(intervalMs = 100) {
  const [, setT] = useState(0);
  useEffect(() => {
    const i = window.setInterval(() => setT((x) => x + 1), intervalMs);
    return () => window.clearInterval(i);
  }, [intervalMs]);
  return performance.now();
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
          padding: 10,
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

export function HUD() {
  const now = useNow(80);
  const hook = useGameStore((s) => s.hook);
  const score = useGameStore((s) => s.score);
  const toggleAssets = useGameStore((s) => s.toggleAssetManager);
  const toggleSettings = useGameStore((s) => s.toggleSettings);
  const freezeDummies = useGameStore((s) => s.devMode.freezeDummies);
  const toggleFreezeDummies = useGameStore((s) => s.toggleFreezeDummies);
  const resetDrill = useGameStore((s) => s.resetDrill);

  const hookIcon = useAssetStore((s) => s.registry.hookIcon);
  const flashIcon = useAssetStore((s) => s.registry.flashIcon);
  const hookCdLeft = Math.max(0, hook.cooldownUntil - now);
  const accuracy = score.cast > 0 ? Math.round((score.hit / score.cast) * 100) : 0;
  const avgMiss = score.cast - score.hit > 0 ? score.totalMissDistance / (score.cast - score.hit) : 0;

  return (
    <>
      {/* Top stats */}
      <div
        style={{
          position: "absolute",
          top: 12,
          left: 12,
          padding: "10px 14px",
          background: "rgba(15,20,30,0.78)",
          border: "1px solid #243149",
          borderRadius: 10,
          fontSize: 12.5,
          lineHeight: 1.6,
          minWidth: 200,
          pointerEvents: "none",
        }}
      >
        <div style={{ fontWeight: 700, color: "#9ec9ff", marginBottom: 4 }}>Hook Trainer</div>
        <div>Cast: <b>{score.cast}</b>  Hit: <b>{score.hit}</b>  Acc: <b>{accuracy}%</b></div>
        <div>Streak: <b>{score.streak}</b>  Best: <b>{score.bestStreak}</b></div>
        <div>Avg miss: <b>{avgMiss.toFixed(2)}u</b></div>
        <div>Last: <b style={{ color: lastColor(hook.lastResult) }}>{hook.lastResult}</b></div>
        {freezeDummies && <div style={{ color: "#ffd166", fontWeight: 700 }}>Dev: dummies frozen</div>}
      </div>

      {/* Top-right buttons */}
      <div style={{ position: "absolute", top: 12, right: 12, display: "flex", gap: 8 }}>
        <button onClick={toggleFreezeDummies} style={freezeDummies ? activeBtnStyle : btnStyle}>
          {freezeDummies ? "Unfreeze (F2)" : "Freeze AI (F2)"}
        </button>
        <button onClick={toggleAssets} style={btnStyle}>Assets</button>
        <button onClick={toggleSettings} style={btnStyle}>Settings</button>
        <button onClick={resetDrill} style={btnStyle}>Reset (R)</button>
      </div>

      {/* Ability bar */}
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
        <AbilityIcon icon={hookIcon} cooldownMs={hookCdLeft} label="Q Hook" />
        <AbilityIcon icon={flashIcon} cooldownMs={Math.max(0, aiBus.dummyFlashReadyAt - now)} label="Dummy F" />
      </div>

      {/* Controls hint */}
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
        Right-click move &middot; S stop &middot; Q hook &middot; F2 freeze AI &middot; Y camera &middot; Wheel zoom &middot; Space center &middot; ESC chroma
      </div>
    </>
  );
}

function IconImage({ icon, ready }: { icon: IconAssetConfig; ready: boolean }) {
  const [failed, setFailed] = useState(false);
  // Reset failure when path changes.
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

function lastColor(r: string) {
  switch (r) {
    case "hit": return "#5dd47b";
    case "miss": return "#ff6b6b";
    case "flashed": return "#ffd166";
    case "juked": return "#c792ea";
    default: return "#7d8aa1";
  }
}

const btnStyle: React.CSSProperties = {
  background: "#1a2330",
  color: "#cfe1ff",
  border: "1px solid #2c4366",
  padding: "8px 12px",
  borderRadius: 8,
  cursor: "pointer",
  fontSize: 12.5,
};

const activeBtnStyle: React.CSSProperties = {
  ...btnStyle,
  color: "#ffd166",
  border: "1px solid #8c6b2b",
  background: "#2a2417",
};
