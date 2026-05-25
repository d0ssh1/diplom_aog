# Phase 4: Интеграция в StepView3D и EditPlanPage

phase: 4
layer: pages/ + components/Wizard/
depends_on: phase-03
design: ../README.md

## Goal

Подключить MeshViewer с rooms/showRooms в обоих контекстах использования:
- `StepView3D` — wizard (step 5) и EditPlanPage (step 3)
- Кнопку «Кабинеты» разместить как overlay над Canvas в `StepView3D`

## Context

Phase 3 создала расширенный `MeshViewer` (props: rooms, showRooms) и расширила
`ViewerControls`. Однако `ViewerControls` нигде не используется в текущей кодовой базе
(компонент определён, но не импортируется ни одной страницей).

Поэтому кнопка «Кабинеты» добавляется НАПРЯМУЮ в `StepView3D` как overlay —
аналогично существующему `errorHud` (StepView3D.tsx:119-123).

`EditPlanPage` уже загружает комнаты через `/vectors` и хранит их в `currentRooms`
(EditPlanPage.tsx:65, 311). Она передаёт `rooms={currentRooms}` в `StepView3D`
(EditPlanPage.tsx:311) — значит интеграция уже частично готова.

## Files to Modify

### `frontend/src/components/Wizard/StepView3D.tsx`

**Lines affected:** 23-35 (интерфейс пропсов), 47-50 (деструктуризация), 93-139 (JSX)

**Что добавить:**

1. Импорт:
   ```typescript
   import { fromRoomAnnotation } from '../../types/roomDisplay';
   import type { RoomDisplay } from '../../types/roomDisplay';
   ```

2. Новый local state:
   ```typescript
   const [showRooms, setShowRooms] = useState(false);
   ```

3. Вычислить `roomsForDisplay` из пропса `rooms`:
   ```typescript
   const roomsForDisplay: RoomDisplay[] = useMemo(
     () => rooms.map(fromRoomAnnotation),
     [rooms],
   );
   ```
   `useMemo` чтобы не пересчитывать при каждом рендере.

4. Добавить кнопку-тоггл как overlay поверх Canvas (рядом с `errorHud`):
   ```tsx
   <div style={{ flex: 1, position: 'relative' }}>
     <MeshViewer
       url={meshUrl}
       format={format}
       rooms={roomsForDisplay}
       showRooms={showRooms}
     >
       {/* existing NavigationPath / MultifloorNavigationPath */}
     </MeshViewer>
     
     {/* Кнопка «Кабинеты» */}
     {roomsForDisplay.length > 0 && (
       <button
         type="button"
         onClick={() => setShowRooms((v) => !v)}
         style={{
           position: 'absolute',
           top: 12,
           right: 12,
           zIndex: 10,
           background: showRooms ? '#f5c542' : '#222',
           color: showRooms ? '#000' : '#fff',
           border: '1px solid #444',
           borderRadius: 4,
           padding: '6px 14px',
           fontSize: 13,
           cursor: 'pointer',
           fontFamily: 'system-ui, -apple-system, sans-serif',
         }}
       >
         Кабинеты
       </button>
     )}
     
     {/* existing errorHud */}
     {(routeResult?.status === 'no_path' || ...) && (
       <div className={styles.errorHud}>...</div>
     )}
   </div>
   ```

**Важно:** `rooms` уже является обязательным пропсом `StepView3D` —
интерфейс не меняется. Добавляется только логика `showRooms` внутри.

---

### `frontend/src/pages/EditPlanPage.tsx`

**Изменения:** НУЛЕВЫЕ — `EditPlanPage` уже:
- Загружает rooms через `/vectors` в `useEffect` (line 74)
- Хранит в `currentRooms: RoomAnnotation[]` (line 65)
- Передаёт `rooms={currentRooms}` в `StepView3D` (line 311)

`StepView3D` сам конвертирует через `fromRoomAnnotation`. Никаких изменений
в `EditPlanPage` не требуется.

---

### Кнопка в `ViewerControls` (опционально)

`ViewerControls.tsx` — компонент определён но нигде не используется.
Phase 3 уже добавляет в него props `showRooms`, `onToggleRooms`, `hasRooms`
(для совместимости на будущее). Это можно отложить — не влияет на AC.

## Verification

- [ ] `npx tsc --noEmit` — 0 ошибок
- [ ] Wizard шаг 5: нарисовать 3+ комнат → построить граф → построить 3D → видна кнопка «Кабинеты»
- [ ] Кнопка «Кабинеты» → появляются метки всех комнат в 3D сцене
- [ ] Повторно нажать → метки исчезают
- [ ] Вращение — метки следуют за 3D
- [ ] EditPlanPage → шаг 3 (3D просмотр) → кнопка «Кабинеты» отображается
- [ ] Если reconstruction без rooms → кнопка не отображается
- [ ] navigate('/admin') → нет ошибок в консоли (dispose работает)
- [ ] Все 7 AC из README.md выполнены
