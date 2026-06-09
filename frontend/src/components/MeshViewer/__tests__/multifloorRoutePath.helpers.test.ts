import { describe, it, expect } from 'vitest';
import {
  buildMultifloorPolyline,
  liftPoint,
} from '../multifloorRoutePath.helpers';
import type { FloorPathSegment3D } from '../../../types/buildingNav';

describe('buildMultifloorPolyline', () => {
  it('test_polyline_joins_segments: concatenates per-floor 3D segments', () => {
    const segments: FloorPathSegment3D[] = [
      { floor_id: 10, floor_number: 1, coordinates_3d: [[0, 0, 0], [1, 0, 0]] },
      { floor_id: 20, floor_number: 2, coordinates_3d: [[1, 3, 0], [2, 3, 0], [3, 3, 0]] },
    ];
    const poly = buildMultifloorPolyline(segments);
    expect(poly).toHaveLength(5);
    expect(poly[0]).toEqual([0, 0, 0]);
    expect(poly[4]).toEqual([3, 3, 0]);
  });

  it('returns an empty list for no segments', () => {
    expect(buildMultifloorPolyline([])).toEqual([]);
  });
});

describe('liftPoint', () => {
  it('raises only the Y component by the lift amount', () => {
    expect(liftPoint([1, 2, 3], 0.15)).toEqual([1, 2.15, 3]);
  });
});
