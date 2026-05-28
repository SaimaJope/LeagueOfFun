import type { Vec3 } from "@/types/game";

/** Shortest distance from point P to the segment A->B (XZ plane). */
export function distancePointToSegmentXZ(p: Vec3, a: Vec3, b: Vec3): number {
  const ax = a[0], az = a[2];
  const bx = b[0], bz = b[2];
  const px = p[0], pz = p[2];
  const dx = bx - ax;
  const dz = bz - az;
  const len2 = dx * dx + dz * dz;
  if (len2 < 1e-6) {
    const ex = px - ax, ez = pz - az;
    return Math.hypot(ex, ez);
  }
  let t = ((px - ax) * dx + (pz - az) * dz) / len2;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const cx = ax + t * dx;
  const cz = az + t * dz;
  return Math.hypot(px - cx, pz - cz);
}

/** XZ-plane direction from a to b, normalized. */
export function dirXZ(from: Vec3, to: Vec3): Vec3 {
  const dx = to[0] - from[0];
  const dz = to[2] - from[2];
  const len = Math.hypot(dx, dz) || 1;
  return [dx / len, 0, dz / len];
}

export function add(a: Vec3, b: Vec3, k = 1): Vec3 {
  return [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
}

export function distXZ(a: Vec3, b: Vec3): number {
  return Math.hypot(a[0] - b[0], a[2] - b[2]);
}
