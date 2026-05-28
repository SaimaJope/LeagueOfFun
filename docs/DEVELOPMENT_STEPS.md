# Hook Trainer — Development Steps

## Quick start

```bash
npm install
npm run dev
```

Opens http://localhost:5173 (auto-opens).

## What is built so far

### Phase 1 — Project setup (DONE)
- Vite + React + TS scaffold
- Three.js / R3F / Drei / Zustand wired up
- Folder structure created
- Top-down/isometric `IsoCamera` that follows the player
- `Arena` with grid floor and fog
- Placeholder `Player` capsule (blue) controlled with WASD
- Placeholder `Dummy` capsule (red) standing at (6, 0, 0)
- `HUD` shell with score readout, ability bar, controls hint, and Asset/Settings buttons
- Global input system (`inputState`) reading keyboard and mouse
- Asset registry config (`src/game/config/assets.config.ts`) with slots and fallbacks
- Default hook and AI configs

### Phase 2 — Controls & Hook MVP (DONE)
- Q hook with windup, projectile, cooldown
- Range circle + aim line + post-cast trail
- Hit/miss detection with analysis snapshot

### Phase 3 — Asset pipeline (DONE)
- `modelLoader.ts` — GLB / GLTF / FBX loader with in-memory cache
- `AnimatedModel` — loads model, manages AnimationMixer, fades clips, falls back to capsule
- `clipMatcher.ts` — fuzzy match of clip names to actions
- `assetStore` — live asset registry, clip overrides, runtime blob imports, localStorage persistence
- HUD ability icons now load from `IconAssetConfig.path` (PNG / SVG / WebP) and fall back to inline SVG on error
- Player / Dummy render via `AnimatedModel` — your Thresh GLB auto-loads from `public/assets/models/champions/thresh.glb`

### Phase 4 — Animation system (PARTIAL — clip switching already in AnimatedModel)
### Phase 5 — Asset Manager UI
### Phase 5 — Asset Manager UI
### Phase 6 — Dummy AI
### Phase 7 — Flash system
### Phase 8 — Analysis + replay
### Phase 9 — Game modes + scoring
### Phase 10 — Polish

## Folder layout

```
src/
  app/           App shell
  game/
    core/        Scene root
    camera/      IsoCamera
    input/       Keyboard/mouse + ground raycaster
    entities/    Arena, Player, Dummy
    abilities/   (Phase 2) hook ability
    ai/          (Phase 6) dummy AI
    animation/   (Phase 4) AnimationController, AnimatedModel
    assets/      (Phase 3) loaders + asset manager backend
    physics/     (Phase 2) lightweight hit detection
    replay/      (Phase 8)
    scoring/     (Phase 9)
    config/      hook.config, ai.config, assets.config
    ui/          HUD, panels
  hooks/         (reserved for React hooks)
  stores/        Zustand stores
  types/         shared types
  utils/         shared utils

public/
  assets/
    models/champions/   <-- put thresh.glb here (already populated)
    models/dummies/     <-- put dummy.glb here
    icons/abilities/    <-- put hook.svg, flash.svg here
    icons/ui/
    sounds/
    textures/
```

## How to extend
- Add a new entity: create `src/game/entities/Foo.tsx`, mount it in `src/game/core/Scene.tsx`.
- Add a new ability config: drop a config in `src/game/config/`, expose it through `gameStore`.
- Add a new asset slot: extend `AssetRegistry` in `src/game/config/assets.config.ts`.
