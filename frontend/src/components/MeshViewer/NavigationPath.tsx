import React, { useMemo } from 'react';
import * as THREE from 'three';
import { Line } from '@react-three/drei';

interface NavigationPathProps {
  coordinates: number[][] | null;
}

export const NavigationPath: React.FC<NavigationPathProps> = ({ coordinates }) => {
  const curvePoints = useMemo(() => {
    if (!coordinates || coordinates.length < 2) return null;

    const vectors = coordinates.map(([x, y, z]) => new THREE.Vector3(x, y, z));
    const curve = new THREE.CatmullRomCurve3(vectors, false, 'centripetal', 0.1);
    return curve.getPoints(Math.max(50, coordinates.length * 5));
  }, [coordinates]);

  if (!curvePoints) return null;

  return (
    <Line
      points={curvePoints}
      color="#00ffcc"
      lineWidth={4}
      depthTest={false}
    />
  );
};
