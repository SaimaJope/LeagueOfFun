import { Canvas } from "@react-three/fiber";
import { IsoCamera } from "@/game/camera/IsoCamera";
import { DodgeballArena } from "@/game/entities/DodgeballArena";
import { PvpWall, spawnForRole } from "@/game/entities/PvpWall";
import { useInput } from "@/game/input/useInput";
import { usePvpStore } from "@/stores/pvpStore";
import { MundoPlayer } from "@/game/entities/MundoPlayer";
import { OpponentChampion } from "@/game/entities/OpponentChampion";
import { CleaverAbility } from "@/game/abilities/CleaverAbility";
import { FlashAbility } from "@/game/abilities/FlashAbility";
import { BloodHitEffect } from "@/game/effects/BloodHitEffect";
import { PvpSync } from "@/game/network/PvpSync";

export function PvpScene() {
  useInput(null);
  const phase = usePvpStore((s) => s.phase);
  const orientation = usePvpStore((s) => s.settings.wallOrientation);
  const hostSpawn = spawnForRole("host", orientation);
  const clientSpawn = spawnForRole("client", orientation);

  // Once the match starts, hide the spawn markers and let the actual champions
  // take over. Before that we just show the arena + wall + spawn dots.
  const playing = phase === "playing" || phase === "ended";

  return (
    <Canvas
      shadows
      dpr={[1, 1.5]}
      camera={{ position: [0, 18, 11], fov: 42, near: 0.1, far: 200 }}
      gl={{ antialias: true, powerPreference: "high-performance" }}
    >
      <color attach="background" args={["#0b0d12"]} />
      <fog attach="fog" args={["#0b0d12", 30, 60]} />
      <ambientLight intensity={0.6} />
      <directionalLight
        position={[8, 16, 5]}
        intensity={1.2}
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-camera-left={-15}
        shadow-camera-right={15}
        shadow-camera-top={15}
        shadow-camera-bottom={-15}
      />
      <IsoCamera />
      <DodgeballArena />
      <PvpWall />

      {!playing && (
        <>
          <SpawnMarker position={hostSpawn} color="#5ab9ff" />
          <SpawnMarker position={clientSpawn} color="#ff7e7e" />
        </>
      )}

      {playing && (
        <>
          <MundoPlayer />
          <OpponentChampion />
          <CleaverAbility />
          <FlashAbility />
          <BloodHitEffect />
          <PvpSync />
        </>
      )}
    </Canvas>
  );
}

function SpawnMarker({
  position,
  color,
}: {
  position: [number, number, number];
  color: string;
}) {
  return (
    <group position={position}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
        <circleGeometry args={[0.7, 32]} />
        <meshBasicMaterial color={color} transparent opacity={0.5} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]}>
        <ringGeometry args={[0.66, 0.74, 48]} />
        <meshBasicMaterial color={color} />
      </mesh>
    </group>
  );
}
