import { usePvpStore } from "@/stores/pvpStore";
import { DODGEBALL_ARENA_RADIUS } from "@/game/config/dodgeball.config";

export const WALL_THICKNESS = 0.4;
export const WALL_HEIGHT = 1.6;
export const WALL_HALF_LENGTH = DODGEBALL_ARENA_RADIUS - 0.6;

/**
 * Wall geometry. The orientation flag controls which axis the wall runs along:
 *  - "horizontal": wall spans the X axis, players spawn at +Z and -Z.
 *  - "vertical":   wall spans the Z axis, players spawn at +X and -X.
 * Use {@link blocksRay} for projectile collision and {@link spawnForRole}
 * for spawn positions.
 */
export function PvpWall() {
  const orientation = usePvpStore((s) => s.settings.wallOrientation);
  const isHorizontal = orientation === "horizontal";
  const size: [number, number, number] = isHorizontal
    ? [WALL_HALF_LENGTH * 2, WALL_HEIGHT, WALL_THICKNESS]
    : [WALL_THICKNESS, WALL_HEIGHT, WALL_HALF_LENGTH * 2];

  return (
    <group>
      <mesh position={[0, WALL_HEIGHT / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={size} />
        <meshStandardMaterial color="#5d6680" roughness={0.7} metalness={0.15} />
      </mesh>
      {/* Top capping strip for visual readability */}
      <mesh position={[0, WALL_HEIGHT + 0.005, 0]}>
        <boxGeometry args={isHorizontal ? [WALL_HALF_LENGTH * 2, 0.04, WALL_THICKNESS + 0.06] : [WALL_THICKNESS + 0.06, 0.04, WALL_HALF_LENGTH * 2]} />
        <meshBasicMaterial color="#8aa3d6" />
      </mesh>
    </group>
  );
}

/** Test if a 2D point sits inside the wall slab (projectile collision). */
export function isInsideWall(x: number, z: number, orientation: "horizontal" | "vertical") {
  if (orientation === "horizontal") {
    return Math.abs(z) <= WALL_THICKNESS / 2 && Math.abs(x) <= WALL_HALF_LENGTH;
  }
  return Math.abs(x) <= WALL_THICKNESS / 2 && Math.abs(z) <= WALL_HALF_LENGTH;
}

/** Spawn position for a role: "host" sits +, "client" sits -, on the wall's perpendicular axis. */
export function spawnForRole(
  role: "host" | "client",
  orientation: "horizontal" | "vertical",
): [number, number, number] {
  const offset = DODGEBALL_ARENA_RADIUS * 0.6;
  if (orientation === "horizontal") {
    return [0, 0, role === "host" ? -offset : offset];
  }
  return [role === "host" ? -offset : offset, 0, 0];
}
