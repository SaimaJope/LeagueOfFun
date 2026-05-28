import { Raycaster, Plane, Vector3, Vector2, type Camera } from "three";

const ray = new Raycaster();
const groundPlane = new Plane(new Vector3(0, 1, 0), 0);
const out = new Vector3();
const ndc = new Vector2();

/**
 * Project mouse NDC onto the ground plane (y=0) using the given camera.
 * Returns null if the ray does not intersect.
 */
export function aimGroundPoint(camera: Camera, ndcX: number, ndcY: number): [number, number, number] | null {
  ndc.set(ndcX, ndcY);
  ray.setFromCamera(ndc, camera);
  const hit = ray.ray.intersectPlane(groundPlane, out);
  if (!hit) return null;
  return [out.x, 0, out.z];
}
