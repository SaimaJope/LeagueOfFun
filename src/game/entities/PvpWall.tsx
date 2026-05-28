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

const WARD_COUNT = 5;
// Small totems lining the wall. Roughly 1/7 of the old size — the wards were
// dwarfing the champions before.
const WARD_VISUAL_HEIGHT = WALL_HEIGHT * 0.2;

/**
 * Ward fence visual. The orientation flag controls which axis the fence runs along:
 *  - "horizontal": wall spans the X axis, players spawn at +Z and -Z.
 *  - "vertical":   wall spans the Z axis, players spawn at +X and -X.
 * Use {@link isInsideWall} for collision and {@link spawnForRole}
 * for spawn positions.
 */
export function PvpWall() {
  const orientation = usePvpStore((s) => s.settings.wallOrientation);
  const state = useModel(PVP_WARD_WALL_MODEL);
  const isHorizontal = orientation === "horizontal";
  const wards = useMemo(() => {
    if (state.status !== "ready") return [];
    return Array.from({ length: WARD_COUNT }, () => createWardVisual(state.model.scene));
  }, [state]);

  return (
    <group>
      {wards.map((ward, index) => {
        const along = -WALL_HALF_LENGTH + (WALL_HALF_LENGTH * 2 * index) / (WARD_COUNT - 1);
        const position: [number, number, number] = isHorizontal
          ? [along, 0, 0]
          : [0, 0, along];
        return (
          <group
            key={index}
            position={position}
            // Turn the ward so its wings run ALONG the wall line (forming a fence)
            // rather than jutting across it.
            rotation={[0, isHorizontal ? 0 : Math.PI / 2, 0]}
            scale={ward.scale}
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
    scale: WARD_VISUAL_HEIGHT / Math.max(size.y, 0.001),
  };
}
