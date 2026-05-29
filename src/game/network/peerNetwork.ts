import Peer, { type DataConnection } from "peerjs";
import { usePvpStore, type PvpSettings, type RoundSnap } from "@/stores/pvpStore";
import { usePvpEconomyStore } from "@/stores/pvpEconomyStore";

/**
 * Thin PeerJS wrapper. One side hosts and shows a room code, the other side
 * joins with that code. Both sides get a duplex data channel; messages flow
 * through `send()` and `subscribe()`.
 */

export type NetMessage =
  | { type: "settings"; settings: PvpSettings; hostSkin: string; clientSkin: string }
  | { type: "skin"; skin: string }
  | { type: "round"; snap: RoundSnap }
  | { type: "dance" }
  | { type: "ping"; t: number }
  | {
      type: "hit";
      target?: "host" | "client";
      at: [number, number, number];
      /** Frozen Mallet: slow the target for this many ms (omitted = no slow). */
      slowMs?: number;
    }
  | {
      type: "flash";
      origin: [number, number, number];
      destination: [number, number, number];
    }
  | {
      type: "state";
      t: number;
      pos: [number, number];
      vel?: [number, number];
      rotY: number;
      hp: number;
      /** This player's current max HP (startingHp + Warmog's). */
      maxHp?: number;
      /** true while this player is slowed (Frozen Mallet) — drives the glow. */
      slowed?: boolean;
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
      // STUN first — lets most peers connect directly (cheapest path).
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun1.l.google.com:19302" },
      { urls: "stun:stun2.l.google.com:19302" },
      // TURN relay fallback for strict/symmetric NAT + cellular, where a direct
      // P2P channel can't form. Uses Metered's free public "Open Relay" project
      // (no signup). It's rate-limited and best-effort — if it gets flaky,
      // swap in your own Metered API-key servers or another TURN provider.
      {
        urls: "turn:openrelay.metered.ca:80",
        username: "openrelayproject",
        credential: "openrelayproject",
      },
      {
        urls: "turn:openrelay.metered.ca:443",
        username: "openrelayproject",
        credential: "openrelayproject",
      },
      {
        urls: "turn:openrelay.metered.ca:443?transport=tcp",
        username: "openrelayproject",
        credential: "openrelayproject",
      },
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
    console.log(`[net] Host peer opened with ID: ${id}`);
  });
  peer.on("error", (err) => {
    console.error("[net] Host peer error:", err.type, err.message, err);
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
    console.log("[net] Client peer opened, connecting to host...");
    connectToHostPeer(cleanCode);
  });
  peer.on("error", (err) => {
    console.error("[net] Client peer error:", err.type, err.message, err);
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
    console.log("[net] Connection established with host");
    store.setStatus("Connected - waiting for host to start.");
    store.setPhase("ready");
  };
  if (nextConn.open) markConnected();
  else nextConn.on("open", markConnected);

  nextConn.on("error", (err) => {
    console.error("[net] Connection error:", err.type, err.message, err);
  });

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
  console.log("[net] Wiring connection");
  c.on("data", (data) => {
    const msg = data as NetMessage;
    console.log("[net] Received message:", msg.type);
    if (msg.type === "settings") {
      const store = usePvpStore.getState();
      store.patchSettings(msg.settings);
      store.setHostSkin(msg.hostSkin);
      store.setClientSkin(msg.clientSkin);
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
    } else if (msg.type === "round") {
      // Authoritative round flow from the host. Handled here (not via a
      // subscribe listener) so it survives cleanup()'s listeners.clear().
      const snap = msg.snap;
      const gameStart =
        snap.phase === "countdown" &&
        snap.round === 1 &&
        snap.roundWins.host === 0 &&
        snap.roundWins.client === 0;
      if (gameStart) usePvpEconomyStore.getState().resetGame();
      usePvpStore.getState().applyRoundSnap(snap);
    }
    for (const l of listeners) l(msg);
  });
  c.on("close", () => {
    console.log("[net] Connection closed");
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
    console.error("[net] Connection error:", err.type, err.message, err);
    const store = usePvpStore.getState();
    if (store.role === "client" && activeJoinCode && store.phase === "connecting" && isPeerUnavailable(err)) {
      if (scheduleJoinRetry(activeJoinCode)) return;
      failJoin(JOIN_TIMEOUT_STATUS);
    }
  });
}

export function send(msg: NetMessage) {
  if (!conn || !conn.open) {
    console.warn("[net] Cannot send message: connection not open");
    return;
  }
  console.log("[net] Sending message:", msg.type);
  conn.send(msg);
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
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
