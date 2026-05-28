import { Grid } from "@react-three/drei";
import { DODGEBALL_ARENA_RADIUS } from "@/game/config/dodgeball.config";

const FLOOR_SIZE = 40;
const RING_SEGMENTS = 96;

export function DodgeballArena() {
  return (
    <group>
      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]}>
        <planeGeometry args={[FLOOR_SIZE, FLOOR_SIZE]} />
        <meshStandardMaterial color="#1a1f2a" roughness={0.95} metalness={0} />
      </mesh>
      <Grid
        args={[FLOOR_SIZE, FLOOR_SIZE]}
        position={[0, 0, 0]}
        cellSize={1}
        cellThickness={0.6}
        cellColor="#2c3340"
        sectionSize={5}
        sectionThickness={1.2}
        sectionColor="#3d4b66"
        fadeDistance={40}
        fadeStrength={1}
        infiniteGrid={false}
      />
      {/* Inner court — slightly lighter disc inside the boundary */}
      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.005, 0]}>
        <circleGeometry args={[DODGEBALL_ARENA_RADIUS, RING_SEGMENTS]} />
        <meshStandardMaterial color="#222936" roughness={0.92} />
      </mesh>
      {/* Boundary ring */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.04, 0]}>
        <ringGeometry args={[DODGEBALL_ARENA_RADIUS - 0.08, DODGEBALL_ARENA_RADIUS, RING_SEGMENTS]} />
        <meshBasicMaterial color="#7a9bd1" transparent opacity={0.9} />
      </mesh>
    </group>
  );
}
