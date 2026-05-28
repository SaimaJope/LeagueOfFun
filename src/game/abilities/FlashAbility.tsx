import { useFrame, useThree } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { AdditiveBlending, CanvasTexture, Sprite, SpriteMaterial } from "three";
import { inputState } from "@/game/input/useInput";
import { aimGroundPoint } from "@/game/input/aimRaycaster";
import { playerEntity } from "@/stores/entityStore";
import { useFlashStore } from "@/stores/flashStore";
import { useTrainerStore } from "@/stores/trainerStore";
import { usePvpStore } from "@/stores/pvpStore";
import { playMundoFlash } from "@/game/audio/mundoAudio";
import {
  DODGEBALL_ARENA_RADIUS,
  FLASH_COOLDOWN_MS,
  FLASH_RANGE,
  FLASH_VFX_DURATION_MS,
} from "@/game/config/dodgeball.config";

const ARENA_PADDING = 0.2;
const ORIGIN_PARTICLE_COUNT = 10;
const DEST_PARTICLE_COUNT = 14;
const HALO_BASE_SCALE = 1.6;

interface Particle {
  sprite: { current: Sprite | null };
  // Per-particle randomised motion params, picked once at mount.
  baseScale: number;
  driftX: number;
  driftY: number;
  driftZ: number;
  delay01: number;
}

export function FlashAbility() {
  const { camera } = useThree();
  const fWasDownRef = useRef(false);
  const triggerRef = useRef(useFlashStore.getState().trigger);

  const haloOriginRef = useRef<Sprite>(null);
  const haloDestRef = useRef<Sprite>(null);

  // Soft radial glow texture, generated once. This is the classic PS2 trick —
  // an additive billboarded sprite with a circular falloff sampled from a
  // 64×64 canvas. No PNG asset required.
  const glowTexture = useMemo(() => makeGlowTexture("#ffd56b"), []);

  const originParticles = useMemo<Particle[]>(() => makeParticles(ORIGIN_PARTICLE_COUNT, 0.18), []);
  const destParticles = useMemo<Particle[]>(() => makeParticles(DEST_PARTICLE_COUNT, 0.22), []);

  useFrame(() => {
    const now = performance.now();
    const fDown = !!inputState.keys["KeyF"];
    const flashStore = useFlashStore.getState();

    if (fDown && !fWasDownRef.current && now >= flashStore.cooldownUntil) {
      const origin: [number, number, number] = [
        playerEntity.position[0],
        0,
        playerEntity.position[2],
      ];
      const aim = aimGroundPoint(camera, inputState.mouseNDC.x, inputState.mouseNDC.y);
      const dx = (aim?.[0] ?? origin[0] + 1) - origin[0];
      const dz = (aim?.[2] ?? origin[2]) - origin[2];
      const aimDist = Math.hypot(dx, dz) || 1;
      const blinkDist = Math.min(FLASH_RANGE, aimDist);
      const dirX = dx / aimDist;
      const dirZ = dz / aimDist;
      let destX = origin[0] + dirX * blinkDist;
      let destZ = origin[2] + dirZ * blinkDist;
      const radius = DODGEBALL_ARENA_RADIUS - ARENA_PADDING;
      const destR = Math.hypot(destX, destZ);
      if (destR > radius) {
        const s = radius / destR;
        destX *= s;
        destZ *= s;
      }
      const destination: [number, number, number] = [destX, 0, destZ];

      playerEntity.position = [destX, 0, destZ];
      playerEntity.velocity = [0, 0, 0];
      const cd =
        useTrainerStore.getState().trainer === "pvp"
          ? usePvpStore.getState().settings.flashCooldownMs
          : FLASH_COOLDOWN_MS;
      triggerRef.current(origin, destination, now + cd, now);
      playMundoFlash(destination);
    }
    fWasDownRef.current = fDown;

    const elapsed = now - flashStore.lastCastAt;
    const active = flashStore.lastCastAt > 0 && elapsed <= FLASH_VFX_DURATION_MS;
    const t01 = active ? Math.min(1, elapsed / FLASH_VFX_DURATION_MS) : 0;

    // Halos: bright at the start, fade out smoothly. Destination grows slightly,
    // origin shrinks — both feel like air-rushing-into-vacuum.
    const haloFade = active ? 1 - smoothstep(0.0, 1.0, t01) : 0;
    placeHalo(haloOriginRef.current, flashStore.lastOrigin, HALO_BASE_SCALE * (1 - t01 * 0.4), haloFade);
    placeHalo(haloDestRef.current, flashStore.lastDestination, HALO_BASE_SCALE * (1 + t01 * 0.5), haloFade * 1.1);

    // Particles puff outward from both points, drifting slightly.
    animateParticles(originParticles, flashStore.lastOrigin, t01, active, 0.85);
    animateParticles(destParticles, flashStore.lastDestination, t01, active, 1.0);
  });

  return (
    <group>
      {/* Big soft halos at origin + destination. */}
      <sprite ref={haloOriginRef} scale={[0, 0, 0]}>
        <spriteMaterial
          attach="material"
          map={glowTexture}
          color="#ffd56b"
          transparent
          opacity={0}
          blending={AdditiveBlending}
          depthWrite={false}
        />
      </sprite>
      <sprite ref={haloDestRef} scale={[0, 0, 0]}>
        <spriteMaterial
          attach="material"
          map={glowTexture}
          color="#ffe89a"
          transparent
          opacity={0}
          blending={AdditiveBlending}
          depthWrite={false}
        />
      </sprite>

      {/* Particle puffs at origin (Mundo leaving) and destination (Mundo arriving). */}
      {originParticles.map((p, i) => (
        <sprite
          key={`o${i}`}
          ref={(s) => {
            if (s) p.sprite.current = s;
          }}
          scale={[0, 0, 0]}
        >
          <spriteMaterial
            attach="material"
            map={glowTexture}
            color="#ffd070"
            transparent
            opacity={0}
            blending={AdditiveBlending}
            depthWrite={false}
          />
        </sprite>
      ))}
      {destParticles.map((p, i) => (
        <sprite
          key={`d${i}`}
          ref={(s) => {
            if (s) p.sprite.current = s;
          }}
          scale={[0, 0, 0]}
        >
          <spriteMaterial
            attach="material"
            map={glowTexture}
            color="#ffe28a"
            transparent
            opacity={0}
            blending={AdditiveBlending}
            depthWrite={false}
          />
        </sprite>
      ))}
    </group>
  );
}

function makeParticles(count: number, baseSpread: number): Particle[] {
  return Array.from({ length: count }, () => ({
    sprite: { current: null as Sprite | null },
    baseScale: 0.35 + Math.random() * 0.35,
    // Spread the particles outward from the center point.
    driftX: (Math.random() - 0.5) * baseSpread * 6,
    driftY: 0.4 + Math.random() * 0.8,
    driftZ: (Math.random() - 0.5) * baseSpread * 6,
    delay01: Math.random() * 0.25,
  }));
}

function animateParticles(
  list: Particle[],
  center: [number, number, number],
  t01: number,
  active: boolean,
  brightness: number,
) {
  for (const p of list) {
    const sprite = p.sprite.current;
    if (!sprite) continue;
    if (!active) {
      sprite.scale.set(0, 0, 0);
      const mat = sprite.material as SpriteMaterial;
      if (mat) mat.opacity = 0;
      continue;
    }
    // Each particle has its own start delay; once started, it travels outward.
    const local = clamp01((t01 - p.delay01) / Math.max(0.001, 1 - p.delay01));
    const eased = 1 - Math.pow(1 - local, 2); // ease-out
    sprite.position.set(
      center[0] + p.driftX * eased,
      center[1] + p.driftY * eased,
      center[2] + p.driftZ * eased,
    );
    // Pop-in then shrink slowly.
    const scale = p.baseScale * (0.4 + eased * 0.9);
    sprite.scale.set(scale, scale, scale);
    // Quick rise to peak, then slow fade.
    const fade = local < 0.15 ? local / 0.15 : 1 - (local - 0.15) / 0.85;
    const mat = sprite.material as SpriteMaterial;
    if (mat) mat.opacity = Math.max(0, fade) * brightness;
  }
}

function placeHalo(
  sprite: Sprite | null,
  pos: [number, number, number],
  scale: number,
  opacity: number,
) {
  if (!sprite) return;
  sprite.position.set(pos[0], 0.6, pos[2]);
  sprite.scale.set(scale, scale, scale);
  const mat = sprite.material as SpriteMaterial;
  if (mat) mat.opacity = opacity;
}

function makeGlowTexture(color: string) {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    grad.addColorStop(0, "rgba(255,255,255,1)");
    grad.addColorStop(0.25, color);
    grad.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
  }
  const tex = new CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

function smoothstep(edge0: number, edge1: number, x: number) {
  const t = clamp01((x - edge0) / (edge1 - edge0 || 1));
  return t * t * (3 - 2 * t);
}

function clamp01(v: number) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
