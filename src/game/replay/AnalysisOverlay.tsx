import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import type { Mesh } from "three";
import { useGameStore } from "@/stores/gameStore";

/** Renders ghost markers + correct-aim marker for the last completed hook. */
export function AnalysisOverlay() {
  const analysis = useGameStore((s) => s.lastAnalysis);
  const dummyCastRef = useRef<Mesh>(null);
  const dummyImpactRef = useRef<Mesh>(null);
  const correctAimRef = useRef<Mesh>(null);
  const hookLineRef = useRef<Mesh>(null);

  useFrame(() => {
    const visible = !!analysis;
    if (dummyCastRef.current) dummyCastRef.current.visible = visible;
    if (dummyImpactRef.current) dummyImpactRef.current.visible = visible;
    if (correctAimRef.current) correctAimRef.current.visible = visible;
    if (hookLineRef.current) hookLineRef.current.visible = visible;
    if (!analysis) return;

    const [cx, , cz] = analysis.castOrigin;
    const dirX = analysis.direction[0];
    const dirZ = analysis.direction[2];
    const range = Math.hypot(dirX, dirZ) * 0; // not used
    void range;

    if (dummyCastRef.current) {
      const [x, , z] = analysis.dummyAtCast;
      dummyCastRef.current.position.set(x, 0.05, z);
    }
    if (dummyImpactRef.current) {
      const [x, , z] = analysis.dummyAtImpact;
      dummyImpactRef.current.position.set(x, 0.05, z);
    }
    if (correctAimRef.current) {
      const [x, , z] = analysis.correctAimPoint;
      correctAimRef.current.position.set(x, 0.05, z);
    }
    if (hookLineRef.current) {
      // hook traveled to its endpoint; reuse castOrigin + dummyAtImpact projection
      const tipX = cx + dirX * 11;
      const tipZ = cz + dirZ * 11;
      const ax = cx, az = cz;
      const bx = tipX, bz = tipZ;
      const midX = (ax + bx) / 2;
      const midZ = (az + bz) / 2;
      const len = Math.hypot(bx - ax, bz - az);
      hookLineRef.current.position.set(midX, 0.04, midZ);
      hookLineRef.current.scale.set(0.18, 1, len);
      hookLineRef.current.rotation.y = Math.atan2(bx - ax, bz - az);
    }
  });

  return (
    <group>
      {/* dummy ghost at cast start (blue) */}
      <mesh ref={dummyCastRef} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
        <ringGeometry args={[0.45, 0.55, 32]} />
        <meshBasicMaterial color="#4ea1ff" transparent opacity={0.7} />
      </mesh>
      {/* dummy ghost at impact (red) */}
      <mesh ref={dummyImpactRef} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
        <ringGeometry args={[0.45, 0.55, 32]} />
        <meshBasicMaterial color="#ff6b6b" transparent opacity={0.7} />
      </mesh>
      {/* correct aim point (green plus) */}
      <mesh ref={correctAimRef} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
        <ringGeometry args={[0.25, 0.35, 24]} />
        <meshBasicMaterial color="#5dd47b" transparent opacity={0.9} />
      </mesh>
      {/* hook trajectory (yellow strip) */}
      <mesh ref={hookLineRef} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial color="#ffd166" transparent opacity={0.55} />
      </mesh>
    </group>
  );
}
