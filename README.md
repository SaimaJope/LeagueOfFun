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

## Controls (Dodgeball mode)

- **Right-click** — move (League click-to-move; hold to track cursor)
- **Q** — throw cleaver (faster cast when running)
- **F** — Flash, short blink in cursor direction (20s CD)
- **S** — stop moving
