// Floor-keyed cross-floor route polyline (subfeature D). A standalone R3F scene
// object: it renders each floor segment + each stair/elevator riser as a drei
// <Line> in the SHARED building-frame world (same frame as B's stacked floor
// GLBs), so the route stays correct no matter which floor meshes are hidden.
//
// Coordinates come straight from the backend (06-pipeline-spec §5) — no client
// transform. drei's <Line> owns + disposes its geometry/material on unmount
// (threejs cleanup rule), so this component holds no manual THREE resources.

import React, { useMemo } from 'react';
import * as THREE from 'three';
import { Line } from '@react-three/drei';
import type { FloorPathSegment3D, TransitionUsed3D } from '../../types/buildingNav';
import { liftPoint } from './multifloorRoutePath.helpers';

const ROUTE_COLOR = '#FF4500';
const ROUTE_LIFT = 0.15; // metres above the floor, matching NavigationPath

export interface MultifloorRoutePathProps {
  segments: FloorPathSegment3D[];
  transitions: TransitionUsed3D[];
}

export const MultifloorRoutePath: React.FC<MultifloorRoutePathProps> = ({
  segments,
  transitions,
}) => {
  const segmentLines = useMemo(
    () =>
      segments
        .map((seg) =>
          seg.coordinates_3d.map((pt) => new THREE.Vector3(...liftPoint(pt, ROUTE_LIFT))),
        )
        .filter((pts) => pts.length >= 2),
    [segments],
  );

  const risers = useMemo(
    () =>
      transitions.map((tr) => [
        new THREE.Vector3(...liftPoint(tr.from_3d, ROUTE_LIFT)),
        new THREE.Vector3(...liftPoint(tr.to_3d, ROUTE_LIFT)),
      ]),
    [transitions],
  );

  return (
    <>
      {segmentLines.map((pts, i) => (
        <Line
          key={`seg-${i}`}
          points={pts}
          color={ROUTE_COLOR}
          lineWidth={4}
          renderOrder={2}
          depthTest={false}
        />
      ))}
      {risers.map((pts, i) => (
        <Line
          key={`riser-${i}`}
          points={pts}
          color={ROUTE_COLOR}
          lineWidth={4}
          renderOrder={2}
          depthTest={false}
        />
      ))}
    </>
  );
};

export default MultifloorRoutePath;
