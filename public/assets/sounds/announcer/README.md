# Announcer voice lines

Drop these `.ogg` files here (referenced by `src/game/audio/announcer.ts`):

- `first_blood.ogg` — first kill of the game (played for BOTH players)
- `you_have_been_slaind.ogg` — you died (non-final round)
- `kill1.ogg`, `kill2.ogg`, `kill3.ogg` — you got a kill (one chosen at random)
- `victory.ogg` — you won the game (final round)
- `defeat.ogg` — you lost the game (final round)

Missing files fail silently, so the game still runs without them.
