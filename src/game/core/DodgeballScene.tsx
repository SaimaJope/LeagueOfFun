import { Canvas } from "@react-three/fiber";
import { IsoCamera } from "@/game/camera/IsoCamera";
import { DodgeballArena } from "@/game/entities/DodgeballArena";
import { MundoPlayer } from "@/game/entities/MundoPlayer";
import { DodgeballDummy } from "@/game/entities/DodgeballDummy";
import { CleaverAbility } from "@/game/abilities/CleaverAbility";
import { FlashAbility } from "@/game/abilities/FlashAbility";
import { BloodHitEffect } from "@/game/effects/BloodHitEffect";
import { useInput } from "@/game/input/useInput";

export function DodgeballScene() {
  useInput(null);
  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      camera={{ position: [0, 18, 11], fov: 42, near: 0.1, far: 200 }}
      gl={{ antialias: true }}
    >
      <color attach="background" args={["#0b0d12"]} />
      <fog attach="fog" args={["#0b0d12", 30, 60]} />
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
      />
      <IsoCamera />
      <DodgeballArena />
      <MundoPlayer />
      <DodgeballDummy />
      <CleaverAbility />
      <FlashAbility />
      <BloodHitEffect />
    </Canvas>
  );
}
