import { useRef } from "react";
import { useGameStore } from "@/stores/gameStore";
import { useAssetStore } from "@/stores/assetStore";
import type { ActionKey } from "@/game/animation/clipMatcher";
import type { ModelAssetConfig } from "@/game/config/assets.config";

const ACTIONS: ActionKey[] = ["idle", "move", "cast", "pull1", "pull2", "dash", "hit", "flash", "recall", "dance"];

export function AssetManager() {
  const open = useGameStore((s) => s.showAssetManager);
  const close = useGameStore((s) => s.toggleAssetManager);
  if (!open) return null;
  return (
    <div style={overlayStyle} onClick={close}>
      <div style={panelStyle} onClick={(e) => e.stopPropagation()}>
        <Header onClose={close} />
        <div style={{ padding: 16, overflowY: "auto", flex: 1 }}>
          <ModelSection entity="player" slot="playerModel" title="Player Champion" />
          <ModelSection entity="dummy" slot="defaultDummyModel" title="Default Dummy" />
          <ModelSection entity={null} slot="hookProjectileModel" title="Hook Projectile" />
          <IconSection slot="hookIcon" title="Hook Icon" />
          <IconSection slot="flashIcon" title="Flash Icon" />
          <IconSection slot="dodgeIcon" title="Dodge Icon" />
          <ResetAll />
        </div>
      </div>
    </div>
  );
}

function Header({ onClose }: { onClose: () => void }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "14px 16px",
        borderBottom: "1px solid #243149",
      }}
    >
      <div style={{ fontWeight: 700, color: "#9ec9ff", fontSize: 16 }}>Asset Manager</div>
      <button onClick={onClose} style={btnStyle}>Close</button>
    </div>
  );
}

function ModelSection({
  entity,
  slot,
  title,
}: {
  entity: "player" | "dummy" | null;
  slot: "playerModel" | "defaultDummyModel" | "hookProjectileModel";
  title: string;
}) {
  const cfg = useAssetStore((s) => s.registry[slot]) as ModelAssetConfig;
  const importFile = useAssetStore((s) => s.importRuntimeFile);
  const setModelTransform = useAssetStore((s) => s.setModelTransform);
  const resetSlot = useAssetStore((s) => s.resetSlot);
  const setClipOverride = useAssetStore((s) => s.setClipOverride);
  const clipOverrides = useAssetStore((s) => (entity ? s.clipOverrides[entity] : {}));
  const detected = useAssetStore((s) => (entity ? s.detectedClips[entity] : []));
  const fileRef = useRef<HTMLInputElement>(null);

  return (
    <div style={sectionStyle}>
      <div style={sectionTitleStyle}>{title}</div>
      <div style={rowStyle}>
        <div style={{ flex: 1 }}>
          <div style={labelStyle}>Path</div>
          <div style={pathStyle} title={cfg.path}>{cfg.path}</div>
        </div>
        <button style={btnStyle} onClick={() => fileRef.current?.click()}>Import…</button>
        <button style={btnStyle} onClick={() => resetSlot(slot)}>Reset</button>
        <input
          ref={fileRef}
          type="file"
          accept=".glb,.gltf,.fbx"
          style={{ display: "none" }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) importFile(slot, f);
            e.target.value = "";
          }}
        />
      </div>
      <div style={rowStyle}>
        <NumberField
          label="Scale"
          value={cfg.scale}
          step={0.05}
          min={0.001}
          max={100}
          onChange={(v) => setModelTransform(slot, { scale: v })}
        />
        <NumberField
          label="Rot X (rad)"
          value={cfg.rotation[0]}
          step={Math.PI / 12}
          min={-Math.PI * 2}
          max={Math.PI * 2}
          onChange={(v) => setModelTransform(slot, { rotation: [v, cfg.rotation[1], cfg.rotation[2]] })}
        />
        <NumberField
          label="Rot Y (rad)"
          value={cfg.rotation[1]}
          step={Math.PI / 12}
          min={-Math.PI * 2}
          max={Math.PI * 2}
          onChange={(v) => setModelTransform(slot, { rotation: [cfg.rotation[0], v, cfg.rotation[2]] })}
        />
        <NumberField
          label="Rot Z (rad)"
          value={cfg.rotation[2]}
          step={Math.PI / 12}
          min={-Math.PI * 2}
          max={Math.PI * 2}
          onChange={(v) => setModelTransform(slot, { rotation: [cfg.rotation[0], cfg.rotation[1], v] })}
        />
        <NumberField
          label="Y Offset"
          value={cfg.positionOffset[1]}
          step={0.05}
          min={-5}
          max={5}
          onChange={(v) =>
            setModelTransform(slot, { positionOffset: [cfg.positionOffset[0], v, cfg.positionOffset[2]] })
          }
        />
      </div>

      {entity && (
        <>
          <div style={{ ...labelStyle, marginTop: 12 }}>
            Detected clips ({detected.length}): {detected.length === 0 ? <i style={{ color: "#7d8aa1" }}>none loaded</i> : detected.join(", ")}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginTop: 8 }}>
            {ACTIONS.map((action) => (
              <div key={action} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <div style={labelStyle}>{action}</div>
                <select
                  value={clipOverrides[action] ?? ""}
                  onChange={(e) => setClipOverride(entity, action, e.target.value || null)}
                  style={selectStyle}
                >
                  <option value="">(auto)</option>
                  {detected.map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function IconSection({
  slot,
  title,
}: {
  slot: "hookIcon" | "flashIcon" | "dodgeIcon" | "moveIcon";
  title: string;
}) {
  const cfg = useAssetStore((s) => s.registry[slot]);
  const importFile = useAssetStore((s) => s.importRuntimeFile);
  const resetSlot = useAssetStore((s) => s.resetSlot);
  const fileRef = useRef<HTMLInputElement>(null);
  if (cfg.type !== "icon") return null;

  return (
    <div style={sectionStyle}>
      <div style={sectionTitleStyle}>{title}</div>
      <div style={rowStyle}>
        <div
          style={{
            width: 48,
            height: 48,
            border: "1px solid #2c4366",
            borderRadius: 8,
            background: "#0f1620",
            padding: 8,
            color: "#9ec9ff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            overflow: "hidden",
          }}
        >
          <img
            src={cfg.path}
            alt={cfg.name}
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = "none";
            }}
            style={{ width: "100%", height: "100%", objectFit: "contain" }}
          />
        </div>
        <div style={{ flex: 1 }}>
          <div style={labelStyle}>Path</div>
          <div style={pathStyle} title={cfg.path}>{cfg.path}</div>
        </div>
        <button style={btnStyle} onClick={() => fileRef.current?.click()}>Import…</button>
        <button style={btnStyle} onClick={() => resetSlot(slot)}>Reset</button>
        <input
          ref={fileRef}
          type="file"
          accept=".svg,.png,.webp,.jpg,.jpeg"
          style={{ display: "none" }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) importFile(slot, f);
            e.target.value = "";
          }}
        />
      </div>
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
  step,
  min,
  max,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step: number;
  min: number;
  max: number;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 100 }}>
      <div style={labelStyle}>{label}</div>
      <input
        type="number"
        value={Number(value.toFixed(4))}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        step={step}
        min={min}
        max={max}
        style={inputStyle}
      />
    </div>
  );
}

function ResetAll() {
  const resetAll = useAssetStore((s) => s.resetAll);
  return (
    <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
      <button
        style={{ ...btnStyle, background: "#3a1d1d", borderColor: "#7a3737", color: "#ffb9b9" }}
        onClick={() => {
          if (confirm("Reset all asset assignments to defaults?")) resetAll();
        }}
      >
        Reset all to defaults
      </button>
    </div>
  );
}

// ---------- styles ----------
const overlayStyle: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  background: "rgba(2,4,8,0.6)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 50,
};
const panelStyle: React.CSSProperties = {
  width: "min(960px, 92vw)",
  height: "min(720px, 88vh)",
  background: "#0e131c",
  border: "1px solid #243149",
  borderRadius: 14,
  display: "flex",
  flexDirection: "column",
  boxShadow: "0 20px 60px rgba(0,0,0,0.6)",
};
const sectionStyle: React.CSSProperties = {
  background: "#121925",
  border: "1px solid #1f2a3d",
  borderRadius: 10,
  padding: 14,
  marginBottom: 14,
};
const sectionTitleStyle: React.CSSProperties = {
  fontWeight: 700,
  color: "#cfe1ff",
  fontSize: 13.5,
  marginBottom: 10,
  letterSpacing: 0.3,
  textTransform: "uppercase",
};
const rowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-end",
  gap: 10,
  flexWrap: "wrap",
};
const labelStyle: React.CSSProperties = {
  fontSize: 11,
  color: "#7d8aa1",
};
const pathStyle: React.CSSProperties = {
  fontFamily: "ui-monospace, Menlo, Consolas, monospace",
  fontSize: 12,
  color: "#9fb4d4",
  background: "#0a0f17",
  border: "1px solid #1f2a3d",
  padding: "6px 8px",
  borderRadius: 6,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};
const btnStyle: React.CSSProperties = {
  background: "#1a2330",
  color: "#cfe1ff",
  border: "1px solid #2c4366",
  padding: "8px 12px",
  borderRadius: 8,
  cursor: "pointer",
  fontSize: 12.5,
};
const inputStyle: React.CSSProperties = {
  background: "#0a0f17",
  color: "#cfe1ff",
  border: "1px solid #2c4366",
  padding: "6px 8px",
  borderRadius: 6,
  fontSize: 12.5,
  width: 90,
};
const selectStyle: React.CSSProperties = {
  ...inputStyle,
  width: "100%",
};
