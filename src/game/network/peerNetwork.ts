import Peer, { type DataConnection } from "peerjs";
import { usePvpStore, type PvpSettings } from "@/stores/pvpStore";

/**
 * Thin PeerJS wrapper. One side hosts and shows a room code, the other side
 * joins with that code. Both sides get a duplex data channel; messages flow
 * through `send()` and `subscribe()`.
 */

export type NetMessage =
  | { type: "settings"; settings: PvpSettings; hostSkin: string; clientSkin: string }
  | { type: "skin"; skin: string }
  | { type: "start" }
  | { type: "ping"; t: number }
  | { type: "hit"; target?: "host" | "client"; at: [number, number, number] }
  | {
      type: "state";
      t: number;
      pos: [number, number];
      vel?: [number, number];
      rotY: number;
      hp: number;
      cleaver: null | {
        px: number;
        pz: number;
        dirX: number;
        dirZ: number;
        distance: number;
        speed: number;
        phase: "windup" | "flight";
        startedAt: number;
      };
    }
  | { type: "reset" };

type Listener = (msg: NetMessage) => void;

let peer: Peer | null = null;
let conn: DataConnection | null = null;
const listeners = new Set<Listener>();
let pendingJoinRetry: number | null = null;
let joinRetryDeadline = 0;
let joinAttempt = 0;
let activeJoinCode = "";

const JOIN_RETRY_INTERVAL_MS = 900;
const JOIN_RETRY_TIMEOUT_MS = 20_000;
const JOIN_TIMEOUT_STATUS =
  "Error: host room not found. Make sure the host tab says waiting for friend, then retry the code.";
const PEER_OPTIONS = {
  config: {
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun1.l.google.com:19302" },
      { urls: "stun:stun2.l.google.com:19302" },
    ],
  },
};

function makeRoomCode() {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 6; i += 1) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
}

function cleanRoomCode(code: string) {
  return code.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function peerIdFor(code: string) {
  return `leagueoffun-${code.toLowerCase()}`;
}

export function hostMatch(): string {
  const store = usePvpStore.getState();
  cleanup();
  const code = makeRoomCode();
  const id = peerIdFor(code);
  store.setRoomCode("");
  store.setRole("host");
  store.setPhase("connecting");
  store.setStatus("Creating room...");

  peer = new Peer(id, PEER_OPTIONS);
  peer.on("open", () => {
    store.setRoomCode(code);
    store.setStatus(`Room ${code} - waiting for friend...`);
  });
  peer.on("error", (err) => {
    console.warn("[net] host error", err);
    store.setRoomCode("");
    store.setPhase("lobby");
    store.setStatus(`Error: ${err.type ?? err.message ?? err}. Click Host to try again.`);
  });
  peer.on("connection", (c) => {
    conn = c;
    wireConn(c);
    const markConnected = () => {
      if (conn !== c) return;
      const s = usePvpStore.getState();
      store.setStatus("Friend connected - adjust settings and click Start.");
      store.setPhase("ready");
      send({ type: "settings", settings: s.settings, hostSkin: s.hostSkin, clientSkin: s.clientSkin });
    };
    if (c.open) markConnected();
    else c.on("open", markConnected);
  });
  return code;
}

export function joinMatch(code: string) {
  const store = usePvpStore.getState();
  cleanup();
  const cleanCode = cleanRoomCode(code);
  activeJoinCode = cleanCode;
  store.setRoomCode(cleanCode);
  store.setRole("client");
  store.setPhase("connecting");
  joinRetryDeadline = performance.now() + JOIN_RETRY_TIMEOUT_MS;
  joinAttempt = 0;
  store.setStatus("Connecting...");

  peer = new Peer(PEER_OPTIONS);
  peer.on("open", () => {
    connectToHostPeer(cleanCode);
  });
  peer.on("error", (err) => {
    console.warn("[net] client error", err);
    if (isPeerUnavailable(err) && scheduleJoinRetry(cleanCode)) return;
    failJoin(`Error: ${err.type ?? err.message ?? err}. Check the code and try again.`);
  });
}

function connectToHostPeer(cleanCode: string) {
  if (!peer || usePvpStore.getState().role !== "client") return;
  if (performance.now() >= joinRetryDeadline) {
    failJoin(JOIN_TIMEOUT_STATUS);
    return;
  }

  clearJoinRetry();
  joinAttempt += 1;
  const store = usePvpStore.getState();
  store.setStatus(joinAttempt <= 1 ? "Connecting..." : `Host not visible yet - retrying (${joinAttempt})...`);

  if (conn) {
    const oldConn = conn;
    conn = null;
    try {
      oldConn.close();
    } catch {}
  }

  const nextConn = peer.connect(peerIdFor(cleanCode), { reliable: true });
  conn = nextConn;
  wireConn(nextConn);

  const markConnected = () => {
    if (conn !== nextConn) return;
    clearJoinRetry();
    store.setStatus("Connected - waiting for host to start.");
    store.setPhase("ready");
  };
  if (nextConn.open) markConnected();
  else nextConn.on("open", markConnected);

  pendingJoinRetry = window.setTimeout(() => {
    pendingJoinRetry = null;
    if (conn !== nextConn || nextConn.open || usePvpStore.getState().phase !== "connecting") return;
    conn = null;
    try {
      nextConn.close();
    } catch {}
    connectToHostPeer(cleanCode);
  }, JOIN_RETRY_INTERVAL_MS);
}

function scheduleJoinRetry(cleanCode: string) {
  if (!peer || performance.now() >= joinRetryDeadline) return false;
  if (pendingJoinRetry !== null) return true;
  pendingJoinRetry = window.setTimeout(() => {
    pendingJoinRetry = null;
    connectToHostPeer(cleanCode);
  }, JOIN_RETRY_INTERVAL_MS);
  usePvpStore.getState().setStatus("Host not visible yet - retrying...");
  return true;
}

function clearJoinRetry() {
  if (pendingJoinRetry === null) return;
  window.clearTimeout(pendingJoinRetry);
  pendingJoinRetry = null;
}

function failJoin(status: string) {
  clearJoinRetry();
  conn = null;
  const store = usePvpStore.getState();
  store.setStatus(status);
  store.setPhase("lobby");
}

function isPeerUnavailable(err: any) {
  return String(err?.type ?? err?.message ?? err).includes("peer-unavailable");
}

function wireConn(c: DataConnection) {
  c.on("data", (data) => {
    const msg = data as NetMessage;
    if (msg.type === "settings") {
      const store = usePvpStore.getState();
      store.patchSettings(msg.settings);
      store.setHostSkin(msg.hostSkin);
      store.setClientSkin(msg.clientSkin);
    } else if (msg.type === "start") {
      usePvpStore.getState().setPhase("playing");
    } else if (msg.type === "skin") {
      if (usePvpStore.getState().role === "host") {
        const store = usePvpStore.getState();
        store.setClientSkin(msg.skin);
        send({
          type: "settings",
          settings: store.settings,
          hostSkin: store.hostSkin,
          clientSkin: msg.skin,
        });
      }
    }
    for (const l of listeners) l(msg);
  });
  c.on("close", () => {
    if (conn !== c) return;
    const store = usePvpStore.getState();
    conn = null;
    if (store.role === "client" && activeJoinCode && store.phase === "connecting") {
      if (scheduleJoinRetry(activeJoinCode)) return;
      failJoin(JOIN_TIMEOUT_STATUS);
      return;
    }
    store.setStatus("Friend disconnected.");
    store.setPhase("lobby");
  });
  c.on("error", (err) => {
    console.warn("[net] conn error", err);
    const store = usePvpStore.getState();
    if (store.role === "client" && activeJoinCode && store.phase === "connecting" && isPeerUnavailable(err)) {
      if (scheduleJoinRetry(activeJoinCode)) return;
      failJoin(JOIN_TIMEOUT_STATUS);
    }
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
  const s = usePvpStore.getState();
  send({ type: "settings", settings: s.settings, hostSkin: s.hostSkin, clientSkin: s.clientSkin });
  send({ type: "start" });
  usePvpStore.getState().setPhase("playing");
}

export function isConnected() {
  return !!conn?.open;
}

export function cleanup() {
  listeners.clear();
  clearJoinRetry();
  joinRetryDeadline = 0;
  joinAttempt = 0;
  activeJoinCode = "";
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
