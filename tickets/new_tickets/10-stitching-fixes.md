# Stitching — Тикеты на починку (v2)

> Все тикеты упорядочены по приоритету: сначала блокеры, потом функциональные баги, потом UI polish.
> **Ключевой файл, который ломает всё:** `useStitchingCanvas.ts`

---

## TICKET-01: PlanSelectionStep — убрать лишнюю обёртку (чёрная плашка + дублирующая навигация)

**Проблема:**
На скриншоте Step 1 видны два паразитных элемента:
1. **Чёрная горизонтальная плашка** с двумя серыми точками наверху — от родительского wizard-wrapper (рендерит step-dots)
2. **Нижняя панель "Назад" / "Дальше"** — тоже от wizard-обёртки. Но `PlanSelectionStep` уже имеет **свой** sticky `.bottomBar` с кнопкой "Сшить (N) →"

Итого на экране **два конкурирующих footer'а**.

**Что нужно сделать (Вариант А — рекомендуемый):**

Stitching — самостоятельный 2-шаговый flow, **не должен** жить внутри общего wizard.

1. Найти родительский компонент, оборачивающий `PlanSelectionStep` (вероятно `StitchingPage.tsx` или route-level wrapper)
2. Убрать из него:
   - Верхнюю чёрную плашку со step-dots
   - Нижнюю навигационную панель "Назад" / "Дальше"
3. `PlanSelectionStep` и `StitchingEditor` (Step 2) должны занимать весь экран и управлять навигацией самостоятельно

**Файлы:** Родительский компонент (найти по маршруту), `PlanSelectionStep.tsx`
**НЕ ТРОГАТЬ:** Внутреннюю логику PlanSelectionStep, стили карточек, бэкенд
**Готовность:** Нет чёрной плашки, нет дублирующего footer, переход на Step 2 работает

---

## TICKET-02: StitchingCanvas — планы не отображаются (БЛОКЕР)

**Проблема:** Холст полностью пустой. Слои видны в sidebar, но на canvas ничего нет.

**Найдено 5 багов в `useStitchingCanvas.ts`:**

---

### Баг 2.1: `fabric.Image.fromURL` молча падает — нет обработки ошибок

**Файл:** `useStitchingCanvas.ts`, строка ~60

`fabric.Image.fromURL` молча возвращает `null` если:
- `layer.imageUrl` — `undefined` или пустая строка
- URL не отвечает (404, CORS)
- Картинка не загрузилась

Сейчас единственная проверка — `if (!img) return;`, но при ошибке загрузки callback может вообще не вызваться, или `img` будет сломанный объект с нулевыми размерами.

**Исправление:**

```typescript
// БЫЛО:
const loadPlanToCanvas = useCallback((layer: LayerData) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    fabric.Image.fromURL(layer.imageUrl, (img) => {
      if (!img) return;

// СТАЛО:
const loadPlanToCanvas = useCallback((layer: LayerData) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Guard: проверяем URL перед загрузкой
    if (!layer.imageUrl) {
      console.error(`[StitchingCanvas] Layer ${layer.reconstructionId} has no imageUrl`);
      return;
    }

    // Guard: не загружать повторно
    if (layerObjectsRef.current.has(layer.reconstructionId)) {
      return;
    }

    fabric.Image.fromURL(
      layer.imageUrl,
      (img) => {
        if (!img || !img.width || !img.height) {
          console.error(`[StitchingCanvas] Failed to load image for layer ${layer.reconstructionId}`);
          return;
        }
```

---

### Баг 2.2: Нет дедупликации — планы могут добавляться повторно

**Файл:** `StitchingCanvas.tsx`, строки ~33-38

```typescript
useEffect(() => {
  if (layers.length > 0) {
    layers.forEach((layer) => {
      loadPlanToCanvas(layer);   // ← вызывается для ВСЕХ слоёв каждый раз
    });
  }
}, [layers.length]);
```

Если `layers.length` изменится (добавился третий слой), `loadPlanToCanvas` вызовется для **всех** слоёв заново, включая уже добавленные. Это создаст дубликаты на canvas.

**Исправление** (в двух файлах):

В `useStitchingCanvas.ts` (уже добавлено в 2.1):
```typescript
if (layerObjectsRef.current.has(layer.reconstructionId)) {
  return; // уже на canvas
}
```

В `StitchingCanvas.tsx` — зависимость useEffect:
```typescript
// БЫЛО:
}, [layers.length]);

// СТАЛО:
}, [layers.map(l => l.reconstructionId).join(',')]);
```

---

### Баг 2.3: `createMaskObjects` — координаты маски нормализованы [0,1], но используются как пиксели

**Файл:** `useStitchingCanvas.ts`, строки ~217-270

Это **корневая причина** того, что даже если изображение загрузится, маска будет невидимой.

Векторная модель хранит координаты в нормализованном виде `[0, 1]`. Например, стена может быть `{x: 0.15, y: 0.3}` → `{x: 0.82, y: 0.95}`. Но `createMaskObjects` передаёт эти значения напрямую в Fabric.js как пиксели:

```typescript
// Строка ~231 — стены
const line = new fabric.Line([p1.x, p1.y, p2.x, p2.y], { ... });
// При p1 = {x: 0.15, y: 0.3} это линия от (0.15px, 0.3px) — НЕВИДИМАЯ

// Строка ~247 — комнаты
const polygon = new fabric.Polygon(room.polygon, { ... });
// При polygon = [{x: 0.1, y: 0.2}, ...] — субпиксельный полигон
```

**Исправление:**

```typescript
// БЫЛО:
function createMaskObjects(
  vectorModel: LayerData['vectorModel'],
  color: string,
  opacity: number,
  showMask: boolean
): fabric.Object[] {

// СТАЛО:
function createMaskObjects(
  vectorModel: LayerData['vectorModel'],
  color: string,
  opacity: number,
  showMask: boolean,
  imageWidth: number,
  imageHeight: number,
): fabric.Object[] {
  if (!showMask || !vectorModel) return [];

  const objects: fabric.Object[] = [];

  // Стены
  vectorModel.walls.forEach((wall) => {
    if (wall.points.length < 2) return;

    for (let i = 0; i < wall.points.length - 1; i++) {
      const p1 = wall.points[i];
      const p2 = wall.points[i + 1];

      const line = new fabric.Line([
        p1.x * imageWidth,
        p1.y * imageHeight,
        p2.x * imageWidth,
        p2.y * imageHeight,
      ], {
        stroke: color,
        strokeWidth: Math.max(wall.thickness * imageWidth, 1),
        opacity,
        selectable: false,
        evented: false,
      });

      objects.push(line);
    }
  });

  // Комнаты
  vectorModel.rooms.forEach((room) => {
    if (room.polygon.length < 3) return;

    const denormPoints = room.polygon.map(p => ({
      x: p.x * imageWidth,
      y: p.y * imageHeight,
    }));

    const polygon = new fabric.Polygon(denormPoints, {
      fill: `${color}33`,
      stroke: color,
      strokeWidth: 1,
      opacity,
      selectable: false,
      evented: false,
    });

    objects.push(polygon);
  });

  // Двери
  vectorModel.doors.forEach((door) => {
    const circle = new fabric.Circle({
      left: door.position.x * imageWidth,
      top: door.position.y * imageHeight,
      radius: Math.max((door.width / 2) * imageWidth, 3),
      fill: color,
      opacity,
      originX: 'center',
      originY: 'center',
      selectable: false,
      evented: false,
    });

    objects.push(circle);
  });

  return objects;
}
```

И обновить вызов в `loadPlanToCanvas`:

```typescript
// БЫЛО:
const maskObjects = createMaskObjects(layer.vectorModel, layer.color, layer.maskOpacity, layer.showMask);

// СТАЛО:
const maskObjects = createMaskObjects(
  layer.vectorModel,
  layer.color,
  layer.maskOpacity,
  layer.showMask,
  img.width!,
  img.height!,
);
```

---

### Баг 2.4: `createMaskObjects` — crash при `vectorModel === undefined`

**Файл:** `useStitchingCanvas.ts`, строка ~213

Если у слоя нет `vectorModel` (например, план только загружен, но ещё не прошёл векторизацию), функция упадёт при обращении к `vectorModel.walls`:

```typescript
function createMaskObjects(vectorModel: LayerData['vectorModel'], ...) {
  // vectorModel может быть undefined/null
  vectorModel.walls.forEach(...); // ← TypeError: Cannot read property 'walls' of undefined
```

Fabric.js не покажет ошибку — callback `fromURL` просто прервётся, и ничего не отрендерится.

**Исправление:**
```typescript
// Добавить guard в начало функции (уже включено в исправление 2.3):
if (!showMask || !vectorModel) return [];
```

---

### Баг 2.5: Canvas не обновляет размеры при resize окна

**Файл:** `useStitchingCanvas.ts`, строки ~36-52

Canvas размеры устанавливаются один раз при init:
```typescript
canvas.setWidth(container.clientWidth);
canvas.setHeight(container.clientHeight);
```

Но нет `ResizeObserver`. Если пользователь ресайзит окно (или sidebar появляется/скрывается), canvas остаётся в старых размерах.

**Исправление:**
```typescript
// БЫЛО:
useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const canvas = new fabric.Canvas('stitching-canvas', {
      backgroundColor: '#2a2a2a',
      selection: false,
      preserveObjectStacking: true,
    });

    canvas.setWidth(container.clientWidth);
    canvas.setHeight(container.clientHeight);

    canvasRef.current = canvas;

    return () => {
      canvas.dispose();
      canvasRef.current = null;
    };
  }, [containerRef]);

// СТАЛО:
useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const canvasEl = container.querySelector('canvas');
    if (!canvasEl) return;

    const canvas = new fabric.Canvas(canvasEl, {
      backgroundColor: '#1A1A1A',
      selection: false,
      preserveObjectStacking: true,
    });

    const updateSize = () => {
      canvas.setWidth(container.clientWidth);
      canvas.setHeight(container.clientHeight);
      canvas.renderAll();
    };

    updateSize();
    canvasRef.current = canvas;

    const resizeObserver = new ResizeObserver(updateSize);
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      canvas.dispose();
      canvasRef.current = null;
    };
  }, [containerRef]);
```

> **Примечание:** `backgroundColor: '#2a2a2a'` не совпадает с CSS `.stitchingCanvasContainer { background: #1A1A1A }` — привести к `#1A1A1A`.

---

### Баг 2.6: Инициализация canvas по `id` — хрупкий паттерн

Canvas инициализируется через `new fabric.Canvas('stitching-canvas')` (строковый id). Если в DOM несколько canvas'ов с таким id или canvas ещё не смонтирован — Fabric.js молча создаст пустой объект.

**Исправлено в 2.5** — используем `container.querySelector('canvas')` вместо id.

---

**Сводка изменений для TICKET-02:**

| # | Файл | Что | Критичность |
|---|------|-----|-------------|
| 2.1 | `useStitchingCanvas.ts` | Guard на пустой `imageUrl` + дедуп + error logging | Блокер |
| 2.2 | `StitchingCanvas.tsx` | Зависимость useEffect на `reconstructionId` вместо `length` | Блокер |
| 2.3 | `useStitchingCanvas.ts` | Денормализация координат маски `[0,1] → px` | Блокер |
| 2.4 | `useStitchingCanvas.ts` | Guard на `vectorModel === undefined` | Блокер |
| 2.5 | `useStitchingCanvas.ts` | ResizeObserver + querySelector вместо id | Средний |
| 2.6 | `useStitchingCanvas.ts` | Убрать `backgroundColor: '#2a2a2a'` → `#1A1A1A` | Низкий |

**Файлы:**
- `frontend/src/hooks/useStitchingCanvas.ts`
- `frontend/src/components/stitching/StitchingCanvas.tsx`

**НЕ ТРОГАТЬ:**
- `StitchingSidebar` и дочерние панели
- Бэкенд `stitching_service.py`
- Типы в `stitching.ts` (если `imageUrl` и `vectorModel` там определены)

**Критерий готовности:**
- После перехода на Step 2 на холсте видны изображения планов
- Маска стен/комнат/дверей наложена поверх изображения в правильных координатах
- Повторный вызов `loadPlanToCanvas` для того же слоя не создаёт дубликат
- Console не содержит ошибок (кроме ожидаемых warnings)

---

## TICKET-03: activeTool не пробрасывается в canvas

**Проблема:**
`StitchingCanvas.tsx` принимает prop `activeTool`, но **не деструктурирует** его и **не передаёт** в `useStitchingCanvas`. Переключение инструментов в ToolPanel ни на что не влияет.

**Баг в `StitchingCanvas.tsx`:**
```tsx
export const StitchingCanvas: React.FC<StitchingCanvasProps> = ({
  layers,
  // activeTool ← НЕ деструктурирован!
  onLayerUpdate,
  onSnapshotPush,
  onUndo,
  onRedo,
}) => {
```

**Баг в `useStitchingCanvas.ts`:** хук вообще не принимает `activeTool` в своём interface.

**Исправление — Шаг 1: пробросить prop**

```typescript
// StitchingCanvas.tsx — деструктурировать activeTool
export const StitchingCanvas: React.FC<StitchingCanvasProps> = ({
  layers,
  activeTool,    // ← ДОБАВИТЬ
  onLayerUpdate,
  onSnapshotPush,
  onUndo,
  onRedo,
}) => {
  // ...
  const { loadPlanToCanvas } = useStitchingCanvas({
    containerRef,
    layers,
    activeTool,   // ← ДОБАВИТЬ
    onLayerUpdate,
    onSnapshotPush,
  });
```

**Исправление — Шаг 2: принять в хуке**

```typescript
// useStitchingCanvas.ts — расширить interface
interface UseStitchingCanvasProps {
  containerRef: React.RefObject<HTMLDivElement>;
  layers: LayerData[];
  activeTool: "move" | "rotate" | "rect_crop" | "polygon_clip";  // ← ДОБАВИТЬ
  onLayerUpdate: (layerId: string, updates: Partial<LayerData>) => void;
  onSnapshotPush: (snapshot: StitchingSnapshot) => void;
}
```

**Исправление — Шаг 3: реагировать на смену инструмента**

```typescript
// useStitchingCanvas.ts — новый useEffect
useEffect(() => {
  const canvas = canvasRef.current;
  if (!canvas) return;

  // Настройки для каждого инструмента
  const isMoveTool = activeTool === 'move';
  const isRotateTool = activeTool === 'rotate';

  canvas.forEachObject((obj) => {
    obj.set({
      selectable: isMoveTool || isRotateTool,
      evented: isMoveTool || isRotateTool,
      lockRotation: !isRotateTool,
      lockScalingX: true,       // масштаб только через PropertiesPanel
      lockScalingY: true,
      hasControls: isRotateTool, // показывать ручки только для rotate
    });
  });

  // Курсор
  if (activeTool === 'move') {
    canvas.defaultCursor = 'grab';
    canvas.hoverCursor = 'grab';
  } else if (activeTool === 'rotate') {
    canvas.defaultCursor = 'crosshair';
    canvas.hoverCursor = 'crosshair';
  } else if (activeTool === 'rect_crop' || activeTool === 'polygon_clip') {
    canvas.defaultCursor = 'crosshair';
    canvas.hoverCursor = 'crosshair';
    // TODO: включить режим рисования crop/clip
  }

  canvas.renderAll();
}, [activeTool]);
```

> **Примечание:** `rect_crop` и `polygon_clip` потребуют отдельных тикетов на полную реализацию (drawing mode с Fabric.js). Этот тикет обеспечивает: move работает, rotate работает, курсоры меняются.

**Файлы:**
- `frontend/src/components/stitching/StitchingCanvas.tsx`
- `frontend/src/hooks/useStitchingCanvas.ts`

**НЕ ТРОГАТЬ:** `ToolPanel.tsx`, `StitchingSidebar.tsx`, бэкенд

**Критерий готовности:**
- Переключение на "Перемещение" → объекты перетаскиваемые, cursor: grab
- Переключение на "Вращение" → объекты вращаемые, cursor: crosshair, видны ручки
- Переключение на "Кадрирование" / "Полигон. обрезка" → объекты не перетаскиваемые, cursor: crosshair

---

## TICKET-04: PropertiesPanel — сломанная вёрстка range-слайдеров

**Проблема:**
Слайдеры угла и масштаба рендерят `<span>` с текущим значением **без CSS-стилей**. CSS `.propertyRow` описывает только `label` и `input`, но для `<span>` стилей нет.

`input[type="range"]` рендерится в дефолтном браузерном виде — не соответствует дизайн-системе.

**Исправление в CSS:**

```css
/* PropertiesPanel.module.css — ДОБАВИТЬ: */

.propertyValue {
  width: 56px;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  font-family: 'Courier New', monospace;
  font-size: 12px;
  font-weight: 700;
  color: white;
  padding-right: 12px;
  flex-shrink: 0;
  border-left: 1px solid #27272a;
}

/* Кастомный range slider */
.propertyRow input[type="range"] {
  -webkit-appearance: none;
  appearance: none;
  flex: 1;
  height: 2px;
  background: #3f3f46;
  outline: none;
  margin: 0 16px;
  cursor: pointer;
}

.propertyRow input[type="range"]::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 12px;
  height: 16px;
  background: white;
  cursor: pointer;
}

.propertyRow input[type="range"]::-moz-range-thumb {
  width: 12px;
  height: 16px;
  background: white;
  border: none;
  cursor: pointer;
}

.propertyRow input[type="range"]::-webkit-slider-runnable-track {
  height: 2px;
}
```

**Исправление в TSX:**

```tsx
// БЫЛО:
<span>{Math.round(selectedLayer.transform.rotation_deg)}°</span>

// СТАЛО:
<span className={styles.propertyValue}>
  {Math.round(selectedLayer.transform.rotation_deg)}°
</span>
```

Аналогично для масштаба:
```tsx
<span className={styles.propertyValue}>
  {Math.round(selectedLayer.transform.scale_x * 100)}%
</span>
```

**Файлы:** `PropertiesPanel.tsx`, `PropertiesPanel.module.css`
**НЕ ТРОГАТЬ:** `onPropertyChange` логику, другие панели, бэкенд

---

## TICKET-05: LayerPanel — inline styles → CSS modules

**Проблема:**
`LayerPanel.tsx` содержит ~30 строк inline `style={{...}}`, при этом `LayerPanel.module.css` уже определяет классы (`.opacityLabel`, `.opacityValue`, `.sliderContainer`, `.sliderTrack`, `.sliderThumb`) — которые **не используются**.

**Исправление:**

Добавить два недостающих класса:
```css
/* LayerPanel.module.css — ДОБАВИТЬ: */
.layerCardHeader {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.layerCardLeft {
  display: flex;
  align-items: center;
}
```

Заменить inline styles в TSX:

```tsx
// БЫЛО (строка ~36):
<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
  <div style={{ display: 'flex', alignItems: 'center' }}>

// СТАЛО:
<div className={styles.layerCardHeader}>
  <div className={styles.layerCardLeft}>
```

```tsx
// БЫЛО (строка ~72):
<div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', fontFamily: 'Courier New, monospace', color: '#71717a', marginBottom: '8px' }}>
  <span>Непрозрачность</span>
  <span style={{ color: 'white' }}>{opacity}%</span>
</div>

// СТАЛО:
<div className={styles.opacityLabel}>
  <span>Непрозрачность</span>
  <span className={styles.opacityValue}>{opacity}%</span>
</div>
```

```tsx
// БЫЛО (строка ~78):
<div style={{ position: 'relative', height: '2px', background: '#3f3f46', cursor: 'pointer' }}>
  <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${opacity}%`, background: layer.color }} />
  ...
  <div style={{ position: 'absolute', left: `${opacity}%`, top: '50%', transform: 'translate(-50%, -50%)', width: '12px', height: '16px', background: 'white', pointerEvents: 'none' }} />

// СТАЛО:
<div className={styles.sliderContainer}>
  <div className={styles.sliderTrack} style={{ width: `${opacity}%`, background: layer.color }} />
  ...
  <div className={styles.sliderThumb} style={{ left: `${opacity}%` }} />
```

> Динамические значения (`width`, `left`, `background: layer.color`) остаются в `style` — это нормально, они зависят от данных. Статичные стили уходят в CSS.

**Файлы:** `LayerPanel.tsx`, `LayerPanel.module.css`
**Готовность:** Ноль чисто статических inline styles. Визуально идентичный рендер.

---

## TICKET-06: Undo/Redo кнопки — сломанная вёрстка

**Проблема:**
На скриншоте Step 2 в верхнем левом углу текст "Отменить" / "Повторить" наезжает друг на друга. Кнопки рендерятся в родительском компоненте, не в `StitchingCanvas`.

**Что нужно сделать:**

Найти кнопки в parent и стилизовать:

```css
.undoRedoBar {
  position: absolute;
  top: 16px;
  left: 16px;
  display: flex;
  gap: 4px;
  z-index: 10;
}

.undoRedoBtn {
  background: #0A0A0A;
  border: 1px solid #27272a;
  color: #71717a;
  padding: 8px 12px;
  font-family: 'Courier New', monospace;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  cursor: pointer;
  transition: all 0.2s;
}

.undoRedoBtn:hover:not(:disabled) {
  color: white;
  border-color: #FF4500;
}

.undoRedoBtn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}
```

**Файлы:** Родительский компонент Step 2
**Готовность:** Кнопки визуально чистые, не наезжают, стиль соответствует дизайн-системе

---

## TICKET-07: Pan (перемещение холста) — Пробел + мышь не реализован

**Проблема:**
Хинт на холсте говорит "Пробел + мышь = перемещение холста", но в `useStitchingCanvas.ts` **нет реализации panning**. Fabric.js не поддерживает это из коробки.

**Что нужно сделать:**

Добавить в `useStitchingCanvas.ts`:

```typescript
// Pan logic
useEffect(() => {
  const canvas = canvasRef.current;
  if (!canvas) return;

  let isPanning = false;
  let lastPosX = 0;
  let lastPosY = 0;
  let spacePressed = false;

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.code === 'Space' && !spacePressed) {
      spacePressed = true;
      canvas.defaultCursor = 'grab';
      canvas.forEachObject(obj => obj.set({ evented: false }));
      canvas.renderAll();
    }
  };

  const handleKeyUp = (e: KeyboardEvent) => {
    if (e.code === 'Space') {
      spacePressed = false;
      isPanning = false;
      canvas.defaultCursor = 'default';
      canvas.forEachObject(obj => obj.set({ evented: true }));
      canvas.renderAll();
    }
  };

  const handleMouseDown = (opt: fabric.IEvent) => {
    if (spacePressed && opt.e) {
      isPanning = true;
      lastPosX = opt.e.clientX;
      lastPosY = opt.e.clientY;
      canvas.defaultCursor = 'grabbing';
    }
  };

  const handleMouseMove = (opt: fabric.IEvent) => {
    if (isPanning && opt.e) {
      const vpt = canvas.viewportTransform!;
      vpt[4] += opt.e.clientX - lastPosX;
      vpt[5] += opt.e.clientY - lastPosY;
      lastPosX = opt.e.clientX;
      lastPosY = opt.e.clientY;
      canvas.requestRenderAll();
    }
  };

  const handleMouseUp = () => {
    isPanning = false;
    if (spacePressed) {
      canvas.defaultCursor = 'grab';
    }
  };

  // Zoom с колесом мыши
  const handleWheel = (opt: fabric.IEvent) => {
    const e = opt.e as WheelEvent;
    const delta = e.deltaY;
    let zoom = canvas.getZoom();
    zoom *= 0.999 ** delta;
    zoom = Math.min(Math.max(zoom, 0.1), 5);
    canvas.zoomToPoint({ x: e.offsetX, y: e.offsetY } as fabric.Point, zoom);
    e.preventDefault();
    e.stopPropagation();
  };

  window.addEventListener('keydown', handleKeyDown);
  window.addEventListener('keyup', handleKeyUp);
  canvas.on('mouse:down', handleMouseDown);
  canvas.on('mouse:move', handleMouseMove);
  canvas.on('mouse:up', handleMouseUp);
  canvas.on('mouse:wheel', handleWheel);

  return () => {
    window.removeEventListener('keydown', handleKeyDown);
    window.removeEventListener('keyup', handleKeyUp);
    canvas.off('mouse:down', handleMouseDown);
    canvas.off('mouse:move', handleMouseMove);
    canvas.off('mouse:up', handleMouseUp);
    canvas.off('mouse:wheel', handleWheel);
  };
}, []);
```

**Файлы:** `useStitchingCanvas.ts`
**НЕ ТРОГАТЬ:** Tool switching logic (TICKET-03), canvas init (TICKET-02)
**Готовность:** Пробел + мышь = pan. Колесо мыши = zoom.

---

## Дизайн-система (справочник)

| Параметр | Значение |
|----------|---------|
| border-radius | `0` везде |
| Фон sidebar | `#0A0A0A` |
| Фон карточек (тёмная тема) | `#1e1e1e` |
| Фон холста | `#1A1A1A` |
| Фон Step 1 (светлая тема) | `var(--color-grey-bg)` / `#e5e5e5` |
| Акцент | `#FF4500` |
| Текст muted | `#71717a` |
| Borders (тёмная тема) | `1px solid #27272a` |
| Borders (светлая тема) | `2px solid var(--color-black)` |
| Mono font | `'Courier New', monospace` |
| Hard shadow | `4px 4px 0px 0px rgba(0,0,0,1)` |

---

## Порядок выполнения

```
TICKET-01  → Quick fix: убрать паразитную обёртку
TICKET-02  → БЛОКЕР: починить canvas (5 багов)
TICKET-03  → Функционал: пробросить activeTool
TICKET-07  → Функционал: pan + zoom
TICKET-04  → Вёрстка: PropertiesPanel слайдеры
TICKET-05  → Рефакторинг: LayerPanel inline styles
TICKET-06  → UI polish: undo/redo кнопки
```

TICKET-02 — без него stitching не работает вообще.
TICKET-03 + TICKET-07 — без них редактор бесполезен (нет инструментов и навигации).