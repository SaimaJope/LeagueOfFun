import { Canvas } from "@react-three/fiber";
import { IsoCamera } from "@/game/camera/IsoCamera";
import { MundoPvpArena } from "@/game/entities/MundoPvpArena";
import { PvpWall, spawnForRole } from "@/game/entities/PvpWall";
import { PVP_SKY_COLOR, SkyHaze } from "@/game/entities/SkyHaze";
import { useInput } from "@/game/input/useInput";
import { usePvpStore } from "@/stores/pvpStore";
import { MundoPlayer } from "@/game/entities/MundoPlayer";
import { OpponentChampion } from "@/game/entities/OpponentChampion";
import { CleaverAbility } from "@/game/abilities/CleaverAbility";
import { FlashAbility } from "@/game/abilities/FlashAbility";
import { FlashVfx } from "@/game/abilities/FlashVfx";
import { BloodHitEffect } from "@/game/effects/BloodHitEffect";
import { PvpSync } from "@/game/network/PvpSync";
import { useOpponentFlashStore } from "@/stores/opponentFlashStore";

export function PvpScene() {
  useInput(null);
  const phase = usePvpStore((s) => s.phase);
  const orientation = usePvpStore((s) => s.settings.wallOrientation);
  const hostSpawn = spawnForRole("host", orientation);
  const clientSpawn = spawnForRole("client", orientation);

  // Once the match starts (countdown onward), hide the spawn markers and let the
  // actual champions take over. Before that we just show arena + wall + spawn dots.
  const inMatch =
    phase === "countdown" ||
    phase === "playing" ||
    phase === "intermission" ||
    phase === "shop" ||
    phase === "ended";

  return (
    <Canvas
      shadows="soft"
      dpr={[1, 1.5]}
      camera={{ position: [0, 18, 11], fov: 42, near: 0.1, far: 200 }}
      gl={{ antialias: true, powerPreference: "high-performance" }}
    >
      <color attach="background" args={[PVP_SKY_COLOR]} />
      <fog attach="fog" args={[PVP_SKY_COLOR, 20, 70]} />
      <ambientLight intensity={0.6} />
      <directionalLight
        position={[8, 16, 5]}
        intensity={1.2}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-left={-15}
        shadow-camera-right={15}
        shadow-camera-top={15}
        shadow-camera-bottom={-15}
        shadow-bias={-0.0004}
        shadow-normalBias={0.02}
      />
      <IsoCamera />
      <SkyHaze />
      <MundoPvpArena />
      <PvpWall />

      {!inMatch && (
        <>
          <SpawnMarker position={hostSpawn} color="#5ab9ff" />
          <SpawnMarker position={clientSpawn} color="#ff7e7e" />
        </>
      )}

      {inMatch && (
        <>
          <MundoPlayer />
          <OpponentChampion />
          <CleaverAbility />
          <FlashAbility />
          <FlashVfx read={useOpponentFlashStore.getState} />
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
