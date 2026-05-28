import Peer, { type DataConnection } from "peerjs";
import { usePvpStore, type PvpSettings } from "@/stores/pvpStore";

/**
 * Thin PeerJS wrapper. One side hosts and shows a room code, the other side
 * joins with that code. Both sides get a duplex data channel; messages flow
 * through `send()` and `subscribe()`.
 *
 * Protocol (kept minimal — extended as the sim/sync code is added):
 *   host → client: { type: "settings", settings, hostSkin, clientSkin }
 *   host → client: { type: "start" }   // both sides enter "playing"
 *   client → host: { type: "skin", skin }
 *   either:        { type: "ping" }    // keepalive / latency probe
 */

export type NetMessage =
  | { type: "settings"; settings: PvpSettings; hostSkin: string; clientSkin: string }
  | { type: "skin"; skin: string }
  | { type: "start" }
  | { type: "ping"; t: number }
  /**
   * Per-player snapshot. Sent ~20 Hz by each peer.
   * cleaver = null when no projectile is in flight.
   */
  | {
      type: "state";
      t: number;
      pos: [number, number];
      rotY: number;
      hp: number;
      cleaver: null | {
        px: number;
        pz: number;
        dirX: number;
        dirZ: number;
        distance: number;
        phase: "windup" | "flight";
        startedAt: number;
      };
    }
  | { type: "reset" };

type Listener = (msg: NetMessage) => void;

let peer: Peer | null = null;
let conn: DataConnection | null = null;
const listeners = new Set<Listener>();

/** Random 6-character base36 code. */
function makeRoomCode() {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 6; i += 1) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
}

/** Map our short room codes to a full PeerJS peer ID. */
function peerIdFor(code: string) {
  return `leagueoffun-${code.toLowerCase()}`;
}

export function hostMatch(): string {
  const store = usePvpStore.getState();
  cleanup();
  const code = makeRoomCode();
  const id = peerIdFor(code);
  store.setRoomCode(code);
  store.setRole("host");
  store.setPhase("connecting");
  store.setStatus("Creating room…");

  peer = new Peer(id);
  peer.on("open", () => {
    store.setStatus(`Room ${code} — waiting for friend…`);
  });
  peer.on("error", (err) => {
    console.warn("[net] host error", err);
    // ID-taken is the most common failure — surface a clear retry hint.
    store.setStatus(`Error: ${err.type ?? err.message ?? err}. Click Host to try again.`);
  });
  peer.on("connection", (c) => {
    conn = c;
    wireConn(c);
    c.on("open", () => {
      const s = usePvpStore.getState();
      store.setStatus("Friend connected — adjust settings and click Start.");
      store.setPhase("ready");
      send({ type: "settings", settings: s.settings, hostSkin: s.hostSkin, clientSkin: s.clientSkin });
    });
  });
  return code;
}

export function joinMatch(code: string) {
  const store = usePvpStore.getState();
  cleanup();
  const cleanCode = code.trim().toUpperCase();
  store.setRoomCode(cleanCode);
  store.setRole("client");
  store.setPhase("connecting");
  store.setStatus("Connecting…");

  peer = new Peer();
  peer.on("open", () => {
    if (!peer) return;
    conn = peer.connect(peerIdFor(cleanCode), { reliable: true });
    wireConn(conn);
    conn.on("open", () => {
      store.setStatus("Connected — waiting for host to start.");
      store.setPhase("ready");
    });
  });
  peer.on("error", (err) => {
    console.warn("[net] client error", err);
    store.setStatus(`Error: ${err.type ?? err.message ?? err}. Check the code and try again.`);
  });
}

function wireConn(c: DataConnection) {
  c.on("data", (data) => {
    const msg = data as NetMessage;
    // Side-effects routed through here for the messages the network owns.
    if (msg.type === "settings") {
      const store = usePvpStore.getState();
      store.patchSettings(msg.settings);
      store.setHostSkin(msg.hostSkin);
      store.setClientSkin(msg.clientSkin);
    } else if (msg.type === "start") {
      usePvpStore.getState().setPhase("playing");
    } else if (msg.type === "skin") {
      // Client telling host which skin it picked.
      if (usePvpStore.getState().role === "host") {
        usePvpStore.getState().setClientSkin(msg.skin);
      }
    }
    for (const l of listeners) l(msg);
  });
  c.on("close", () => {
    usePvpStore.getState().setStatus("Friend disconnected.");
    usePvpStore.getState().setPhase("lobby");
    conn = null;
  });
  c.on("error", (err) => {
    console.warn("[net] conn error", err);
  });
}

export function send(msg: NetMessage) {
  if (!conn || !conn.open) return;
  conn.send(msg);
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function startMatch() {
  send({ type: "start" });
  usePvpStore.getState().setPhase("playing");
}

export function isConnected() {
  return !!conn?.open;
}

export function cleanup() {
  listeners.clear();
  if (conn) {
    try {
      conn.close();
    } catch {}
    conn = null;
  }
  if (peer) {
    try {
      peer.destroy();
    } catch {}
    peer = null;
  }
}
