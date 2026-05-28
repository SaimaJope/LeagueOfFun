# Asset Import Guide

Two ways to plug in your assets:

1. **File-based** — drop into `public/assets/...` and edit `src/game/config/assets.config.ts`.
2. **Runtime** — (Phase 5) Open the in-game **Assets** panel and import a file from disk. The mapping is stored in `localStorage`.

## Where to put files

| Asset             | Path                                                | Slot in registry           |
|-------------------|-----------------------------------------------------|----------------------------|
| Player champion   | `public/assets/models/champions/thresh.glb`         | `playerModel`              |
| Dummy             | `public/assets/models/dummies/dummy.glb`            | `defaultDummyModel`        |
| Hook projectile   | `public/assets/models/champions/hook.glb`           | `hookProjectileModel`      |
| Hook icon         | `public/assets/icons/abilities/hook.svg`            | `hookIcon`                 |
| Flash icon        | `public/assets/icons/abilities/flash.svg`           | `flashIcon`                |
| Dodge icon        | `public/assets/icons/ui/dodge.svg`                  | `dodgeIcon`                |
| Sounds            | `public/assets/sounds/*.ogg|mp3|wav`                | `castSound` / `hitSound`   |

Your `thresh.glb` has already been copied to `public/assets/models/champions/thresh.glb`.

## Supported formats

- Models: `.glb` (recommended), `.gltf`, `.fbx`
- Icons: `.svg` (recommended), `.png`, `.webp`
- Sounds: `.ogg`, `.mp3`, `.wav`

## Recommended GLB export settings

- Embed textures
- Apply scale before export (Blender: `Object > Apply > All Transforms`)
- Y-up
- Include animations
- Single skeleton root

## Animation mapping

The simulator does **fuzzy match** on animation clip names. The mapping config (per model) looks like:

```ts
animations: {
  idle: "Idle",
  move: "Run",
  cast: "Cast_Q",
  hit: "Hit",
}
```

Match priority for each action:

| Action  | Tried names (any substring match, case-insensitive)           |
|---------|--------------------------------------------------------------|
| idle    | `idle`                                                       |
| move    | `run`, `walk`, `move`                                        |
| cast    | `cast`, `spell`, `hook`, `q`                                 |
| hit     | `hit`, `impact`, `damage`                                    |
| flash   | `flash`, `blink`, `teleport`                                 |

If no clip is found, the model still loads — it just does not play an animation for that action.

## Troubleshooting missing animations

1. Open the **Assets** panel (top-right). The animation list will show detected clip names.
2. Pick the correct clip from the dropdown for each action.
3. Click **Save**. Mappings persist in `localStorage`.

## Adjusting scale / rotation / offset

In `assets.config.ts` or in the Assets panel:

- `scale` — uniform scale multiplier
- `rotation` — `[x, y, z]` in radians (use `Math.PI` for 180°)
- `positionOffset` — `[x, y, z]` to lift the model off the ground if its origin is wrong

## Missing model

If a GLB fails to load, the simulator falls back to the colored capsule placeholder and shows a warning in the Assets panel. The game keeps running.
