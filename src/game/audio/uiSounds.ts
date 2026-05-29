import { playGlobalSound } from "@/game/audio/mundoAudio";

/**
 * UI / menu sound effects. Files live under public/assets/sounds/ui/.
 * Missing files fail silently (the audio engine swallows load errors).
 */

const UI_DIR = "/assets/sounds/ui/";

const CLICK = `${UI_DIR}69_ui-generic_button_click_01.wav`;
const BUY = `${UI_DIR}81_ui-store_buy_01.wav`;
const DENIED = `${UI_DIR}10_scn1_btn_1.wav`;
const ACCEPT = "/assets/sounds/Accept.mp3";
const COUNTDOWN = "/assets/sounds/countdown.mp3";

/** Generic menu button press (not movement clicks). */
export function playUiClick() {
  playGlobalSound(CLICK, 0.6);
}

/** Successful item purchase. */
export function playUiBuy() {
  playGlobalSound(BUY, 0.8);
}

/** Tried to buy something you can't afford. */
export function playUiDenied() {
  playGlobalSound(DENIED, 0.8);
}

/** Big "accept" stinger for hosting a room / starting the match. */
export function playUiAccept() {
  playGlobalSound(ACCEPT, 0.85);
}

/** Per-number beep during the pre-round countdown. */
export function playCountdownTick() {
  playGlobalSound(COUNTDOWN, 0.8);
}
