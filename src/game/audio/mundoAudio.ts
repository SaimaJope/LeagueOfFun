import type { Vec3 } from "@/types/game";
import { publicAsset } from "@/game/assets/publicPath";
import { getMasterVolume } from "@/stores/audioStore";

const MUNDO_Q = "/assets/sounds/mundo/mundo_q.mp3";
const MUNDO_Q_IMPACT = "/assets/sounds/mundo/mundo_q_impact.mp3";
const MUNDO_FLASH = "/assets/sounds/mundo/flash.mp3";
const MUNDO_DEATH = "/assets/sounds/mundo/death.mp3";
const WOW = "/assets/sounds/mundo/wow.mp3";

const MOVE_QUOTES = [
  WOW,
  "/assets/sounds/mundo/haha.mp3",
  "/assets/sounds/mundo/mundo_quote.mp3",
];

const MOVE_QUOTE_MIN_COOLDOWN_MS = 10_000;
const MOVE_QUOTE_MAX_COOLDOWN_MS = 15_000;

const bufferCache = new Map<string, Promise<AudioBuffer>>();
let audioCtx: AudioContext | null = null;
let nextMoveQuoteAt = 0;

export function playMundoQCast(position: Vec3) {
  void playAt(MUNDO_Q, position, 0.9);
}

export function playMundoHit(position: Vec3) {
  void playAt(MUNDO_Q_IMPACT, position, 0.9);
}

export function playMundoFlash(position: Vec3) {
  void playAt(MUNDO_FLASH, position, 0.9);
}

export function playMundoDeath(position: Vec3) {
  void playAt(MUNDO_DEATH, position, 1.0);
}

/** Play a non-positional UI/announcer sound through the shared audio engine. */
export function playGlobalSound(path: string, volume = 1) {
  void playAt(path, [0, 0, 0], volume);
}

export function maybePlayMundoMoveQuote(position: Vec3, now = performance.now()) {
  if (now < nextMoveQuoteAt) return;
  nextMoveQuoteAt = now + randomBetween(MOVE_QUOTE_MIN_COOLDOWN_MS, MOVE_QUOTE_MAX_COOLDOWN_MS);
  playRandomAt(MOVE_QUOTES, position, 0.8);
}

function playRandomAt(paths: string[], position: Vec3, volume: number) {
  const path = paths[Math.floor(Math.random() * paths.length)];
  if (!path) return;
  void playAt(path, position, volume);
}

async function playAt(path: string, _position: Vec3, volume: number) {
  try {
    const ctx = getAudioContext();
    if (ctx.state === "suspended") await ctx.resume();
    const source = ctx.createBufferSource();
    source.buffer = await loadBuffer(path, ctx);
    const gain = ctx.createGain();
    gain.gain.value = clamp01(volume) * getMasterVolume();
    source.connect(gain);
    gain.connect(ctx.destination);
    source.start();
  } catch {
    // Swallow audio failures so they don't break gameplay.
  }
}

function loadBuffer(path: string, ctx: AudioContext) {
  const cached = bufferCache.get(path);
  if (cached) return cached;
  const promise = fetch(publicAsset(path))
    .then((res) => {
      if (!res.ok) throw new Error(`Failed to load audio ${path}`);
      return res.arrayBuffer();
    })
    .then((data) => ctx.decodeAudioData(data));
  bufferCache.set(path, promise);
  promise.catch(() => {
    bufferCache.delete(path);
    // Surface missing/broken audio so it's obvious which file to add.
    console.warn(`[audio] could not load ${publicAsset(path)} — is the file present?`);
  });
  return promise;
}

function getAudioContext() {
  audioCtx ??= new AudioContext();
  return audioCtx;
}

function randomBetween(min: number, max: number) {
  return min + Math.random() * (max - min);
}

function clamp01(v: number) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
