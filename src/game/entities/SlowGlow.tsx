import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import { AdditiveBlending, type Mesh } from "three";

/**
 * Very subtle blue "chill" aura shown on a champion while they're slowed by
 * Frozen Mallet. Rendered as a child of the champion group so it tracks them.
 * `active` is polled every frame (non-reactive state lives outside React).
 */
export function SlowGlow({ active }: { active: () => boolean }) {
  const meshRef = useRef<Mesh>(null);

  useFrame(({ clock }) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const on = active();
    mesh.visible = on;
    if (!on) return;
    // Gentle breathing so it reads as an effect, not a static decal.
    const pulse = 0.14 + 0.05 * Math.sin(clock.elapsedTime * 6);
    (mesh.material as any).opacity = pulse;
    const s = 0.92 + 0.04 * Math.sin(clock.elapsedTime * 6);
    mesh.scale.setScalar(s);
  });

  return (
    <mesh ref={meshRef} position={[0, 1, 0]} visible={false}>
      <sphereGeometry args={[0.85, 20, 16]} />
      <meshBasicMaterial
        color="#6fb6ff"
        transparent
        opacity={0.14}
        blending={AdditiveBlending}
        depthWrite={false}
        toneMapped={false}
      />
    </mesh>
  );
}
