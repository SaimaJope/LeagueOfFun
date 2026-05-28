import { Grid } from "@react-three/drei";
import { PLAY_AREA_BOUND, PLAY_AREA_SIZE } from "@/game/config/playArea.config";

const ARENA_SIZE = 60;

export function Arena() {
  return (
    <group>
      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]}>
        <planeGeometry args={[ARENA_SIZE, ARENA_SIZE]} />
        <meshStandardMaterial color="#1a1f2a" roughness={0.95} metalness={0} />
      </mesh>
      <Grid
        args={[ARENA_SIZE, ARENA_SIZE]}
        position={[0, 0, 0]}
        cellSize={1}
        cellThickness={0.6}
        cellColor="#2c3340"
        sectionSize={5}
        sectionThickness={1.2}
        sectionColor="#3d4b66"
        fadeDistance={50}
        fadeStrength={1}
        infiniteGrid={false}
      />
      <group>
        <mesh position={[0, 0.04, -PLAY_AREA_BOUND]}>
          <boxGeometry args={[PLAY_AREA_SIZE, 0.05, 0.12]} />
          <meshBasicMaterial color="#5d84ba" transparent opacity={0.75} />
        </mesh>
        <mesh position={[0, 0.04, PLAY_AREA_BOUND]}>
          <boxGeometry args={[PLAY_AREA_SIZE, 0.05, 0.12]} />
          <meshBasicMaterial color="#5d84ba" transparent opacity={0.75} />
        </mesh>
        <mesh position={[-PLAY_AREA_BOUND, 0.04, 0]}>
          <boxGeometry args={[0.12, 0.05, PLAY_AREA_SIZE]} />
          <meshBasicMaterial color="#5d84ba" transparent opacity={0.75} />
        </mesh>
        <mesh position={[PLAY_AREA_BOUND, 0.04, 0]}>
          <boxGeometry args={[0.12, 0.05, PLAY_AREA_SIZE]} />
          <meshBasicMaterial color="#5d84ba" transparent opacity={0.75} />
        </mesh>
      </group>
    </group>
  );
}
