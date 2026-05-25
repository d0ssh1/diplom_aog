# Phase 2: RoomOverlay компонент

phase: 2
layer: components/MeshViewer/
depends_on: phase-01
design: ../README.md

## Goal

Создать `RoomOverlay` — компонент R3F, который рендерит все комнаты как
полупрозрачные Box-элементы с Html-метками в 3D пространстве.
Монтируется внутри `GlbModel`/`ObjModel` рядом с `FloorPlane`.

## Context

Phase 1 создала:
- `RoomDisplay` interface (`frontend/src/types/roomDisplay.ts`)
- `normalizedToWorld(cx, cy, box, wallHeight)` utility

## Files to Create

### `frontend/src/components/MeshViewer/RoomOverlay.tsx`

**Purpose:** R3F компонент — Box + Html метка для каждой комнаты.

**Implementation details:**

```typescript
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { Box, Html } from '@react-three/drei';
import { RoomDisplay, normalizedToWorld } from '../../types/roomDisplay';

interface ComputedRoom {
  id: string;
  name: string;
  color: string;
  position: [number, number, number];
  size: [number, number, number];
}

interface RoomOverlayProps {
  modelRef: React.RefObject<THREE.Object3D>;
  rooms: RoomDisplay[];
  visible: boolean;
  wallHeight?: number;  // default 3.0
}

export const RoomOverlay: React.FC<RoomOverlayProps> = ({
  modelRef, rooms, visible, wallHeight = 3.0,
}) => { ... }
```

**Логика useEffect:**
- Зависимость: `[visible, rooms]` (modelRef — ref, не вызывает re-render)
- Guard: `if (!visible || !modelRef.current || rooms.length === 0) return`
- Вычислить `box = new THREE.Box3().setFromObject(modelRef.current)`
- Для каждой комнаты:
  - `position = normalizedToWorld(room.center_x, room.center_y, box, wallHeight)`
  - `size_x = room.width_norm * (box.max.x - box.min.x)`
  - `size_y = wallHeight * 0.8`
  - `size_z = room.height_norm * (box.max.z - box.min.z)`
  - Защита от нулевого размера: `Math.max(size_x, 0.1)` и `Math.max(size_z, 0.1)`
- Сохранить computed rooms в local state

**Cleanup (dispose геометрий):**
- Box из `@react-three/drei` сам создаёт и удаляет geometry — dispose не нужен явно
- Дополнительный ref для подстраховки:
  ```typescript
  const boxGeomRef = useRef<THREE.BufferGeometry | null>(null);
  useEffect(() => () => boxGeomRef.current?.dispose(), []);
  ```
  (паттерн из `FloorRouteView.tsx:144-145`)

**JSX:**
```tsx
if (!visible || computed.length === 0) return null;

return (
  <>
    {computed.map((r) => (
      <group key={r.id} position={r.position}>
        <Box args={r.size}>
          <meshStandardMaterial
            color={r.color}
            transparent
            opacity={0.15}
            depthWrite={false}
            side={THREE.DoubleSide}
          />
        </Box>
        <Html center position={[0, r.size[1] / 2 + 0.2, 0]}>
          {/* стиль как в FloorRouteView.tsx:70-84 */}
          <div style={...}>
            {r.name || r.room_type}
          </div>
        </Html>
      </group>
    ))}
  </>
);
```

**Html style** (из `FloorRouteView.tsx:70-84`, с меньшим font):
```typescript
{
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
}
```

### `frontend/src/components/MeshViewer/RoomOverlay.module.css`

Не обязателен — стиль inline (как в FloorRouteView.tsx). Создавать только если
нужны hover-эффекты (сейчас не нужны).

## Verification

- [ ] `npx tsc --noEmit` — 0 ошибок
- [ ] `RoomOverlay` монтируется без ошибок в R3F Canvas (smoke test в браузере)
- [ ] При `visible=false` → `return null`, компонент не рендерит ничего
- [ ] При `rooms=[]` → ничего не рендерится (нет DOM-элементов)
- [ ] При rotate камеры Html-метки следуют за 3D позицией
