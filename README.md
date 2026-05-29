# LeagueOfFun

Browser-based 3D arena trainer inspired by League of Legends mechanics. Two modes:

- **Hook Trainer** — Thresh-style skillshots vs. dummies, with score tracking.
- **Dodgeball** — Dr. Mundo cleaver throws, Flash, motion-blurred projectiles, blood splatter, more soon (1v1 PvP planned).

Built with React + React Three Fiber + Vite.

## Play

Deployed at: https://saimajope.github.io/LeagueOfFun/

## Local dev

```
npm install
npm run dev
```

Then open http://localhost:5173.

## Build

```
npm run build
```

Outputs to `dist/`. The GitHub Actions workflow in `.github/workflows/deploy.yml` builds and publishes to GitHub Pages on every push to `main`.

## PvP signaling broker (fixes "host not found")

PvP uses PeerJS. Two players find each other by room code through a *signaling
broker*; once introduced they talk directly (P2P). By default PeerJS uses its
free public broker (`0.peerjs.com`), which is often overloaded and causes
`host not found` even when both players are online. The fix is to run our own
tiny broker — see `server/peer-server.mjs` and `render.yaml`.

**Deploy the broker (one time):**

1. Push this repo, then in Render → **New +** → **Blueprint**, pick this repo.
   It reads `render.yaml` and spins up the free `hook-trainer-peer` web service.
2. Copy its URL, e.g. `hook-trainer-peer.onrender.com`.

**Point the front-end at it:** set these build-time env vars (see `.env.example`)
wherever you build the site (GitHub Actions secrets, Render static-site env, or
a local `.env`):

```
VITE_PEER_HOST=hook-trainer-peer.onrender.com
VITE_PEER_PORT=443
VITE_PEER_PATH=/myapp
VITE_PEER_SECURE=true
```

Leave them unset for `npm run dev` — the client falls back to the public broker
for quick local testing.

> Render's free tier sleeps after ~15 min idle, so the first connection of a
> session can take ~30s while the broker wakes. Hit the URL once before playing,
> or ping it on a schedule to keep it warm.

## Controls (Dodgeball mode)

- **Right-click** — move (League click-to-move; hold to track cursor)
- **Q** — throw cleaver (faster cast when running)
- **F** — Flash, short blink in cursor direction (20s CD)
- **S** — stop moving
