/**
 * Tiny non-reactive trigger so anything (Ctrl+3 keybind, round-win) can ask the
 * local Mundo to dance. MundoPlayer edge-detects `serial` each frame.
 */
export const danceControl = { serial: 0 };

export function requestDance() {
  danceControl.serial += 1;
}

/** Mirror trigger for the networked opponent's dance (bumped on a "dance" msg). */
export const opponentDanceControl = { serial: 0 };

export function requestOpponentDance() {
  opponentDanceControl.serial += 1;
}
