import { useMemo } from "react";
import { Box3, Vector3, type Group } from "three";
import { clone as cloneSkeleton } from "three/examples/jsm/utils/SkeletonUtils.js";
import { useModel } from "@/game/assets/modelLoader";
import { usePvpStore } from "@/stores/pvpStore";
import { DODGEBALL_ARENA_RADIUS } from "@/game/config/dodgeball.config";

export const WALL_THICKNESS = 0.4;
export const WALL_HEIGHT = 1.6;
export const WALL_HALF_LENGTH = DODGEBALL_ARENA_RADIUS - 0.6;
export const PVP_WARD_WALL_MODEL = "/assets/models/environment/vision_ward.glb";


/**
 * Ward fence visual. The orientation flag controls which axis the fence runs along:
 *  - "horizontal": wall spans the X axis, players spawn at +Z and -Z.
 *  - "vertical":   wall spans the Z axis, players spawn at +X and -X.
 * Use {@link isInsideWall} for collision and {@link spawnForRole}
 * for spawn positions.
 */
export function PvpWall() {
  const orientation = usePvpStore((s) => s.settings.wallOrientation);
  const wardCount = usePvpStore((s) => s.settings.wardCount);
  const wardSize = usePvpStore((s) => s.settings.wardSize);
  const state = useModel(PVP_WARD_WALL_MODEL);
  const isHorizontal = orientation === "horizontal";
  // Vertical fences run toward the camera's far (rocky) edge, where the end ward
  // pokes into the border — so cap vertical to 4 wards and pull their span in.
  const count = isHorizontal
    ? Math.max(0, Math.round(wardCount))
    : Math.min(4, Math.max(0, Math.round(wardCount)));
  const wardSpan = isHorizontal ? WALL_HALF_LENGTH : WALL_HALF_LENGTH * 0.7;
  // Ward height in world units, tunable live from the lobby's Ward size slider.
  const wardHeight = WALL_HEIGHT * wardSize;

  const wards = useMemo(() => {
    if (state.status !== "ready") return [];
    return Array.from({ length: count }, () => createWardVisual(state.model.scene));
  }, [state, count]);

  return (
    <group>
      {wards.map((ward, index) => {
        // Spread evenly along the wall; a single ward sits at the centre.
        const along =
          count <= 1 ? 0 : -wardSpan + (wardSpan * 2 * index) / (count - 1);
        const position: [number, number, number] = isHorizontal
          ? [along, 0, 0]
          : [0, 0, along];
        const scale = wardHeight / Math.max(ward.baseHeight, 0.001);
        return (
          <group
            key={index}
            position={position}
            // Turn the ward so its wings run ALONG the wall line (forming a fence)
            // rather than jutting across it.
            rotation={[0, isHorizontal ? 0 : Math.PI / 2, 0]}
            scale={scale}
          >
            <primitive object={ward.scene} />
          </group>
        );
      })}
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

function createWardVisual(source: Group) {
  const scene = cloneSkeleton(source) as Group;
  scene.updateMatrixWorld(true);

  const box = new Box3().setFromObject(scene);
  const center = new Vector3();
  const size = new Vector3();
  box.getCenter(center);
  box.getSize(size);

  scene.position.set(-center.x, -box.min.y, -center.z);
  scene.traverse((object: any) => {
    if (!object.isMesh) return;
    object.castShadow = true;
    object.receiveShadow = true;
    object.frustumCulled = false;
  });

  return {
    scene,
    // Native model height; the component scales this to the desired ward height.
    baseHeight: size.y,
  };
}
