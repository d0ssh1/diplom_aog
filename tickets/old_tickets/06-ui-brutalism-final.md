# Тикет: UI полировка — детальные исправления панели инструментов

Этот тикет ЗАМЕНЯЕТ предыдущий tickets/11-ui-fixes-combined.md.
Выполнять СТРОГО по порядку, после каждого fix — визуальная проверка.

---

## Общие правила дизайна (применять ВЕЗДЕ)

### Шрифты
```css
/* Sans-serif — основной UI: заголовки, кнопки, лейблы полей */
font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;

/* Monospace — технический: имена файлов, бейджи, значения ползунков, 
   заголовки секций (// РЕДАКТОР СТЕН), стрелки (>) */
font-family: 'Courier New', 'Consolas', monospace;
```

Правила:
- Заголовки секций `// РЕДАКТОР СТЕН` → monospace, uppercase, letter-spacing: 2px, color: #666
- Названия кнопок `Нарисовать стену` → monospace, 15px
- Лейблы полей `ЗДАНИЕ`, `ЭТАЖ` → sans-serif, uppercase, 11px, letter-spacing: 1px
- Имена файлов `plan_level_11.jpg` → monospace
- Бейджи `Готово`, `PREVIEW` → monospace
- Значения ползунков `6 px`, `15`, `10` → monospace, color: #666
- Текст на кнопках `Выбрать файлы`, `> Далее` → sans-serif

### Скругления — НЕТ (брутализм)
```css
/* Кнопки инструментов — НЕТ скругления */
border-radius: 0;

/* Единственное исключение: кнопки footer (Назад, > Далее) — минимальное */
border-radius: 2px;
```

### Разделители между секциями
Между секциями (// РЕДАКТОР СТЕН и // РАЗМЕТКА и // ПАРАМЕТРЫ МАСКИ и // НАЛОЖЕНИЕ) — 
тонкая прозрачная линия:
```css
.sectionDivider {
  height: 1px;
  background: rgba(255, 255, 255, 0.08);
  margin: 16px 0;
}
```

### Фон панели
```css
/* Правая панель */
background: #0d0d0d;

/* Кнопки инструментов */
background: #1a1a1a;
```

---

## Fix 1: Иконки — убрать левый отступ

**Файл:** `ToolPanelV2.module.css`

Иконки имеют лишний padding/margin слева. Нужно:

```css
.toolButton {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 14px 16px;          /* одинаковый padding слева и справа */
  background: #1a1a1a;
  border: 2px solid transparent;
  border-radius: 0;             /* брутализм — без скругления */
  color: #ffffff;
  font-family: 'Courier New', monospace;
  font-size: 15px;
  cursor: pointer;
  transition: border-color 0.15s;
  text-align: left;             /* текст слева */
}

.toolButtonIcon {
  width: 36px;
  height: 36px;
  min-width: 36px;              /* не сжимается */
  background: #2a2a2a;
  border-radius: 0;             /* без скругления */
  display: flex;
  align-items: center;
  justify-content: center;
  color: #ffffff;
  flex-shrink: 0;               /* не сжимается */
}

.toolButtonActive {
  border-color: #FF5722;
  color: #FF5722;
}

.toolButtonActive .toolButtonIcon {
  background: #FF5722;
  color: #ffffff;
}
```

Убедиться что у `.toolButton` НЕТ:
- `padding-left` больше чем `padding-right`
- `margin-left` на иконке
- `justify-content: center` на кнопке

---

## Fix 2: Толщина линии — ПОД кнопкой "Нарисовать стену"

**Файл:** `StepWallEditor.tsx`

Слайдер "Толщина линии" должен появляться ТОЛЬКО когда активен инструмент 
"Нарисовать стену" и располагаться СРАЗУ ПОД этой кнопкой, ДО кнопки "Стереть".

Нужно передавать в ToolPanelV2 информацию о том, что под определёнными кнопками 
есть вложенный контент. Либо рендерить кнопки вручную в StepWallEditor, не через ToolPanelV2.

**Рекомендуемый подход:** Рендерить секцию "// РЕДАКТОР СТЕН" вручную 
в StepWallEditor, не через ToolPanelV2.sections:

```tsx
{/* Секция РЕДАКТОР СТЕН — рендерим вручную для вложенного контента */}
<div className={styles.section}>
  <div className={styles.sectionTitle}>// РЕДАКТОР СТЕН</div>
  
  {/* Кнопка "Нарисовать стену" */}
  <button 
    className={`${styles.toolButton} ${activeTool === 'wall' ? styles.toolButtonActive : ''}`}
    onClick={() => setActiveTool('wall')}
  >
    <span className={styles.toolButtonIcon}><Pencil size={18} /></span>
    Нарисовать стену
  </button>
  
  {/* Толщина линии — СРАЗУ ПОД кнопкой, видна ТОЛЬКО когда wall активен */}
  {activeTool === 'wall' && (
    <div className={styles.inlineParam}>
      <span className={styles.inlineParamLabel}>Толщина линии</span>
      <div className={styles.sliderRow}>
        <input type="range" min={1} max={30} value={brushSize} 
               onChange={(e) => setBrushSize(Number(e.target.value))} />
        <span className={styles.sliderValue}>{brushSize} px</span>
      </div>
    </div>
  )}
  
  {/* Кнопка "Стереть" */}
  <button
    className={`${styles.toolButton} ${activeTool === 'eraser' ? styles.toolButtonActive : ''}`}
    onClick={() => setActiveTool('eraser')}
  >
    <span className={styles.toolButtonIcon}><Eraser size={18} /></span>
    Стереть
  </button>
  
  {/* Подрежимы ластика — СРАЗУ ПОД кнопкой "Стереть" */}
  {activeTool === 'eraser' && (
    <div className={styles.subTools}>
      <button 
        className={`${styles.subTool} ${eraserMode === 'brush' ? styles.subToolActive : ''}`}
        onClick={() => setEraserMode('brush')}
      >
        ○ Кисть
      </button>
      <button
        className={`${styles.subTool} ${eraserMode === 'select' ? styles.subToolActive : ''}`}
        onClick={() => setEraserMode('select')}
      >
        □ Выделить область
      </button>
    </div>
  )}
</div>

<div className={styles.sectionDivider} />

{/* Секция РАЗМЕТКА — можно через ToolPanelV2 или тоже вручную */}
<div className={styles.section}>
  <div className={styles.sectionTitle}>// РАЗМЕТКА</div>
  {/* Кабинет, Лестница, Лифт, Коридор, Дверь */}
</div>

<div className={styles.sectionDivider} />

{/* Секция ПАРАМЕТРЫ МАСКИ */}
<div className={styles.section}>
  <div className={styles.sectionTitle}>// ПАРАМЕТРЫ МАСКИ</div>
  {/* Чувствительность, Контраст */}
</div>

<div className={styles.sectionDivider} />

{/* Секция НАЛОЖЕНИЕ */}
<div className={styles.section}>
  <div className={styles.sectionTitle}>// НАЛОЖЕНИЕ</div>
  {/* Toggle + Прозрачность */}
</div>
```

CSS вложенного слайдера:
```css
.inlineParam {
  padding: 8px 16px 12px;
  background: #111;
}
.inlineParamLabel {
  font-family: 'Courier New', monospace;
  font-size: 12px;
  color: #888;
  display: block;
  margin-bottom: 6px;
}
```

---

## Fix 3: Подрежимы ластика — позиция и функционал

### 3a: Позиция
Подрежимы "Кисть" и "Выделить область" рендерятся СРАЗУ ПОД кнопкой "Стереть",
ДО секции "// РАЗМЕТКА". Код выше (Fix 2) уже это делает.

CSS подрежимов:
```css
.subTools {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 4px 16px 8px;
}
.subTool {
  background: #111;
  border: 1px solid #2a2a2a;
  color: #888;
  padding: 8px 12px;
  border-radius: 0;              /* брутализм */
  font-family: 'Courier New', monospace;
  font-size: 13px;
  cursor: pointer;
  text-align: left;
}
.subToolActive {
  border-color: #FF5722;
  color: #FF5722;
}
```

### 3b: "Выделить область" — drag-rectangle с ✓/✕

**Файл:** `WallEditorCanvas.tsx`

Добавить prop:
```typescript
eraserMode?: 'brush' | 'select';
```

Добавить ref:
```typescript
const eraserModeRef = useRef(eraserMode ?? 'brush');
useEffect(() => { eraserModeRef.current = eraserMode ?? 'brush'; }, [eraserMode]);
```

Добавить eraserMode в зависимости пересоздания обработчиков:
```typescript
useEffect(() => {
  attachToolHandlers();
}, [activeTool, brushSize, eraserMode, attachToolHandlers]);
```

В attachToolHandlers, заменить секцию `tool === 'eraser'`:

```typescript
if (tool === 'eraser') {
  const mode = eraserModeRef.current;
  
  if (mode === 'brush') {
    // Текущее поведение — кисть
    canvas.isDrawingMode = true;
    canvas.freeDrawingBrush = new fabric.PencilBrush(canvas);
    canvas.freeDrawingBrush.color = 'black';
    canvas.freeDrawingBrush.width = brushSizeRef.current;
    return;
  }
  
  // mode === 'select'
  canvas.isDrawingMode = false;
  
  let drawing = false;
  let sx = 0, sy = 0;
  let sel: fabric.Rect | null = null;
  let btnConfirm: fabric.Group | null = null;
  let btnCancel: fabric.Group | null = null;
  
  const clearSelection = () => {
    [sel, btnConfirm, btnCancel].forEach(obj => {
      if (obj) canvas.remove(obj);
    });
    sel = null; btnConfirm = null; btnCancel = null;
    canvas.renderAll();
  };

  canvas.on('mouse:down', (opt: fabric.IEvent<MouseEvent>) => {
    if (sel) return;  // уже есть выделение — ждём подтверждения
    const p = canvas.getPointer(opt.e);
    drawing = true;
    sx = p.x; sy = p.y;
    sel = new fabric.Rect({
      left: sx, top: sy, width: 0, height: 0,
      fill: 'rgba(255,0,0,0.15)',
      stroke: '#FF5722', strokeWidth: 1, strokeDashArray: [6, 3],
      selectable: false, evented: false,
    });
    canvas.add(sel);
  });

  canvas.on('mouse:move', (opt: fabric.IEvent<MouseEvent>) => {
    if (!drawing || !sel) return;
    const p = canvas.getPointer(opt.e);
    sel.set({
      left: Math.min(sx, p.x), top: Math.min(sy, p.y),
      width: Math.abs(p.x - sx), height: Math.abs(p.y - sy),
    });
    canvas.renderAll();
  });

  canvas.on('mouse:up', () => {
    if (!drawing || !sel) return;
    drawing = false;
    const rL = sel.left!, rT = sel.top!, rW = sel.width!, rH = sel.height!;
    if (rW < 5 || rH < 5) { clearSelection(); return; }

    // Кнопка ✓
    const cBg = new fabric.Rect({ width: 26, height: 26, fill: '#4CAF50', rx: 0, ry: 0 });
    const cTxt = new fabric.Text('✓', { fontSize: 16, fill: '#fff', left: 6, top: 3 });
    btnConfirm = new fabric.Group([cBg, cTxt], {
      left: rL + rW + 6, top: rT,
      selectable: false, evented: true, hoverCursor: 'pointer',
    });
    
    // Кнопка ✕
    const xBg = new fabric.Rect({ width: 26, height: 26, fill: '#444', rx: 0, ry: 0 });
    const xTxt = new fabric.Text('✕', { fontSize: 16, fill: '#fff', left: 6, top: 3 });
    btnCancel = new fabric.Group([xBg, xTxt], {
      left: rL + rW + 6, top: rT + 32,
      selectable: false, evented: true, hoverCursor: 'pointer',
    });

    btnConfirm.on('mousedown', () => {
      // Закрасить чёрным
      canvas.add(new fabric.Rect({
        left: rL, top: rT, width: rW, height: rH,
        fill: 'black', selectable: false, evented: false,
      }));
      clearSelection();
    });

    btnCancel.on('mousedown', () => { clearSelection(); });

    canvas.add(btnConfirm, btnCancel);
    canvas.renderAll();
  });

  return;
}
```

---

## Fix 4: Ползунки — серый track, серый thumb

**Файл:** `StepWallEditor.module.css` (или глобальный CSS для шага 3)

ВСЕ ползунки на панели — одинаковый стиль:

```css
/* Track — тёмно-серый */
input[type="range"] {
  -webkit-appearance: none;
  appearance: none;
  width: 100%;
  height: 3px;
  background: #333;
  border-radius: 0;
  outline: none;
  margin: 8px 0;
}

/* Thumb — светло-серый прямоугольник */
input[type="range"]::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 12px;
  height: 18px;
  background: #999;
  border-radius: 0;           /* прямоугольный, НЕ круглый */
  cursor: pointer;
  border: none;
}
input[type="range"]::-moz-range-thumb {
  width: 12px;
  height: 18px;
  background: #999;
  border-radius: 0;
  cursor: pointer;
  border: none;
}
input[type="range"]::-moz-range-track {
  height: 3px;
  background: #333;
  border-radius: 0;
  border: none;
}

/* Значения ползунков — серый monospace */
.sliderValue {
  font-family: 'Courier New', monospace;
  font-size: 13px;
  color: #666;
  min-width: 40px;
  text-align: right;
}
```

НЕТ оранжевой заливки слева от thumb. НЕТ белого track. Только серый.

---

## Fix 5: Toggle "Показать оригинал" — квадрат без галочки

**Файл:** CSS

```css
.squareToggle {
  width: 22px;
  height: 22px;
  background: transparent;
  border: 2px solid #444;
  border-radius: 0;            /* квадрат, не скруглённый */
  cursor: pointer;
  transition: all 0.15s;
  /* Убрать всё содержимое внутри — никаких ✓ */
}
.squareToggleActive {
  background: #FF5722;
  border-color: #FF5722;
}
```

В JSX — toggle это просто `<button>`, без вложенных иконок/текста:
```tsx
<button
  className={`${styles.squareToggle} ${overlayEnabled ? styles.squareToggleActive : ''}`}
  onClick={() => setOverlayEnabled(!overlayEnabled)}
/>
```

---

## Fix 6: Разделители между секциями

**Файл:** CSS

```css
.sectionDivider {
  height: 1px;
  background: rgba(255, 255, 255, 0.06);
  margin: 12px 16px;
}
```

Вставить `<div className={styles.sectionDivider} />` между каждой секцией:
- После // РЕДАКТОР СТЕН (с подрежимами)
- После // РАЗМЕТКА
- После // ПАРАМЕТРЫ МАСКИ
- Перед // НАЛОЖЕНИЕ

---

## Fix 7: Заголовки секций

```css
.sectionTitle {
  font-family: 'Courier New', monospace;
  font-size: 11px;
  color: #555;
  text-transform: uppercase;
  letter-spacing: 3px;
  padding: 12px 16px 8px;
}
```

---

## Fix 8: Загрузка (шаг 1) — убрать поле "Блок"

**Файл:** `MetadataForm.tsx` или `StepUpload.tsx`

Убрать поле "БЛОК" / "Северный". Оставить только:
- ЗДАНИЕ (полная ширина)
- ЭТАЖ + КРЫЛО (в одну строку, grid 1fr 1fr)

---

## Fix 9: Секция "// ПАРАМЕТРЫ" → "// ПАРАМЕТРЫ МАСКИ"

Переименовать заголовок секции с параметрами чувствительности и контраста:
`// ПАРАМЕТРЫ` → `// ПАРАМЕТРЫ МАСКИ`

---

## Порядок выполнения

1. Fix 1 — иконки без отступа + border-radius: 0
2. Fix 7 — заголовки секций (monospace, 11px, #555)
3. Fix 4 — ползунки (серый track, прямоугольный thumb)
4. Fix 5 — toggle (квадрат без галочки)
5. Fix 6 — разделители между секциями
6. Fix 2 — толщина линии под "Нарисовать стену" (переделка рендера)
7. Fix 3a — подрежимы ластика под "Стереть"
8. Fix 3b — "Выделить область" drag-rectangle с ✓/✕
9. Fix 8 — убрать "Блок"
10. Fix 9 — переименовать секцию

После КАЖДОГО fix: `npx tsc --noEmit` + визуальная проверка.
НЕ менять backend. НЕ менять логику инструментов кроме ластика.