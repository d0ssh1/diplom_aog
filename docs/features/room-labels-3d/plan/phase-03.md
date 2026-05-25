# Phase 3: Расширение MeshViewer + ViewerControls

phase: 3
layer: components/MeshViewer/
depends_on: phase-02
design: ../README.md

## Goal

Расширить `MeshViewer.tsx` новыми props `rooms` и `showRooms`, пробросить их
до `GlbModel`/`ObjModel`, подключить `RoomOverlay`.
Добавить кнопку-тоггл «Кабинеты» в `ViewerControls.tsx`.

## Context

Phase 2 создала `RoomOverlay` component.
Phase 1 создала `RoomDisplay` type.

## Files to Modify

### `frontend/src/components/MeshViewer.tsx`

**Lines affected:** 108-123 (`ObjModel`), 151-189 (`GlbModel`), 237-250 (`MeshViewerProps`)

**Что добавить:**

1. Импорт:
   ```typescript
   import { RoomOverlay } from './MeshViewer/RoomOverlay';
   import type { RoomDisplay } from '../types/roomDisplay';
   ```

2. Новые локальные интерфейсы (рядом с определениями компонентов):
   ```typescript
   interface GlbModelProps {
     url: string;
     rooms: RoomDisplay[];
     showRooms: boolean;
   }
   
   interface ObjModelProps {
     url: string;
     rooms: RoomDisplay[];
     showRooms: boolean;
   }
   ```

3. Расширить `GlbModel` и `ObjModel`: добавить `rooms, showRooms` в деструктурирование
   и добавить внутри JSX return рядом с `<FloorPlane>`:
   ```tsx
   <RoomOverlay modelRef={ref} rooms={rooms} visible={showRooms} />
   ```

4. Расширить `MeshViewerProps` (line ~237):
   ```typescript
   interface MeshViewerProps {
     url: string;
     format?: 'obj' | 'glb';
     children?: React.ReactNode;
     rooms?: RoomDisplay[];     // default []
     showRooms?: boolean;       // default false
   }
   ```

5. Пробросить в рендере (line ~282):
   ```tsx
   {modelFormat === 'glb'
     ? <GlbModel url={url} rooms={rooms ?? []} showRooms={showRooms ?? false} />
     : <ObjModel url={url} rooms={rooms ?? []} showRooms={showRooms ?? false} />
   }
   ```

**Важно:** не нарушать существующий children API — он остаётся без изменений.

---

### `frontend/src/components/MeshViewer/ViewerControls.tsx`

**Lines affected:** 3-8 (`ViewerControlsProps`), 20-48 (JSX)

**Что добавить:**

1. Расширить `ViewerControlsProps`:
   ```typescript
   interface ViewerControlsProps {
     glbUrl: string | null;
     viewMode: 'top' | '3d';
     onViewModeChange: (mode: 'top' | '3d') => void;
     showRooms: boolean;         // НОВОЕ
     onToggleRooms: () => void;  // НОВОЕ
     hasRooms: boolean;          // НОВОЕ: скрыть кнопку если нет данных
   }
   ```

2. Добавить кнопку в JSX (рядом с downloadBtn):
   ```tsx
   {hasRooms && (
     <button
       className={`${styles.toggleBtn} ${showRooms ? styles.active : ''}`}
       onClick={onToggleRooms}
       type="button"
     >
       Кабинеты
     </button>
   )}
   ```
   Использует существующий CSS-класс `styles.toggleBtn` + `styles.active` —
   они уже есть в `ViewerControls.module.css` для view toggle.

## Verification

- [ ] `npx tsc --noEmit` — 0 ошибок
- [ ] `MeshViewer` получает `rooms=[]` → RoomOverlay ничего не рендерит
- [ ] `MeshViewer` без `rooms` prop (undefined) → не падает (default=[])
- [ ] `ViewerControls` с `hasRooms=false` → кнопка не отображается
- [ ] `ViewerControls` с `hasRooms=true, showRooms=false` → кнопка есть, inactive
- [ ] `ViewerControls` с `hasRooms=true, showRooms=true` → кнопка active
