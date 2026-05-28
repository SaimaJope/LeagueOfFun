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
    <div className="lol-panel" style={panelStyle}>
      <div className="lol-title" style={{ fontSize: 26, marginBottom: 4 }}>
        LeagueOfFun
      </div>
      <div style={{ fontSize: 12, letterSpacing: 3, color: "#5a6b7a", textTransform: "uppercase", marginBottom: 12 }}>
        Player vs Player
      </div>
      <hr className="lol-divider" style={{ marginBottom: 16 }} />

      {role === "none" && (
        <>
          <p style={{ color: "var(--lol-grey)", marginTop: 0, marginBottom: 16 }}>
            Host a room and share the invite link with a friend, or join with a code.
          </p>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="lol-btn lol-btn-primary" onClick={() => hostMatch()}>
              Host a room
            </button>
          </div>
          <div style={{ marginTop: 16, display: "flex", gap: 8 }}>
            <input
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              placeholder="ROOM CODE"
              className="lol-chip"
              style={{ width: 150, letterSpacing: 3, textAlign: "center" }}
              maxLength={6}
            />
            <button
              className="lol-btn"
              onClick={() => joinCode.length >= 4 && joinMatch(joinCode)}
            >
              Join
            </button>
          </div>
        </>
      )}

      {role !== "none" && (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
            <button className="lol-btn" onClick={goBack}>
              ← Back
            </button>
            <span className="lol-label">Role</span>
            <span className="lol-font" style={{ fontWeight: 700, color: "var(--lol-gold-1)" }}>
              {role === "host" ? "Host (P1)" : "Client (P2)"}
            </span>
            {roomCode && (
              <div style={codeRow}>
                <span className="lol-label">Code</span>
                <span className="lol-chip" style={{ fontSize: 16 }}>{roomCode}</span>
                <button className="lol-btn" onClick={copyInviteLink}>
                  {copied ? "Link copied" : "Copy link"}
                </button>
              </div>
            )}
          </div>

          <div className="lol-font" style={{ color: "var(--lol-teal-light)", marginBottom: 14, fontSize: 13, letterSpacing: 1 }}>
            {status}
          </div>

          <div style={settingsGrid}>
            <Setting label={`Move speed × ${settings.moveSpeedMul.toFixed(2)}`}>
              <input
                type="range"
                className="lol-range"
                min={1}
                max={3}
                step={0.05}
                value={settings.moveSpeedMul}
                disabled={!isHost}
                onChange={(e) => update("moveSpeedMul", Number(e.target.value))}
              />
            </Setting>

            <Setting label={`Starting HP — ${settings.startingHp}`}>
              <input
                type="range"
                className="lol-range"
                min={1}
                max={15}
                step={1}
                value={settings.startingHp}
                disabled={!isHost}
                onChange={(e) => update("startingHp", Number(e.target.value))}
              />
            </Setting>

            <Setting label={`Q cooldown — ${(settings.qCooldownMs / 1000).toFixed(1)} s`}>
              <input
                type="range"
                className="lol-range"
                min={500}
                max={10_000}
                step={100}
                value={settings.qCooldownMs}
                disabled={!isHost}
                onChange={(e) => update("qCooldownMs", Number(e.target.value))}
              />
            </Setting>

            <Setting label={`Flash cooldown — ${(settings.flashCooldownMs / 1000).toFixed(0)} s`}>
              <input
                type="range"
                className="lol-range"
                min={2_000}
                max={60_000}
                step={1_000}
                value={settings.flashCooldownMs}
                disabled={!isHost}
                onChange={(e) => update("flashCooldownMs", Number(e.target.value))}
              />
            </Setting>

            <Setting label={`Wards — ${settings.wardCount}`}>
              <input
                type="range"
                className="lol-range"
                min={0}
                max={12}
                step={1}
                value={settings.wardCount}
                disabled={!isHost}
                onChange={(e) => update("wardCount", Number(e.target.value))}
              />
            </Setting>

            <Setting label={`Ward size — ${settings.wardSize.toFixed(2)}`}>
              <input
                type="range"
                className="lol-range"
                min={0.05}
                max={0.8}
                step={0.01}
                value={settings.wardSize}
                disabled={!isHost}
                onChange={(e) => update("wardSize", Number(e.target.value))}
              />
            </Setting>

            <Setting label="Wall orientation">
              <div style={{ display: "flex", gap: 6 }}>
                {(["vertical", "horizontal"] as WallOrientation[]).map((o) => (
                  <button
                    key={o}
                    onClick={() => update("wallOrientation", o)}
                    disabled={!isHost}
                    className={`lol-toggle${settings.wallOrientation === o ? " active" : ""}`}
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
              className="lol-btn lol-btn-primary"
              style={{ marginTop: 18, width: "100%", fontSize: 15, padding: "12px 16px" }}
              onClick={() => startMatch()}
            >
              Start match
            </button>
          )}
          {isClient && phase === "ready" && (
            <div className="lol-font" style={{ marginTop: 18, color: "var(--lol-grey)", fontStyle: "italic" }}>
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
      <div className="lol-label" style={{ marginBottom: 5 }}>{label}</div>
      {children}
    </div>
  );
}

function SkinPicker({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  return (
    <select className="lol-select" value={value} onChange={(e) => onChange(e.target.value)}>
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
  width: 560,
  maxWidth: "92vw",
  padding: 26,
  color: "#cfe1ff",
  zIndex: 20,
};

const settingsGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 16,
};

const codeRow: React.CSSProperties = {
  marginLeft: "auto",
  display: "flex",
  alignItems: "center",
  gap: 8,
};
