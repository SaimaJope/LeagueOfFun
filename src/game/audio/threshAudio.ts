import { Vector3, type Camera } from "three";
import type { Vec3 } from "@/types/game";

const Q_CAST_SFX = [
  "/assets/sounds/Q1.mp3",
  "/assets/sounds/Q2.mp3",
  "/assets/sounds/Q3.mp3",
];

const Q_CAST_VOICE = [
  "/assets/sounds/Thresh_Original_Q_0.ogg",
  "/assets/sounds/Thresh_Original_Q_1.ogg",
  "/assets/sounds/Thresh_Original_Q_2.ogg",
];

const Q_HIT_SFX = [
  "/assets/sounds/Q_HITS_DUMMY_1.mp3",
  "/assets/sounds/Q_HITS_DUMMY_2.mp3",
];

const Q_PULL_SFX = ["/assets/sounds/Q%20pull.mp3"];

const MOVE_QUOTES = [
  "/assets/sounds/Quotes/Thresh_Original_Move_0.ogg",
  "/assets/sounds/Quotes/Thresh_Original_Move_2.ogg",
  "/assets/sounds/Quotes/Thresh_Original_Move_6.ogg",
  "/assets/sounds/Quotes/Thresh_Original_Move_9.ogg",
];

const Q_VOICE_CHANCE = 0.7;
const QUOTE_VOLUME = 0.7;
const MOVE_QUOTE_MIN_COOLDOWN_MS = 15_000;
const MOVE_QUOTE_MAX_COOLDOWN_MS = 30_000;
const SPATIAL_MIX = {
  // HRTF is realistic, but it dulls transients from this top-down camera angle.
  panningModel: "equalpower" as PanningModelType,
  distanceModel: "inverse" as DistanceModelType,
  refDistance: 7,
  maxDistance: 42,
  rolloffFactor: 0.45,
  sourceHeight: 1.1,
  presenceFrequency: 4_500,
  presenceGainDb: 2.5,
};

const forward = new Vector3();
const up = new Vector3();
const bufferCache = new Map<string, Promise<AudioBuffer>>();

let audioCtx: AudioContext | null = null;
let nextMoveQuoteAt = 0;

export function updateThreshAudioListener(camera: Camera) {
  const ctx = getAudioContext();
  const listener = ctx.listener;
  const position = camera.position;
  camera.getWorldDirection(forward);
  up.set(0, 1, 0).applyQuaternion(camera.quaternion);

  setAudioParam(listener.positionX, position.x);
  setAudioParam(listener.positionY, position.y);
  setAudioParam(listener.positionZ, position.z);
  setAudioParam(listener.forwardX, forward.x);
  setAudioParam(listener.forwardY, forward.y);
  setAudioParam(listener.forwardZ, forward.z);
  setAudioParam(listener.upX, up.x);
  setAudioParam(listener.upY, up.y);
  setAudioParam(listener.upZ, up.z);
}

export function playThreshQCast(position: Vec3) {
  playRandomAt(Q_CAST_SFX, position, 0.85);
  if (Math.random() < Q_VOICE_CHANCE) {
    playRandomAt(Q_CAST_VOICE, position, 0.72);
  }
}

export function playThreshQPull(position: Vec3) {
  playRandomAt(Q_PULL_SFX, position, 0.9);
}

export function playThreshQHit(position: Vec3) {
  playRandomAt(Q_HIT_SFX, position, 0.9);
}

export function maybePlayThreshMoveQuote(position: Vec3, now = performance.now()) {
  if (now < nextMoveQuoteAt) return;
  nextMoveQuoteAt = now + randomBetween(MOVE_QUOTE_MIN_COOLDOWN_MS, MOVE_QUOTE_MAX_COOLDOWN_MS);
  playRandomAt(MOVE_QUOTES, position, QUOTE_VOLUME);
}

function playRandomAt(paths: string[], position: Vec3, volume: number) {
  const path = paths[Math.floor(Math.random() * paths.length)];
  if (!path) return;

  void playAt(path, position, volume);
}

async function playAt(path: string, position: Vec3, volume: number) {
  try {
    const ctx = getAudioContext();
    if (ctx.state === "suspended") await ctx.resume();

    const source = ctx.createBufferSource();
    source.buffer = await loadBuffer(path, ctx);

    const { panner, presence, gain } = createSpatialVoice(ctx, position, volume);

    source.connect(panner);
    panner.connect(presence);
    presence.connect(gain);
    gain.connect(ctx.destination);
    source.start();
  } catch {
    // Keep gameplay input responsive if a browser blocks or fails audio decoding.
  }
}

function createSpatialVoice(ctx: AudioContext, position: Vec3, volume: number) {
  const gain = ctx.createGain();
  gain.gain.value = clamp01(volume);

  const presence = ctx.createBiquadFilter();
  presence.type = "highshelf";
  presence.frequency.value = SPATIAL_MIX.presenceFrequency;
  presence.gain.value = SPATIAL_MIX.presenceGainDb;

  const panner = ctx.createPanner();
  panner.panningModel = SPATIAL_MIX.panningModel;
  panner.distanceModel = SPATIAL_MIX.distanceModel;
  panner.refDistance = SPATIAL_MIX.refDistance;
  panner.maxDistance = SPATIAL_MIX.maxDistance;
  panner.rolloffFactor = SPATIAL_MIX.rolloffFactor;
  setAudioParam(panner.positionX, position[0]);
  setAudioParam(panner.positionY, position[1] + SPATIAL_MIX.sourceHeight);
  setAudioParam(panner.positionZ, position[2]);

  return { panner, presence, gain };
}

function loadBuffer(path: string, ctx: AudioContext) {
  const cached = bufferCache.get(path);
  if (cached) return cached;

  const promise = fetch(path)
    .then((res) => {
      if (!res.ok) throw new Error(`Failed to load audio ${path}`);
      return res.arrayBuffer();
    })
    .then((data) => ctx.decodeAudioData(data));
  bufferCache.set(path, promise);
  promise.catch(() => bufferCache.delete(path));
  return promise;
}

function getAudioContext() {
  audioCtx ??= new AudioContext();
  return audioCtx;
}

function setAudioParam(param: AudioParam | undefined, value: number) {
  param?.setValueAtTime(value, audioCtx?.currentTime ?? 0);
}

function randomBetween(min: number, max: number) {
  return min + Math.random() * (max - min);
}

function clamp01(v: number) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
