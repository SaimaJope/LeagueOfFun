// Tiny self-hosted PeerJS signaling broker.
//
// This is the matchmaker that lets a host and a joiner find each other by room
// code. It does NOT relay gameplay — once two peers are introduced they talk
// directly (P2P), with the STUN/TURN servers in peerNetwork.ts handling NAT.
//
// Why we run our own: the free public broker (0.peerjs.com) is frequently
// overloaded and causes "host not found" even when both players are online.
//
// Run locally:   npm install && npm start   (from this server/ folder)
// On Render:     deployed automatically via ../render.yaml as a web service.

import { PeerServer } from "peer";

// Render injects PORT; default for local dev. The path must match the client's
// VITE_PEER_PATH (default "/myapp").
const port = Number(process.env.PORT ?? 9000);
const path = process.env.PEER_PATH ?? "/myapp";

PeerServer({
  port,
  path,
  // We sit behind Render's TLS-terminating proxy, so trust X-Forwarded-* and
  // report the public (https) origin to clients.
  proxied: true,
  // Drop peers we haven't heard from in a while so stale room codes don't pile
  // up (ms).
  alive_timeout: 60_000,
});

console.log(`[peer-server] signaling broker listening on :${port}${path}`);
