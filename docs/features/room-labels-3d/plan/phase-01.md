# Phase 1: Типы и конвертеры

phase: 1
layer: types
depends_on: none
design: ../README.md

## Goal

Создать унифицированный тип `RoomDisplay` и функции конвертации из двух источников
(`RoomAnnotation` из wizard и `VectorRoom` из API), а также утилиту
`normalizedToWorld` для перевода нормализованных координат в мировые Three.js.

## Files to Create

### `frontend/src/types/roomDisplay.ts`

**Purpose:** Унифицированный тип + конвертеры + цветовая карта.

**Implementation details:**

- Экспортировать `RoomDisplay` interface:
  ```typescript
  export interface RoomDisplay {
    id: string;
    name: string;
    room_type: string;
    center_x: number;   // [0, 1]
    center_y: number;   // [0, 1]
    width_norm: number; // [0, 1]
    height_norm: number;// [0, 1]
    color: string;      // hex
  }
  ```

- Экспортировать `ROOM_COLORS`:
  ```typescript
  export const ROOM_COLORS: Record<string, string> = {
    classroom: '#f5c542',
    corridor:  '#4287f5',
    staircase: '#f54242',
    elevator:  '#a742f5',
    toilet:    '#42f5c8',
    other:     '#c8c8c8',
    room:      '#c8c8c8',
  };
  ```

- `fromRoomAnnotation(r: RoomAnnotation): RoomDisplay` — импортировать
  `RoomAnnotation` из `'../types/wizard'`:
  - `center_x`: если `r.center?.x != null` → `r.center.x`, иначе `r.x + r.width / 2`
  - `center_y`: если `r.center?.y != null` → `r.center.y`, иначе `r.y + r.height / 2`
  - `width_norm = r.width`
  - `height_norm = r.height`
  - `color = ROOM_COLORS[r.room_type] ?? ROOM_COLORS.other`

- `fromVectorRoom(r: VectorRoomApi): RoomDisplay` — принимает тип:
  ```typescript
  interface VectorRoomApi {
    id: string;
    name: string;
    room_type: string;
    center: { x: number; y: number };
    polygon: Array<{ x: number; y: number }>;
    area_normalized: number;
  }
  ```
  Этот inline-тип описывает форму ответа от `/vectors` endpoint
  (не импортировать из backend — типы дублируются намеренно для изоляции слоёв).
  - `center_x = r.center.x`, `center_y = r.center.y`
  - `width_norm`: если `r.polygon.length > 0` → `max(p.x) - min(p.x)`, иначе `0`
  - `height_norm`: если `r.polygon.length > 0` → `max(p.y) - min(p.y)`, иначе `0`
  - `color = ROOM_COLORS[r.room_type] ?? ROOM_COLORS.other`

- `normalizedToWorld(cx, cy, box, wallHeight)`:
  ```typescript
  import * as THREE from 'three';

  export function normalizedToWorld(
    cx: number,
    cy: number,
    box: THREE.Box3,
    wallHeight: number,
  ): [number, number, number] {
    return [
      box.min.x + cx * (box.max.x - box.min.x),
      box.min.y + wallHeight * 0.5,
      box.min.z + cy * (box.max.z - box.min.z),
    ];
  }
  ```

### `frontend/src/__tests__/roomDisplay.test.ts`

**Tests from 04-testing.md:**
- `test_fromRoomAnnotation_prefers_explicit_center`
- `test_fromRoomAnnotation_computes_center_from_bbox`
- `test_fromRoomAnnotation_assigns_color_by_room_type` (elevator → #a742f5)
- `test_fromRoomAnnotation_unknown_type_fallback_color`
- `test_fromVectorRoom_copies_center`
- `test_fromVectorRoom_computes_width_from_polygon`
- `test_fromVectorRoom_empty_polygon_returns_zero_size`
- `test_normalizedToWorld_x_lerp`
- `test_normalizedToWorld_z_lerp`
- `test_normalizedToWorld_y_mid_height`

Для `normalizedToWorld` создавать `THREE.Box3` через `new THREE.Box3(min, max)`.

## Verification

- [ ] `npx tsc --noEmit` в `frontend/` — 0 ошибок
- [ ] `npm test -- roomDisplay` — 10 тестов зелёных
- [ ] `fromRoomAnnotation` и `fromVectorRoom` импортируются без циклических зависимостей
