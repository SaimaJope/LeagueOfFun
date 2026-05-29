import { playGlobalSound } from "@/game/audio/mundoAudio";

/**
 * PvP announcer + item activation voice lines. Files live under
 *   public/assets/sounds/announcer/   (announcer lines)
 *   public/assets/sounds/items/       (item activations)
 * Missing files fail silently (the audio engine swallows load errors), so the
 * game still runs before the .ogg assets are dropped in.
 */

const ANNOUNCER_DIR = "/assets/sounds/announcer/";
const ITEMS_DIR = "/assets/sounds/items/";

const FIRST_BLOOD = `${ANNOUNCER_DIR}first_blood.ogg`;
const SLAIN = `${ANNOUNCER_DIR}you_have_been_slaind.ogg`;
const KILLS = [
  `${ANNOUNCER_DIR}kill1.ogg`,
  `${ANNOUNCER_DIR}kill2.ogg`,
  `${ANNOUNCER_DIR}kill3.ogg`,
];
const VICTORY = `${ANNOUNCER_DIR}victory.ogg`;
const DEFEAT = `${ANNOUNCER_DIR}defeat.ogg`;

const YOUMUU = `${ITEMS_DIR}youmuus.ogg`;

const ANNOUNCER_VOLUME = 0.9;

export function announceFirstBlood() {
  playGlobalSound(FIRST_BLOOD, ANNOUNCER_VOLUME);
}

export function announceSlain() {
  playGlobalSound(SLAIN, ANNOUNCER_VOLUME);
}

export function announceKill() {
  const path = KILLS[Math.floor(Math.random() * KILLS.length)];
  playGlobalSound(path, ANNOUNCER_VOLUME);
}

export function announceVictory() {
  playGlobalSound(VICTORY, ANNOUNCER_VOLUME);
}

export function announceDefeat() {
  playGlobalSound(DEFEAT, ANNOUNCER_VOLUME);
}

export function playYoumuuActivate() {
  playGlobalSound(YOUMUU, 0.85);
}
