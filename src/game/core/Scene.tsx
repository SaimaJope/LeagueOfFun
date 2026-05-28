import { Canvas } from "@react-three/fiber";
import { IsoCamera } from "@/game/camera/IsoCamera";
import { Arena } from "@/game/entities/Arena";
import { Player } from "@/game/entities/Player";
import { Dummy } from "@/game/entities/Dummy";
import { HookAbility } from "@/game/abilities/HookAbility";
import { AnalysisOverlay } from "@/game/replay/AnalysisOverlay";
import { useInput } from "@/game/input/useInput";

export function Scene() {
  useInput(null);
  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      camera={{ position: [0, 22, 13], fov: 42, near: 0.1, far: 200 }}
      gl={{ antialias: true }}
    >
      <color attach="background" args={["#0b0d12"]} />
      <fog attach="fog" args={["#0b0d12", 40, 80]} />
      <ambientLight intensity={0.55} />
      <directionalLight
        position={[10, 18, 6]}
        intensity={1.1}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-left={-25}
        shadow-camera-right={25}
        shadow-camera-top={25}
        shadow-camera-bottom={-25}
      />
      <IsoCamera />
      <Arena />
      <Player />
      <Dummy />
      <HookAbility />
      <AnalysisOverlay />
    </Canvas>
  );
}
