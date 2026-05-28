import { useFrame, useLoader } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { SRGBColorSpace, TextureLoader, type Group, type Sprite, type SpriteMaterial } from "three";
import { useHitEffectStore } from "@/stores/hitEffectStore";
import { publicAsset } from "@/game/assets/publicPath";
import {
  BLOOD_BASE_HEIGHT,
  BLOOD_DURATION_MS,
  BLOOD_MIN_LENGTH,
  BLOOD_MAX_LENGTH,
  BLOOD_SHARD_COUNT,
  BLOOD_SHARD_VARIATION,
  BLOOD_SIZE_JITTER,
} from "@/game/config/dodgeball.config";

const BLOOD_TEXTURE_PATH = "/assets/effects/blood_streak.png";

interface Shard {
  sprite: { current: Sprite | null };
  angle: number;        // in-screen rotation around the hit point
  peakLength: number;   // per-shard absolute peak length (world units)
  thicknessMul: number;
  speed: number;        // how fast this shard reaches its peak size
}

/**
 * Old-school League blood splatter — a burst of textured streaks that radiate
 * from the hit point in every direction. Built from camera-facing sprites so
 * the whole 360° spread is visible from any camera angle (a vertical-plane
 * shard would go edge-on when the radial direction is parallel to camera view).
 */
export function BloodHitEffect() {
  const texture = useLoader(TextureLoader, publicAsset(BLOOD_TEXTURE_PATH));
  texture.colorSpace = SRGBColorSpace;

  const groupRef = useRef<Group>(null);
  const lastSerialRef = useRef(0);
  const castStartRef = useRef(0);
  const castIntensityRef = useRef(1);
  const castSizeFactorRef = useRef(1);
  const castPositionRef = useRef<[number, number, number]>([0, 0, 0]);

  const shards = useMemo<Shard[]>(() => {
    // Per-shard peak length picked between MIN and MAX, scaled by SHARD_VARIATION.
    //   VARIATION = 0 → every shard = MAX_LENGTH (uniform splat)
    //   VARIATION = 1 → uniform random in [MIN_LENGTH, MAX_LENGTH]
    //   In between → biased toward MAX (most shards are big, a few are small)
    const range = BLOOD_MAX_LENGTH - BLOOD_MIN_LENGTH;
    return Array.from({ length: BLOOD_SHARD_COUNT }, (_, i) => {
      const base = (i / BLOOD_SHARD_COUNT) * Math.PI * 2;
      const peakLength = BLOOD_MAX_LENGTH - Math.random() * range * BLOOD_SHARD_VARIATION;
      return {
        sprite: { current: null as Sprite | null },
        angle: base + (Math.random() - 0.5) * 0.55,
        peakLength,
        thicknessMul: 0.35 + Math.random() * 0.85,
        speed: 0.85 + Math.random() * 0.5,
      };
    });
  }, []);

  useFrame(() => {
    const now = performance.now();
    const store = useHitEffectStore.getState();
    if (store.serial !== lastSerialRef.current) {
      lastSerialRef.current = store.serial;
      castStartRef.current = now;
      castIntensityRef.current = store.intensity;
      castPositionRef.current = store.position;
      // Per-hit random size factor — every splat is visibly a different size,
      // independent of damage intensity. Range = 1 ± BLOOD_SIZE_JITTER.
      castSizeFactorRef.current = 1 + (Math.random() * 2 - 1) * BLOOD_SIZE_JITTER;
    }
    if (!groupRef.current) return;
    const elapsed = now - castStartRef.current;
    if (castStartRef.current === 0 || elapsed > BLOOD_DURATION_MS) {
      groupRef.current.visible = false;
      return;
    }
    groupRef.current.visible = true;

    const t01 = elapsed / BLOOD_DURATION_MS;
    // Sharp pop (8% lifetime), then ease-out fade.
    const popIn = Math.min(1, t01 / 0.08);
    const fadeOut = t01 < 0.18 ? 1 : Math.pow(1 - (t01 - 0.18) / 0.82, 1.5);
    const masterAlpha = popIn * fadeOut * castIntensityRef.current;
    const sizeFactor = castSizeFactorRef.current;

    const [cx, , cz] = castPositionRef.current;
    const cy = BLOOD_BASE_HEIGHT;

    for (const shard of shards) {
      const sprite = shard.sprite.current;
      if (!sprite) continue;

      // Growth curve: fast burst out from the hit point.
      const grow = 1 - Math.pow(1 - Math.min(1, t01 * 2.5 * shard.speed), 2);
      const length = shard.peakLength * grow * castIntensityRef.current * sizeFactor;
      const thickness =
        BLOOD_MAX_LENGTH * 0.35 * shard.thicknessMul * grow * castIntensityRef.current * sizeFactor;

      // All sprites sit at the hit center. Each one is rotated to its own
      // radial angle via material.rotation — that's an in-image rotation, so
      // it works in screen space regardless of camera angle.
      sprite.position.set(cx, cy, cz);
      sprite.scale.set(length, thickness, 1);
      const mat = sprite.material as SpriteMaterial;
      if (mat) {
        mat.rotation = shard.angle;
        mat.opacity = masterAlpha;
      }
    }
  });

  return (
    <group ref={groupRef} visible={false}>
      {shards.map((_, i) => (
        <sprite
          key={i}
          ref={(s) => {
            if (s) shards[i].sprite.current = s;
          }}
          scale={[0, 0, 0]}
        >
          <spriteMaterial
            attach="material"
            map={texture}
            color="#ffffff"
            transparent
            opacity={0}
            depthWrite={false}
            alphaTest={0.02}
          />
        </sprite>
      ))}
    </group>
  );
}
