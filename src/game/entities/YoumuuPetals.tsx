import { useFrame, useLoader } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { SRGBColorSpace, TextureLoader, type Group, type Sprite, type SpriteMaterial } from "three";
import { publicAsset } from "@/game/assets/publicPath";
import { usePvpEconomyStore } from "@/stores/pvpEconomyStore";
import { YOUMUU_DURATION_MS } from "@/game/config/pvpItems";

const PETAL_TEXTURE = "/assets/effects/youmuu_petal.png";
const COUNT = 8;
const MAX_OPACITY = 0.85;

interface Petal {
  ref: { current: Sprite | null };
  angle: number; // orbit angle around the champion
  orbitSpeed: number;
  radius: number;
  baseY: number;
  riseSpeed: number;
  spin: number;
  size: number;
  bobPhase: number;
}

/**
 * Subtle cherry-blossom swirl that orbits the champion while Youmuu's Ghostblade
 * is active. Rendered as a child of the player group, so it follows them as they
 * run. Non-reactive: polls the economy store's active timer each frame.
 */
export function YoumuuPetals() {
  const texture = useLoader(TextureLoader, publicAsset(PETAL_TEXTURE));
  texture.colorSpace = SRGBColorSpace;

  const groupRef = useRef<Group>(null);
  const startRef = useRef(0);
  const wasActiveRef = useRef(false);

  const petals = useMemo<Petal[]>(
    () =>
      Array.from({ length: COUNT }, (_, i) => ({
        ref: { current: null as Sprite | null },
        angle: (i / COUNT) * Math.PI * 2,
        orbitSpeed: 1.4 + Math.random() * 1.1,
        radius: 0.5 + Math.random() * 0.45,
        baseY: 0.3 + Math.random() * 1.0,
        riseSpeed: 0.25 + Math.random() * 0.35,
        spin: (Math.random() - 0.5) * 3,
        size: 0.22 + Math.random() * 0.14,
        bobPhase: Math.random() * Math.PI * 2,
      })),
    [],
  );

  useFrame(({ clock }, dt) => {
    const group = groupRef.current;
    if (!group) return;
    const now = performance.now();
    const activeUntil = usePvpEconomyStore.getState().youmuuActiveUntil;
    const active = now < activeUntil;
    group.visible = active;
    if (!active) {
      wasActiveRef.current = false;
      return;
    }
    if (!wasActiveRef.current) {
      wasActiveRef.current = true;
      startRef.current = now;
    }

    const t = Math.min(1, (now - startRef.current) / YOUMUU_DURATION_MS);
    const fadeIn = Math.min(1, t / 0.12);
    const fadeOut = t > 0.7 ? Math.max(0, (1 - t) / 0.3) : 1;
    const alpha = MAX_OPACITY * fadeIn * fadeOut;
    const elapsed = clock.elapsedTime;

    for (const p of petals) {
      const sprite = p.ref.current;
      if (!sprite) continue;
      p.angle += p.orbitSpeed * dt;
      // Slow rise, looping back down so the swirl is continuous.
      const rise = (elapsed * p.riseSpeed) % 1.8;
      const y = p.baseY + rise + Math.sin(elapsed * 2 + p.bobPhase) * 0.08;
      sprite.position.set(Math.cos(p.angle) * p.radius, y, Math.sin(p.angle) * p.radius);
      sprite.scale.set(p.size, p.size, 1);
      const mat = sprite.material as SpriteMaterial;
      mat.rotation += p.spin * dt;
      mat.opacity = alpha;
    }
  });

  return (
    <group ref={groupRef} visible={false}>
      {petals.map((p, i) => (
        <sprite
          key={i}
          ref={(s) => {
            if (s) petals[i].ref.current = s;
          }}
          scale={[0, 0, 0]}
        >
          <spriteMaterial
            attach="material"
            map={texture}
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
