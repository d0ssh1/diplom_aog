# Тикет: UI исправления — визуал + баги ластика

## Скриншоты-референсы

Все в `docs/design/fixes/`:
- `upload-current.png` — загрузка текущая
- `upload-target.png` — загрузка новый дизайн
- `upload-file-current.png` — после загрузки файла текущий
- `upload-file-target.png` — после загрузки Gemini карточка
- `upload-metadata-target.png` — метаданные Gemini стиль
- `panel-current.png` — панель ползунков текущая
- `panel-target.png` — панель ползунков целевая

---

## Fix 1: Автоповорот превью на шаге 1

**Файл:** `StepUpload.tsx` или `FileCard.tsx`

Если загруженное изображение вертикальное (naturalHeight > naturalWidth),
показывать превью повёрнутым на 90° через offscreen canvas (как на шаге 2).

---

## Fix 2: Иконки сместились вправо в панели инструментов

**Файл:** `ToolPanelV2.tsx` / `ToolPanelV2.module.css`

Иконка должна быть СЛЕВА, текст справа. Проверить что в `.toolButton`:
```css
display: flex;
align-items: center;
gap: 12px;
/* НЕ должно быть justify-content: center или margin-left: auto на иконке */
```

---

## Fix 3: Перегруппировать правую панель на шаге 3

**Файл:** `StepWallEditor.tsx`

Текущий порядок секций:
```
// РЕДАКТОР СТЕН → Нарисовать стену, Стереть
// РАЗМЕТКА → Кабинет, Лестница, Лифт, Коридор, Дверь
// ПАРАМЕТРЫ → Толщина линии, Чувствительность, Контраст
// НАЛОЖЕНИЕ → Toggle, Прозрачность
```

Новый порядок:
```
// РЕДАКТОР СТЕН
  Нарисовать стену
    Толщина линии [слайдер] 6 px    ← СРАЗУ ПОД кнопкой "Нарисовать стену"
  Стереть
    (подрежимы ластика — см. Fix 7)

// РАЗМЕТКА
  Кабинет, Лестница, Лифт, Коридор, Дверь

// ПАРАМЕТРЫ МАСКИ                   ← переименовать из "ПАРАМЕТРЫ"
  Чувствительность [слайдер] 15
  Контраст [слайдер] 10

// НАЛОЖЕНИЕ
  Показать оригинал [toggle]
  Прозрачность [слайдер] 40%
```

Слайдер "Толщина линии" привязан к инструменту "Нарисовать стену",
а "Чувствительность" и "Контраст" — параметры маски (отдельная секция).

---

## Fix 4: Дизайн toggle "Показать оригинал"

**Файл:** `StepWallEditor.tsx` / CSS

Убрать галочку ✓ внутри. Просто залитый квадрат:
- Включено: оранжевый залитый квадрат (#FF5722)
- Выключено: пустой квадрат с серой рамкой

```css
.squareToggle {
  width: 22px;
  height: 22px;
  background: transparent;
  border: 2px solid #555;
  border-radius: 2px;
  cursor: pointer;
}
.squareToggleActive {
  background: #FF5722;
  border-color: #FF5722;
}
```

Убрать SVG/иконку внутри toggle. Никакой галочки.

---

## Fix 5: Дизайн ползунков

**Файл:** CSS (общий для всех слайдеров на шаге 3)

Track тёмный, thumb светло-серый прямоугольный:
```css
input[type="range"] {
  -webkit-appearance: none;
  width: 100%;
  height: 3px;
  background: #333;
  border-radius: 2px;
  outline: none;
}
input[type="range"]::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 12px;
  height: 16px;
  background: #aaa;
  border-radius: 2px;
  cursor: pointer;
}
input[type="range"]::-moz-range-thumb {
  width: 12px;
  height: 16px;
  background: #aaa;
  border-radius: 2px;
  border: none;
  cursor: pointer;
}
input[type="range"]::-moz-range-track {
  height: 3px;
  background: #333;
  border-radius: 2px;
}
```

БЕЗ оранжевой заливки слева от thumb. Все ползунки одинаковые.
Значения справа — серый цвет (#999), НЕ оранжевый.

---

## Fix 6: Фон панели — более тёмный

**Файл:** `ToolPanelV2.module.css` или `StepWallEditor.module.css`

Фон правой панели: `#111111` (сейчас слишком серый).
Фон кнопок инструментов: `#1a1a1a`.

---

## Fix 7: Подрежимы ластика — позиция и функционал

### 7a: Позиция — подрежимы должны быть ПОД кнопкой "Стереть"

**Файл:** `StepWallEditor.tsx` (или где рендерятся подрежимы)

Сейчас кнопки "Кисть" и "Выделить область" рендерятся внизу панели.
Они должны появляться СРАЗУ ПОД кнопкой "Стереть", перед секцией "// РАЗМЕТКА".

Структура рендера:
```tsx
{/* Секция РЕДАКТОР СТЕН */}
<button onClick={() => onToolChange('wall')}>Нарисовать стену</button>
{activeTool === 'wall' && (
  <div className={styles.subSection}>
    {/* слайдер толщины линии */}
  </div>
)}

<button onClick={() => onToolChange('eraser')}>Стереть</button>
{activeTool === 'eraser' && (
  <div className={styles.subTools}>
    <button 
      className={eraserMode === 'brush' ? styles.subToolActive : styles.subTool}
      onClick={() => setEraserMode('brush')}
    >
      ○ Кисть
    </button>
    <button
      className={eraserMode === 'select' ? styles.subToolActive : styles.subTool}
      onClick={() => setEraserMode('select')}
    >
      □ Выделить область
    </button>
  </div>
)}

{/* Секция РАЗМЕТКА — после всех инструментов редактора */}
```

CSS подрежимов:
```css
.subTools {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 4px 20px 12px;
}
.subTool {
  background: #111;
  border: 1px solid #333;
  color: #aaa;
  padding: 8px 12px;
  border-radius: 6px;
  font-size: 13px;
  cursor: pointer;
  text-align: left;
  font-family: 'Courier New', monospace;
}
.subToolActive {
  border-color: #FF5722;
  color: #FF5722;
}
```

### 7b: "Выделить область" работает как кисть — нужен drag-rectangle

**Файл:** `WallEditorCanvas.tsx`

Добавить prop `eraserMode`:
```typescript
interface WallEditorCanvasProps {
  // ...существующие
  eraserMode?: 'brush' | 'select';   // ДОБАВИТЬ
}
```

В attachToolHandlers, секция `tool === 'eraser'`:

```typescript
if (tool === 'eraser') {
  const mode = eraserModeRef.current ?? 'brush';
  
  if (mode === 'brush') {
    // Текущее поведение — без изменений
    canvas.isDrawingMode = true;
    canvas.freeDrawingBrush = new fabric.PencilBrush(canvas);
    canvas.freeDrawingBrush.color = 'black';
    canvas.freeDrawingBrush.width = brushSizeRef.current;
    // + кастомный курсор (если реализован)
    return;
  }
  
  // mode === 'select': drag-rectangle для стирания области
  canvas.isDrawingMode = false;
  let isDrawing = false;
  let startX = 0;
  let startY = 0;
  let selRect: fabric.Rect | null = null;
  let confirmBtn: fabric.Rect | null = null;
  let cancelBtn: fabric.Rect | null = null;
  let confirmText: fabric.Text | null = null;
  let cancelText: fabric.Text | null = null;

  const onMouseDown = (opt: fabric.IEvent<MouseEvent>) => {
    // Если уже есть выделение с кнопками — не начинать новое
    if (selRect) return;
    
    const pointer = canvas.getPointer(opt.e);
    isDrawing = true;
    startX = pointer.x;
    startY = pointer.y;

    selRect = new fabric.Rect({
      left: startX, top: startY, width: 0, height: 0,
      fill: 'rgba(255, 0, 0, 0.2)',
      stroke: '#FF5722',
      strokeWidth: 1,
      strokeDashArray: [4, 4],
      selectable: false, evented: false,
    });
    canvas.add(selRect);
  };

  const onMouseMove = (opt: fabric.IEvent<MouseEvent>) => {
    if (!isDrawing || !selRect) return;
    const pointer = canvas.getPointer(opt.e);
    const w = pointer.x - startX;
    const h = pointer.y - startY;
    selRect.set({
      left: w < 0 ? pointer.x : startX,
      top: h < 0 ? pointer.y : startY,
      width: Math.abs(w),
      height: Math.abs(h),
    });
    canvas.renderAll();
  };

  const cleanup = () => {
    if (selRect) canvas.remove(selRect);
    if (confirmBtn) canvas.remove(confirmBtn);
    if (cancelBtn) canvas.remove(cancelBtn);
    if (confirmText) canvas.remove(confirmText);
    if (cancelText) canvas.remove(cancelText);
    selRect = null; confirmBtn = null; cancelBtn = null;
    confirmText = null; cancelText = null;
    canvas.renderAll();
  };

  const onMouseUp = () => {
    if (!isDrawing || !selRect) return;
    isDrawing = false;

    const rLeft = selRect.left ?? startX;
    const rTop = selRect.top ?? startY;
    const rW = selRect.width ?? 0;
    const rH = selRect.height ?? 0;

    if (rW < 5 || rH < 5) {
      cleanup();
      return;
    }

    // Кнопка ✓ (подтвердить стирание)
    confirmBtn = new fabric.Rect({
      left: rLeft + rW + 8, top: rTop,
      width: 28, height: 28,
      fill: '#4CAF50', rx: 4, ry: 4,
      selectable: false, evented: true,
    });
    confirmText = new fabric.Text('✓', {
      left: rLeft + rW + 15, top: rTop + 4,
      fontSize: 16, fill: '#fff',
      selectable: false, evented: false,
    });

    // Кнопка ✕ (отменить)
    cancelBtn = new fabric.Rect({
      left: rLeft + rW + 8, top: rTop + 36,
      width: 28, height: 28,
      fill: '#555', rx: 4, ry: 4,
      selectable: false, evented: true,
    });
    cancelText = new fabric.Text('✕', {
      left: rLeft + rW + 15, top: rTop + 40,
      fontSize: 16, fill: '#fff',
      selectable: false, evented: false,
    });

    confirmBtn.on('mousedown', () => {
      // Закрасить область чёрным (стереть)
      const eraseRect = new fabric.Rect({
        left: rLeft, top: rTop, width: rW, height: rH,
        fill: 'black', selectable: false, evented: false,
      });
      canvas.add(eraseRect);
      cleanup();
    });

    cancelBtn.on('mousedown', () => {
      cleanup();
    });

    canvas.add(confirmBtn, confirmText, cancelBtn, cancelText);
    canvas.renderAll();
  };

  canvas.on('mouse:down', onMouseDown);
  canvas.on('mouse:move', onMouseMove);
  canvas.on('mouse:up', onMouseUp);
  return;
}
```

Добавить ref для eraserMode:
```typescript
const eraserModeRef = useRef(eraserMode);
useEffect(() => { eraserModeRef.current = eraserMode ?? 'brush'; }, [eraserMode]);
```

Пересоздавать обработчики при смене eraserMode:
```typescript
useEffect(() => {
  attachToolHandlers();
}, [activeTool, brushSize, eraserMode, attachToolHandlers]);
```

---

## Fix 8: Убрать StepBuild — кнопка "> ПОСТРОИТЬ" на шаге 3

**Файл:** `WizardPage.tsx`, `useWizard.ts`, `types/wizard.ts`

Wizard: 6 шагов → 5 шагов. Убрать отдельную страницу "Построить".

### WizardPage.tsx:
1. Убрать `import { StepBuild }` и `case 4: <StepBuild />`
2. Перенумеровать: StepView3D → case 4, StepSave → case 5
3. `totalSteps={6}` → `totalSteps={5}`
4. Кнопка на шаге 3:
   ```tsx
   nextLabel={state.step === 3 ? '> ПОСТРОИТЬ' : '> Далее'}
   ```
5. handleNext для step 3:
   ```tsx
   if (state.step === 3 && canvasRef.current) {
     const blob = await canvasRef.current.getBlob();
     const { rooms, doors } = canvasRef.current.getAnnotations();
     await wizard.saveMaskAndAnnotations(blob, rooms, doors);
     await wizard.buildMesh();
     // buildMesh уже переводит на следующий шаг
   }
   ```

### useWizard.ts:
1. nextStep clamp: 6 → 5
2. buildMesh: после успеха `step: 4` (теперь 4 = 3D просмотр)

### types/wizard.ts:
1. `WizardStep = 1 | 2 | 3 | 4 | 5` (убрать 6)

### WizardShell.tsx:
Добавить prop `nextLabel?: string` если нет. Использовать вместо захардкоженного "> Далее".

### Удалить:
- `frontend/src/components/Wizard/StepBuild.tsx`
- `frontend/src/components/Wizard/StepBuild.module.css` (если есть)

---

## Порядок выполнения

1. Fix 8 — убрать StepBuild, 5 шагов (структурное — сначала)
2. Fix 6 — фон панели темнее
3. Fix 2 — иконки влево
4. Fix 3 — перегруппировать секции
5. Fix 5 — дизайн ползунков
6. Fix 4 — дизайн toggle
7. Fix 7a — подрежимы ластика под кнопкой
8. Fix 7b — "Выделить область" как drag-rectangle
9. Fix 1 — автоповорот превью

После каждого — `npx tsc --noEmit` + визуальная проверка.