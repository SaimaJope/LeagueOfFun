import { useFrame, useLoader } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { NormalBlending, SRGBColorSpace, TextureLoader, type Group, type Mesh } from "three";
import { useHitEffectStore } from "@/stores/hitEffectStore";
import { publicAsset } from "@/game/assets/publicPath";
import {
  BLOOD_BASE_HEIGHT,
  BLOOD_DURATION_MS,
  BLOOD_MAX_LENGTH,
  BLOOD_SHARD_COUNT,
} from "@/game/config/dodgeball.config";

const BLOOD_TEXTURE_PATH = "/assets/effects/blood_streak.png";

interface Shard {
  mesh: { current: Mesh | null };
  angle: number;
  tilt: number;        // small Z-axis rotation per shard so streaks aren't perfectly radial
  lengthMul: number;
  thicknessMul: number;
  speed: number;
  flipY: number;       // -1 or 1, so streaks can fire in either direction along their plane
}

/**
 * Old-school League blood splatter — a tight burst of textured streaks that
 * pop out from the hit point and fade. Uses an art asset (`blood_streak.png`)
 * so the streaks look hand-drawn rather than like laser sticks.
 */
export function BloodHitEffect() {
  const texture = useLoader(TextureLoader, publicAsset(BLOOD_TEXTURE_PATH));
  // PNG with alpha — render in sRGB so the red doesn't go washed-pink.
  texture.colorSpace = SRGBColorSpace;

  const groupRef = useRef<Group>(null);
  const lastSerialRef = useRef(0);
  const castStartRef = useRef(0);
  const castIntensityRef = useRef(1);
  const castPositionRef = useRef<[number, number, number]>([0, 0, 0]);

  const shards = useMemo<Shard[]>(
    () =>
      Array.from({ length: BLOOD_SHARD_COUNT }, (_, i) => {
        const base = (i / BLOOD_SHARD_COUNT) * Math.PI * 2;
        return {
          mesh: { current: null as Mesh | null },
          angle: base + (Math.random() - 0.5) * 0.7,
          tilt: (Math.random() - 0.5) * 0.6,
          lengthMul: 0.6 + Math.random() * 0.6,
          thicknessMul: 0.45 + Math.random() * 0.6,
          speed: 0.8 + Math.random() * 0.5,
          flipY: Math.random() < 0.5 ? -1 : 1,
        };
      }),
    [],
  );

  useFrame(() => {
    const now = performance.now();
    const store = useHitEffectStore.getState();
    if (store.serial !== lastSerialRef.current) {
      lastSerialRef.current = store.serial;
      castStartRef.current = now;
      castIntensityRef.current = store.intensity;
      castPositionRef.current = store.position;
    }
    if (!groupRef.current) return;
    const elapsed = now - castStartRef.current;
    if (castStartRef.current === 0 || elapsed > BLOOD_DURATION_MS) {
      groupRef.current.visible = false;
      return;
    }
    groupRef.current.visible = true;

    const t01 = elapsed / BLOOD_DURATION_MS;
    // Sharp pop, then a longer fade — feels like an explosion, not a fountain.
    const popIn = Math.min(1, t01 / 0.08);
    const fadeOut = t01 < 0.18 ? 1 : Math.pow(1 - (t01 - 0.18) / 0.82, 1.5);
    const masterAlpha = popIn * fadeOut * castIntensityRef.current;

    const [cx, , cz] = castPositionRef.current;
    const cy = BLOOD_BASE_HEIGHT;

    for (const shard of shards) {
      const mesh = shard.mesh.current;
      if (!mesh) continue;
      const grow = 1 - Math.pow(1 - Math.min(1, t01 * 2.5 * shard.speed), 2);
      const length = BLOOD_MAX_LENGTH * shard.lengthMul * grow * castIntensityRef.current;
      const thickness = BLOOD_MAX_LENGTH * 0.35 * shard.thicknessMul * grow * castIntensityRef.current;

      // Plane spans 1×1 around its center. We translate the plane outward along
      // its local +X by half its length so the inner end (where the streak
      // starts in the texture) sits at the hit point.
      mesh.rotation.set(shard.tilt, shard.angle, 0);
      const half = length / 2;
      mesh.position.set(
        cx + Math.cos(shard.angle) * half,
        cy + Math.sin(shard.tilt) * half,
        cz - Math.sin(shard.angle) * half,
      );
      mesh.scale.set(length, thickness * shard.flipY, 1);

      const mat: any = mesh.material;
      if (mat && "opacity" in mat) mat.opacity = masterAlpha;
    }
  });

  return (
    <group ref={groupRef} visible={false}>
      {shards.map((_, i) => (
        <mesh
          key={i}
          ref={(m) => {
            if (m) shards[i].mesh.current = m;
          }}
        >
          <planeGeometry args={[1, 1]} />
          <meshBasicMaterial
            map={texture}
            color={0xffffff}
            transparent
            opacity={0}
            depthWrite={false}
            // Normal alpha blending — the PNG already carries the red color +
            // alpha mask. Additive would wash it pink.
            blending={NormalBlending}
            alphaTest={0.02}
          />
        </mesh>
      ))}
    </group>
  );
}
