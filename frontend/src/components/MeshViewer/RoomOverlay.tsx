import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { Box, Html } from '@react-three/drei';
import type { RoomDisplay } from '../../types/roomDisplay';
import { normalizedToWorld } from '../../types/roomDisplay';

interface ComputedRoom {
  id: string;
  name: string;
  room_type: string;
  color: string;
  position: [number, number, number];
  size: [number, number, number];
}

interface RoomOverlayProps {
  modelRef: React.RefObject<THREE.Object3D | null>;
  rooms: RoomDisplay[];
  visible: boolean;
  wallHeight?: number;
}

export const RoomOverlay: React.FC<RoomOverlayProps> = ({
  modelRef,
  rooms,
  visible,
  wallHeight = 3.0,
}) => {
  const [computed, setComputed] = useState<ComputedRoom[]>([]);
  const boxGeomRef = useRef<THREE.BufferGeometry | null>(null);

  useEffect(() => () => { boxGeomRef.current?.dispose(); }, []);

  useEffect(() => {
    if (!visible || !modelRef.current || rooms.length === 0) {
      setComputed([]);
      return;
    }
    const box = new THREE.Box3().setFromObject(modelRef.current);
    const rangeX = box.max.x - box.min.x;
    const rangeZ = box.max.z - box.min.z;

    setComputed(
      rooms.map((room) => ({
        id: room.id,
        name: room.name,
        room_type: room.room_type,
        color: room.color,
        position: normalizedToWorld(room.center_x, room.center_y, box, wallHeight),
        size: [
          Math.max(room.width_norm * rangeX, 0.1),
          wallHeight * 0.8,
          Math.max(room.height_norm * rangeZ, 0.1),
        ],
      })),
    );
  }, [visible, rooms, modelRef, wallHeight]);

  if (!visible || computed.length === 0) return null;

  return (
    <>
      {computed.map((r) => (
        <group key={r.id} position={r.position}>
          <Box args={r.size as [number, number, number]}>
            <meshStandardMaterial
              color={r.color}
              transparent
              opacity={0.15}
              depthWrite={false}
              side={THREE.DoubleSide}
            />
          </Box>
          <Html center position={[0, r.size[1] / 2 + 0.2, 0]}>
            <div
              style={{
                color: 'white',
                fontWeight: 500,
                fontSize: '13px',
                fontFamily: 'system-ui, -apple-system, sans-serif',
                textShadow: '0px 1px 3px rgba(0,0,0,0.8)',
                pointerEvents: 'none',
                whiteSpace: 'nowrap',
                background: 'rgba(0,0,0,0.35)',
                padding: '2px 6px',
                borderRadius: '4px',
              }}
            >
              {r.name || r.room_type}
            </div>
          </Html>
        </group>
      ))}
    </>
  );
};
