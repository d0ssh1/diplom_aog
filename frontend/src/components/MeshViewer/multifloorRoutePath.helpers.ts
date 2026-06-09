import type { FloorPathSegment3D } from '../../types/buildingNav';

/**
 * Concatenate the per-floor 3D segments into one continuous list of points
 * (building-frame world coords, already metric). Used for a single-line render
 * + as the tested core of MultifloorRoutePath. Pure — no THREE, no side effects.
 */
export function buildMultifloorPolyline(
  segments: FloorPathSegment3D[],
): number[][] {
  const out: number[][] = [];
  for (const seg of segments) {
    for (const pt of seg.coordinates_3d) {
      out.push(pt);
    }
  }
  return out;
}

/** Lift a point's Y so the route floats just above the floor mesh. */
export function liftPoint(pt: number[], lift: number): [number, number, number] {
  return [pt[0] ?? 0, (pt[1] ?? 0) + lift, pt[2] ?? 0];
}
