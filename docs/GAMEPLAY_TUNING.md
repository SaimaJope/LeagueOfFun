# Gameplay Tuning

Configs live in `src/game/config/`. The Settings panel (Phase 9) will expose live tuning for everything below.

## Hook (`hook.config.ts`)

| Field             | Default | Notes                                    |
|-------------------|---------|------------------------------------------|
| `range`           | 11      | Max travel distance (world units)        |
| `speed`           | 18      | Units per second                         |
| `width`           | 0.55    | Hit radius around hook center            |
| `castDelayMs`     | 380     | Windup before projectile spawns          |
| `cooldownMs`      | 1500    | Time between hooks                       |
| `maxTravelTimeMs` | 2500    | Safety timeout                           |
| `showAimLine`     | true    | Aim indicator while not casting          |
| `showRangeCircle` | true    | Range disc under the player              |
| `showPostCastLine`| true    | Brief line showing where the hook went   |
| `showCorrectAimPoint` | false | Trainer hint: where you SHOULD have aimed |

## AI (`ai.config.ts`)

The full set is documented inline in the file. Key fields:

- `mode` — one of `standing | basicMover | sidestep | flashDodger | juker | human | pro`
- `personality` — one of `coward | greedy | panic | juker | smooth | pro | baiter | faker`
- `reactionDelayMs` — how long after a cast starts the dummy reacts
- `dodgeChance` / `flashChance` / `mistakeRate` — 0..1 probabilities
- `flashCooldownMs` / `flashRange` — Flash ability tuning for dummies

## Difficulty presets (Phase 9)

| Preset | reactionDelayMs | dodgeChance | flashChance | mistakeRate |
|--------|----------------:|------------:|------------:|------------:|
| Easy   | 450             | 0.25        | 0.20        | 0.45        |
| Normal | 280             | 0.50        | 0.40        | 0.25        |
| Hard   | 180             | 0.70        | 0.65        | 0.12        |
| Pro    | 110             | 0.85        | 0.80        | 0.05        |
| Insane | 70              | 0.95        | 0.95        | 0.02        |

## Creating a new dummy personality

1. Add the name to the `Personality` union in `src/types/game.ts`.
2. Extend the decision functions in `src/game/ai/decisions.ts` (Phase 6).
3. Add a default tuning preset.
