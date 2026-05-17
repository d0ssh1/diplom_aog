# Phase 5: Frontend — RouteInputs + ZoomControls

phase: 5
layer: components/FloorViewer + MeshViewer
depends_on: phase-04
design: ../07-ui-spec.md

## Goal

Вынести блок «Начальная/Конечная точка + swap-кнопка + Построить маршрут» в новый компонент `RouteInputs`. Сделать `ZoomControls` (`+`/`−`) с реальным управлением камерой через `OrbitControls` из `MeshViewer`. Это требует экспонирования камеры/controls наружу.

## Context

Сейчас route-блок и zoom-кнопки разбросаны inline по `FloorViewerPage.tsx`. Спека требует swap-кнопку ⇄ (ADR-7) и программное управление зумом (ADR-8) — этого в текущем коде нет. См. [07-ui-spec.md §3.2, §3.5](../07-ui-spec.md).

## Files to Create

### `frontend/src/components/FloorViewer/RouteInputs.tsx`

**Props:**
```ts
interface RouteInputsProps {
  start: string;
  end: string;
  onStartChange: (v: string) => void;
  onEndChange: (v: string) => void;
  onSwap: () => void;
  onSubmit: () => void;
  disabled?: boolean;
  error?: string | null;
}
```

**Структура (см. §3.2 спеки):**

```tsx
<div className={styles.root}>
  <div className={styles.row}>
    <div className={styles.inputs}>
      <input
        className={styles.input}
        placeholder="Начальная точка"
        value={start}
        onChange={(e) => onStartChange(e.target.value)}
      />
      <input
        className={styles.input}
        placeholder="Конечная точка"
        value={end}
        onChange={(e) => onEndChange(e.target.value)}
      />
    </div>
    <button
      type="button"
      className={styles.swap}
      onClick={onSwap}
      aria-label="Поменять начало и конец местами"
    >⇄</button>
  </div>
  <button
    type="button"
    className={styles.submit}
    onClick={onSubmit}
    disabled={disabled || !start || !end}
  >Построить маршрут</button>
  {error && <div className={styles.error}>{error}</div>}
</div>
```

Никакой бизнес-логики — только UI и проброс callbacks.

### `frontend/src/components/FloorViewer/RouteInputs.module.css`

По спеке §3.2: радиусы 0, чёрная swap-кнопка 36×78 (или 36×36 центрированная), оранжевая submit 40px высота, error inline красный 12px.

### `frontend/src/components/FloorViewer/ZoomControls.tsx`

**Props:**
```ts
interface ZoomControlsProps {
  onZoomIn: () => void;
  onZoomOut: () => void;
}
```

**Структура:** два `<button>` с символами `+` / `−`, классы из §3.5.

### `frontend/src/components/FloorViewer/ZoomControls.module.css`

Position: absolute, right:16, top:50%/translateY(-50%), flex-column, gap:4, кнопки 40×40 чёрные sharp, shadow.

## Files to Modify

### `frontend/src/components/MeshViewer/MeshViewer.tsx`

**Задача:** дать снаружи возможность дёрнуть `OrbitControls.dollyIn(1.15)` / `.dollyOut(1.15)`.

**Подход:**

1. Создать новый файл `frontend/src/components/MeshViewer/meshViewerControls.ts` (или экспортировать тип из MeshViewer):
   ```ts
   export interface MeshViewerHandle {
     zoomIn: () => void;
     zoomOut: () => void;
   }
   ```
2. Обернуть `MeshViewer` в `forwardRef<MeshViewerHandle, MeshViewerProps>`.
3. Внутри `<Canvas>` создать дочерний компонент `<ControlsBridge ref={...} />`, который через `useThree()` получает `controls` (или `camera`) и через `useImperativeHandle` пробрасывает `zoomIn/zoomOut` на корневой ref.
4. `zoomIn` = `controls.dollyIn(1.15); controls.update();`, `zoomOut` = `controls.dollyOut(1.15); controls.update();`. Если `dollyIn` приватный в текущем три.js — используем `camera.position.multiplyScalar(0.87)` относительно target + `controls.update()`.

**Важно:** не сломать существующих потребителей `<MeshViewer />` (`RouteTestPage`, `ViewMeshPage`). Они продолжают работать без `ref`.

### `frontend/src/pages/FloorViewerPage.tsx`

**Что меняем:**

1. Удалить inline-разметку route-блока — заменить на `<RouteInputs ... />` с пропсами из `useFloorViewer` (start/end state, planRoute callback, routeError).
2. Сейчас `start`/`end` — локальный state в странице (или в хуке). Если в странице — оставляем; если в хуке — пробрасываем через возвращаемое значение. Без рефакторинга хука: проще оставить локально и добавить `swap` коллбэк прямо в странице (`() => { const tmp = start; setStart(end); setEnd(tmp); }`).
3. Удалить inline zoom-кнопки (или старую `.zoomControls` разметку) — заменить на `<ZoomControls onZoomIn={...} onZoomOut={...} />`.
4. Создать `const meshRef = useRef<MeshViewerHandle>(null);` и передать `ref={meshRef}` в `<MeshViewer />`. `onZoomIn={() => meshRef.current?.zoomIn()}`, аналогично out.
5. Удалить `.zoomControls`/`.zoomBtn` классы из CSS (моки фазы 3) — они теперь в `ZoomControls.module.css`.

## Verification

- [ ] `/viewer`: блок маршрута выглядит по спеке — два инпута, чёрный квадрат ⇄ справа, оранжевая кнопка снизу
- [ ] Клик ⇄ меняет содержимое полей местами
- [ ] Клик «Построить маршрут» с пустыми полями — кнопка disabled
- [ ] Клик «+» / «−» в viewport — камера приближается / отдаляется (визуально работает)
- [ ] Колесо мыши по-прежнему зумит (OrbitControls не сломан)
- [ ] Drag-rotate работает
- [ ] `tsc --noEmit` clean
- [ ] Регресс: `/admin/route-test`, `/viewer-mesh` (или как называется ViewMesh) — MeshViewer работает без ref, без ошибок
