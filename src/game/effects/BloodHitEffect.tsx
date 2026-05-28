import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { AdditiveBlending, type Group, type Mesh } from "three";
import { useHitEffectStore } from "@/stores/hitEffectStore";
import {
  BLOOD_BASE_HEIGHT,
  BLOOD_DURATION_MS,
  BLOOD_MAX_LENGTH,
  BLOOD_SHARD_COUNT,
} from "@/game/config/dodgeball.config";

interface Shard {
  mesh: { current: Mesh | null };
  angle: number;       // radial direction around the hit point (radians)
  tilt: number;        // small vertical tilt so shards splay in 3D, not flat on the ground
  lengthMul: number;   // 0.5..1.4, per-shard length
  thickness: number;   // per-shard half-width
  speed: number;       // 0.7..1.3, how fast it extends
}

/**
 * Old-school League blood splatter: a fan of bright additive red shards that
 * burst out from the hit point, peak fast, then fade. Listens to
 * useHitEffectStore — fire it from anywhere by calling
 * `useHitEffectStore.getState().trigger(position)`.
 */
export function BloodHitEffect() {
  const groupRef = useRef<Group>(null);
  const lastSerialRef = useRef(0);
  const castStartRef = useRef(0);
  const castIntensityRef = useRef(1);
  const castPositionRef = useRef<[number, number, number]>([0, 0, 0]);

  const shards = useMemo<Shard[]>(
    () =>
      Array.from({ length: BLOOD_SHARD_COUNT }, (_, i) => {
        // Distribute angles roughly evenly around the circle, with jitter.
        const base = (i / BLOOD_SHARD_COUNT) * Math.PI * 2;
        return {
          mesh: { current: null as Mesh | null },
          angle: base + (Math.random() - 0.5) * 0.4,
          tilt: (Math.random() - 0.5) * 0.5,
          lengthMul: 0.55 + Math.random() * 0.85,
          thickness: 0.05 + Math.random() * 0.07,
          speed: 0.75 + Math.random() * 0.55,
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
    // Pop-in to ~25% of lifetime, then fade.
    const popIn = Math.min(1, t01 / 0.18);
    const fadeOut = t01 < 0.25 ? 1 : 1 - (t01 - 0.25) / 0.75;
    const masterAlpha = popIn * fadeOut * castIntensityRef.current;

    const [cx, , cz] = castPositionRef.current;
    const cy = BLOOD_BASE_HEIGHT;

    for (const shard of shards) {
      const mesh = shard.mesh.current;
      if (!mesh) continue;
      // Length grows fast then settles; this is the "shard burst" feel.
      const grow = 1 - Math.pow(1 - Math.min(1, t01 * 2 * shard.speed), 2);
      const length = BLOOD_MAX_LENGTH * shard.lengthMul * grow * castIntensityRef.current;
      // The plane is 1×1 by default; scale X = length, Y = thickness.
      mesh.position.set(cx, cy, cz);
      // Yaw around Y for radial direction. Pitch slightly up/down for splay.
      mesh.rotation.set(shard.tilt, shard.angle, 0);
      mesh.scale.set(length, shard.thickness * 2, 1);
      // The plane origin is its center, so we have to translate it outward
      // along its local X so its inner end sits at the hit point.
      // Using translateOnAxis would alter position permanently — instead we
      // apply it via the world matrix by setting position offset along the dir.
      const half = length / 2;
      mesh.position.set(
        cx + Math.cos(shard.angle) * half,
        cy + Math.sin(shard.tilt) * half,
        cz - Math.sin(shard.angle) * half,
      );
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
            color="#ff1828"
            transparent
            opacity={0}
            blending={AdditiveBlending}
            depthWrite={false}
          />
        </mesh>
      ))}
    </group>
  );
}
