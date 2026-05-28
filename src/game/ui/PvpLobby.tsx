import { useState } from "react";
import { usePvpStore, type WallOrientation } from "@/stores/pvpStore";
import { chromasForTarget } from "@/stores/chromaStore";
import { cleanup, hostMatch, joinMatch, send, startMatch } from "@/game/network/peerNetwork";
import { useChromaStore } from "@/stores/chromaStore";

const MUNDO_SKINS = chromasForTarget("mundo");

export function PvpLobby() {
  const role = usePvpStore((s) => s.role);
  const phase = usePvpStore((s) => s.phase);
  const roomCode = usePvpStore((s) => s.roomCode);
  const status = usePvpStore((s) => s.status);
  const settings = usePvpStore((s) => s.settings);
  const hostSkin = usePvpStore((s) => s.hostSkin);
  const clientSkin = usePvpStore((s) => s.clientSkin);
  const patchSettings = usePvpStore((s) => s.patchSettings);
  const setHostSkin = usePvpStore((s) => s.setHostSkin);
  const setClientSkin = usePvpStore((s) => s.setClientSkin);
  const resetLobby = usePvpStore((s) => s.reset);

  const [joinCode, setJoinCode] = useState("");
  const [copied, setCopied] = useState(false);

  function goBack() {
    cleanup();
    resetLobby();
  }

  if (phase === "playing") return null;

  const isHost = role === "host";
  const isClient = role === "client";
  const canStart = isHost && phase === "ready";

  // Host edits the canonical settings & broadcasts; client just views them.
  function update<K extends keyof typeof settings>(key: K, value: (typeof settings)[K]) {
    if (!isHost) return;
    patchSettings({ [key]: value } as Partial<typeof settings>);
    // Re-broadcast so the client sees the change live.
    send({
      type: "settings",
      settings: { ...settings, [key]: value },
      hostSkin,
      clientSkin,
    });
  }

  // "Your skin" — set OWN field only, mirror the pick to the global chroma
  // store so the local Mundo model renders with it, and tell the peer.
  function updateOwnSkin(id: string) {
    if (isHost) {
      setHostSkin(id);
      send({ type: "settings", settings, hostSkin: id, clientSkin });
    } else if (isClient) {
      setClientSkin(id);
      send({ type: "skin", skin: id });
    }
    useChromaStore.getState().setChroma(id);
  }

  function inviteLink() {
    const base = `${window.location.origin}${window.location.pathname}`;
    return `${base}?join=${roomCode}`;
  }

  async function copyInviteLink() {
    if (!roomCode) return;
    const link = inviteLink();
    try {
      await navigator.clipboard.writeText(link);
    } catch {
      const el = document.createElement("textarea");
      el.value = link;
      el.setAttribute("readonly", "");
      el.style.position = "fixed";
      el.style.opacity = "0";
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  }

  return (
    <div style={panelStyle}>
      <div style={{ fontSize: 22, fontWeight: 800, color: "#9ec9ff", marginBottom: 6 }}>
        LeagueOfFun — PvP
      </div>

      {role === "none" && (
        <>
          <p style={{ color: "#aab4c5", marginTop: 0 }}>
            Host a room and share the invite link with a friend, or join with a code.
          </p>
          <div style={{ display: "flex", gap: 8 }}>
            <button style={primaryBtn} onClick={() => hostMatch()}>
              Host a room
            </button>
          </div>
          <div style={{ marginTop: 14 }}>
            <input
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              placeholder="ROOM CODE"
              style={inputStyle}
              maxLength={6}
            />
            <button
              style={{ ...primaryBtn, marginLeft: 8 }}
              onClick={() => joinCode.length >= 4 && joinMatch(joinCode)}
            >
              Join
            </button>
          </div>
        </>
      )}

      {role !== "none" && (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "6px 0 16px" }}>
            <button style={backBtn} onClick={goBack}>
              ← Back
            </button>
            <div style={{ fontSize: 13, color: "#7d8aa1" }}>Role:</div>
            <div style={{ fontWeight: 700, color: "#cfe1ff" }}>
              {role === "host" ? "Host (P1)" : "Client (P2)"}
            </div>
            {roomCode && (
              <div style={codeRow}>
                <span style={{ fontSize: 12, color: "#7d8aa1" }}>Code: </span>
                <span style={codeChip}>{roomCode}</span>
                <button style={copyBtn} onClick={copyInviteLink}>
                  {copied ? "Link copied" : "Copy link"}
                </button>
              </div>
            )}
          </div>

          <div style={{ color: "#9ec9ff", marginBottom: 12 }}>{status}</div>

          <div style={settingsGrid}>
            <Setting label={`Move speed × ${settings.moveSpeedMul.toFixed(2)}`}>
              <input
                type="range"
                min={1}
                max={3}
                step={0.05}
                value={settings.moveSpeedMul}
                disabled={!isHost}
                onChange={(e) => update("moveSpeedMul", Number(e.target.value))}
                style={rangeStyle}
              />
            </Setting>

            <Setting label={`Starting HP — ${settings.startingHp}`}>
              <input
                type="range"
                min={1}
                max={15}
                step={1}
                value={settings.startingHp}
                disabled={!isHost}
                onChange={(e) => update("startingHp", Number(e.target.value))}
                style={rangeStyle}
              />
            </Setting>

            <Setting label={`Q cooldown — ${(settings.qCooldownMs / 1000).toFixed(1)} s`}>
              <input
                type="range"
                min={500}
                max={10_000}
                step={100}
                value={settings.qCooldownMs}
                disabled={!isHost}
                onChange={(e) => update("qCooldownMs", Number(e.target.value))}
                style={rangeStyle}
              />
            </Setting>

            <Setting label={`Flash cooldown — ${(settings.flashCooldownMs / 1000).toFixed(0)} s`}>
              <input
                type="range"
                min={2_000}
                max={60_000}
                step={1_000}
                value={settings.flashCooldownMs}
                disabled={!isHost}
                onChange={(e) => update("flashCooldownMs", Number(e.target.value))}
                style={rangeStyle}
              />
            </Setting>

            <Setting label={`Wards — ${settings.wardCount}`}>
              <input
                type="range"
                min={0}
                max={12}
                step={1}
                value={settings.wardCount}
                disabled={!isHost}
                onChange={(e) => update("wardCount", Number(e.target.value))}
                style={rangeStyle}
              />
            </Setting>

            <Setting label={`Ward size — ${settings.wardSize.toFixed(2)}`}>
              <input
                type="range"
                min={0.05}
                max={0.8}
                step={0.01}
                value={settings.wardSize}
                disabled={!isHost}
                onChange={(e) => update("wardSize", Number(e.target.value))}
                style={rangeStyle}
              />
            </Setting>

            <Setting label="Wall orientation">
              <div style={{ display: "flex", gap: 6 }}>
                {(["vertical", "horizontal"] as WallOrientation[]).map((o) => (
                  <button
                    key={o}
                    onClick={() => update("wallOrientation", o)}
                    disabled={!isHost}
                    style={
                      settings.wallOrientation === o ? toggleBtnActive : toggleBtn
                    }
                  >
                    {o}
                  </button>
                ))}
              </div>
            </Setting>

            <Setting label="Your skin">
              <SkinPicker
                value={isHost ? hostSkin : clientSkin}
                onChange={updateOwnSkin}
              />
            </Setting>
          </div>

          {canStart && (
            <button
              style={{ ...primaryBtn, marginTop: 18, width: "100%", fontSize: 16 }}
              onClick={() => startMatch()}
            >
              Start match
            </button>
          )}
          {isClient && phase === "ready" && (
            <div style={{ marginTop: 18, color: "#7d8aa1", fontStyle: "italic" }}>
              Waiting for host to start the match…
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Setting({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 12, color: "#7d8aa1", marginBottom: 4 }}>{label}</div>
      {children}
    </div>
  );
}

function SkinPicker({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} style={selectStyle}>
      {MUNDO_SKINS.map((s) => (
        <option key={s.id} value={s.id}>
          {s.name}
        </option>
      ))}
    </select>
  );
}

const panelStyle: React.CSSProperties = {
  position: "absolute",
  top: "50%",
  left: "50%",
  transform: "translate(-50%, -50%)",
  width: 540,
  maxWidth: "92vw",
  background: "rgba(12,16,24,0.92)",
  border: "1px solid #2a3950",
  borderRadius: 14,
  padding: 22,
  color: "#cfe1ff",
  zIndex: 20,
  boxShadow: "0 10px 30px rgba(0,0,0,0.5)",
};

const settingsGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 14,
};

const backBtn: React.CSSProperties = {
  background: "#1a2330",
  color: "#9ec9ff",
  border: "1px solid #2c4366",
  padding: "5px 10px",
  borderRadius: 6,
  cursor: "pointer",
  fontSize: 12,
  fontWeight: 600,
};

const primaryBtn: React.CSSProperties = {
  background: "#244266",
  color: "#e6f1ff",
  border: "1px solid #5180c4",
  padding: "10px 16px",
  borderRadius: 8,
  cursor: "pointer",
  fontWeight: 700,
  fontSize: 13,
};

const toggleBtn: React.CSSProperties = {
  background: "#1a2330",
  color: "#cfe1ff",
  border: "1px solid #2c4366",
  padding: "6px 12px",
  borderRadius: 6,
  cursor: "pointer",
  fontSize: 12,
  textTransform: "capitalize",
};

const toggleBtnActive: React.CSSProperties = {
  ...toggleBtn,
  background: "#244266",
  borderColor: "#5180c4",
  color: "#ffffff",
  fontWeight: 700,
};

const inputStyle: React.CSSProperties = {
  background: "#0e1622",
  color: "#cfe1ff",
  border: "1px solid #2c4366",
  borderRadius: 6,
  padding: "8px 10px",
  fontSize: 14,
  letterSpacing: 2,
  width: 160,
};

const selectStyle: React.CSSProperties = {
  background: "#0e1622",
  color: "#cfe1ff",
  border: "1px solid #2c4366",
  borderRadius: 6,
  padding: "6px 8px",
  fontSize: 12,
  width: "100%",
};

const rangeStyle: React.CSSProperties = {
  width: "100%",
};

const codeRow: React.CSSProperties = {
  marginLeft: "auto",
  display: "flex",
  alignItems: "center",
  gap: 6,
};

const codeChip: React.CSSProperties = {
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
  fontWeight: 800,
  fontSize: 16,
  background: "#0e1622",
  border: "1px solid #5180c4",
  padding: "4px 10px",
  borderRadius: 6,
  letterSpacing: 3,
};

const copyBtn: React.CSSProperties = {
  background: "#1a2330",
  color: "#cfe1ff",
  border: "1px solid #2c4366",
  padding: "5px 9px",
  borderRadius: 6,
  cursor: "pointer",
  fontSize: 12,
  fontWeight: 700,
};
