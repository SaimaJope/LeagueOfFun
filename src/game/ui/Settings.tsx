import { useGameStore } from "@/stores/gameStore";
import { DIFFICULTY, applyDifficulty } from "@/game/ai/personalities";
import type { AIMode, Personality } from "@/types/game";

const MODES: AIMode[] = ["standing", "basicMover", "sidestep", "flashDodger", "juker", "human", "pro"];
const PERSONALITIES: Personality[] = ["smooth", "coward", "greedy", "panic", "juker", "pro", "baiter", "faker"];

export function Settings() {
  const open = useGameStore((s) => s.showSettings);
  const close = useGameStore((s) => s.toggleSettings);
  const hookCfg = useGameStore((s) => s.hookConfig);
  const aiCfg = useGameStore((s) => s.aiConfig);
  const freezeDummies = useGameStore((s) => s.devMode.freezeDummies);
  const setHook = useGameStore((s) => s.setHookConfig);
  const setAI = useGameStore((s) => s.setAIConfig);
  const setFreezeDummies = useGameStore((s) => s.setFreezeDummies);

  if (!open) return null;

  return (
    <div style={overlay} onClick={close}>
      <div style={panel} onClick={(e) => e.stopPropagation()}>
        <div style={header}>
          <div style={{ fontWeight: 700, color: "#9ec9ff", fontSize: 16 }}>Settings</div>
          <button onClick={close} style={btn}>Close</button>
        </div>
        <div style={{ padding: 16, overflowY: "auto", flex: 1 }}>
          <Section title="Difficulty preset">
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {Object.entries(DIFFICULTY).map(([k, p]) => (
                <button
                  key={k}
                  style={btn}
                  onClick={() => setAI(applyDifficulty(p, aiCfg))}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </Section>

          <Section title="Dev tools">
            <Toggle label="Freeze dummies (F2)" value={freezeDummies} onChange={setFreezeDummies} />
          </Section>

          <Section title="AI mode">
            <select
              value={aiCfg.mode}
              onChange={(e) => setAI({ mode: e.target.value as AIMode })}
              style={input}
            >
              {MODES.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </Section>

          <Section title="Personality">
            <select
              value={aiCfg.personality}
              onChange={(e) => setAI({ personality: e.target.value as Personality })}
              style={input}
            >
              {PERSONALITIES.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </Section>

          <Section title="Dummy tuning">
            <Slider label="Move speed" value={aiCfg.moveSpeed} min={0} max={10} step={0.1} onChange={(v) => setAI({ moveSpeed: v })} />
            <Slider label="Reaction delay (ms)" value={aiCfg.reactionDelayMs} min={0} max={800} step={10} onChange={(v) => setAI({ reactionDelayMs: v })} />
            <Slider label="Dodge chance" value={aiCfg.dodgeChance} min={0} max={1} step={0.05} onChange={(v) => setAI({ dodgeChance: v })} />
            <Slider label="Flash chance" value={aiCfg.flashChance} min={0} max={1} step={0.05} onChange={(v) => setAI({ flashChance: v })} />
            <Slider label="Flash cooldown (ms)" value={aiCfg.flashCooldownMs} min={1000} max={60000} step={500} onChange={(v) => setAI({ flashCooldownMs: v })} />
            <Slider label="Flash range" value={aiCfg.flashRange} min={1} max={8} step={0.1} onChange={(v) => setAI({ flashRange: v })} />
            <Slider label="Mistake rate" value={aiCfg.mistakeRate} min={0} max={1} step={0.05} onChange={(v) => setAI({ mistakeRate: v })} />
            <Slider label="Juke frequency" value={aiCfg.jukeFrequency} min={0} max={3} step={0.1} onChange={(v) => setAI({ jukeFrequency: v })} />
            <Slider label="Path change interval (ms)" value={aiCfg.pathChangeInterval} min={300} max={4000} step={100} onChange={(v) => setAI({ pathChangeInterval: v })} />
          </Section>

          <Section title="Hook tuning">
            <Slider label="Range" value={hookCfg.range} min={3} max={25} step={0.5} onChange={(v) => setHook({ range: v })} />
            <Slider label="Speed" value={hookCfg.speed} min={4} max={50} step={0.5} onChange={(v) => setHook({ speed: v })} />
            <Slider label="Width" value={hookCfg.width} min={0.1} max={2} step={0.05} onChange={(v) => setHook({ width: v })} />
            <Slider label="Cast delay (ms)" value={hookCfg.castDelayMs} min={0} max={1500} step={20} onChange={(v) => setHook({ castDelayMs: v })} />
            <Slider label="Cooldown (ms)" value={hookCfg.cooldownMs} min={0} max={10000} step={100} onChange={(v) => setHook({ cooldownMs: v })} />
            <Slider label="Recast delay (ms)" value={hookCfg.recastDelayMs} min={0} max={1500} step={20} onChange={(v) => setHook({ recastDelayMs: v })} />
            <Slider label="Recast dash speed" value={hookCfg.recastDashSpeed} min={4} max={30} step={0.5} onChange={(v) => setHook({ recastDashSpeed: v })} />
            <Toggle label="Pull target on hit" value={hookCfg.pullTargetOnHit} onChange={(v) => setHook({ pullTargetOnHit: v })} />
          </Section>

          <Section title="Overlays">
            <Toggle label="Show range circle" value={hookCfg.showRangeCircle} onChange={(v) => setHook({ showRangeCircle: v })} />
            <Toggle label="Show aim line" value={hookCfg.showAimLine} onChange={(v) => setHook({ showAimLine: v })} />
            <Toggle label="Show post-cast line" value={hookCfg.showPostCastLine} onChange={(v) => setHook({ showPostCastLine: v })} />
            <Toggle label="Show correct aim point (trainer)" value={hookCfg.showCorrectAimPoint} onChange={(v) => setHook({ showCorrectAimPoint: v })} />
          </Section>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={section}>
      <div style={sectionTitle}>{title}</div>
      {children}
    </div>
  );
}

function Slider({ label, value, min, max, step, onChange }: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
      <div style={{ flex: "0 0 200px", fontSize: 12, color: "#cfe1ff" }}>{label}</div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(parseFloat(e.target.value))} style={{ flex: 1 }} />
      <div style={{ width: 70, textAlign: "right", fontFamily: "ui-monospace, Menlo, Consolas, monospace", fontSize: 12, color: "#9fb4d4" }}>
        {value.toFixed(2)}
      </div>
    </div>
  );
}

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, fontSize: 12.5, color: "#cfe1ff" }}>
      <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

const overlay: React.CSSProperties = { position: "absolute", inset: 0, background: "rgba(2,4,8,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 };
const panel: React.CSSProperties = { width: "min(720px, 92vw)", height: "min(720px, 88vh)", background: "#0e131c", border: "1px solid #243149", borderRadius: 14, display: "flex", flexDirection: "column", boxShadow: "0 20px 60px rgba(0,0,0,0.6)" };
const header: React.CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 16px", borderBottom: "1px solid #243149" };
const section: React.CSSProperties = { background: "#121925", border: "1px solid #1f2a3d", borderRadius: 10, padding: 14, marginBottom: 14 };
const sectionTitle: React.CSSProperties = { fontWeight: 700, color: "#cfe1ff", fontSize: 13.5, marginBottom: 10, letterSpacing: 0.3, textTransform: "uppercase" };
const btn: React.CSSProperties = { background: "#1a2330", color: "#cfe1ff", border: "1px solid #2c4366", padding: "8px 12px", borderRadius: 8, cursor: "pointer", fontSize: 12.5 };
const input: React.CSSProperties = { background: "#0a0f17", color: "#cfe1ff", border: "1px solid #2c4366", padding: "6px 8px", borderRadius: 6, fontSize: 12.5, width: 200 };
