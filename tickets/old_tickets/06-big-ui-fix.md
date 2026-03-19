# Тикет 13: Баги редактора стен + UI-фиксы панели инструментов

**Приоритет:** Высокий  
**Затрагиваемые файлы:**
- `frontend/src/components/Editor/WallEditorCanvas.tsx`
- `frontend/src/components/Wizard/StepWallEditor.tsx`
- `frontend/src/components/Wizard/StepWallEditor.module.css`
- `frontend/src/components/Editor/ToolPanelV2.module.css`

**Скриншоты-референсы:** приложены в чате (6 изображений)

---

## Обзор

На шаге 3 (Редактор стен) накопилось множество багов, связанных с Fabric.js-взаимодействием объектов на канвасе, а также несоответствия UI панели инструментов относительно дизайн-референса. Тикет разбит на две части: **Часть A — баги канваса** (критические, ломают UX) и **Часть B — UI/визуальные фиксы** (полировка).

---

## ЧАСТЬ A: Баги Fabric.js канваса (WallEditorCanvas.tsx)

### A1. Инструмент «Нарисовать стену» — клик рядом с существующей стеной выделяет её

**Проблема:**  
При рисовании новой стены (клик → клик), если первый клик попадает рядом с уже нарисованной стеной (fabric.Line), Fabric.js перехватывает событие и выделяет старую линию (появляются handles перемещения/масштабирования). При этом новая стена всё равно начинает строиться — в итоге одновременно видны и handles старой стены, и preview-линия новой.

**Корневая причина:**  
Нарисованные стены создаются с `selectable: true, evented: true` (строки 339–340 WallEditorCanvas.tsx). Fabric.js обрабатывает клик по этим объектам раньше, чем кастомный обработчик `mouse:down`.

**Решение:**  
При активном инструменте `wall` (и `door`) нужно **временно блокировать интерактивность всех объектов** на канвасе:

```typescript
// В начале attachToolHandlers, когда tool === 'wall' || tool === 'door':
canvas.forEachObject((obj) => {
  obj.selectable = false;
  obj.evented = false;
});
canvas.discardActiveObject();
canvas.renderAll();
```

При переключении на другой инструмент — восстанавливать:
```typescript
// В начале attachToolHandlers (секция Reset), ДО назначения нового инструмента:
canvas.forEachObject((obj) => {
  const data = (obj as any).data;
  // Восстанавливаем интерактивность только для аннотаций и стен (не для служебных объектов)
  if (data?.type === 'annotation' || data?.type === 'wall' || data?.type === 'door') {
    obj.selectable = true;
    obj.evented = true;
  }
});
canvas.discardActiveObject();
```

---

### A2. Ластик (кисть) — стёртые области создаются как перемещаемые объекты

**Проблема:**  
Режим ластика «Кисть» использует `fabric.PencilBrush`, который создаёт `fabric.Path` объекты. Эти объекты по умолчанию `selectable: true` — их можно выделить, перетащить, повернуть. Это критический баг:
- Стёрка «рисует» чёрные штрихи как отдельные объекты поверх маски
- При переключении на другой инструмент можно случайно схватить «стёрку» и утащить
- При «Выделить область» drag может зацепить ранее нарисованный eraser-path и открыть его для редактирования (видно на скриншоте 2 — handles на тёмном прямоугольнике)

**Корневая причина:**  
`fabric.PencilBrush` добавляет `fabric.Path` с `selectable: true`. Никакого постпроцессинга нет.

**Решение:**  
Подписаться на событие `path:created` и сразу блокировать интерактивность + помечать объект:

```typescript
// После инициализации canvas.isDrawingMode = true и настройки PencilBrush:
canvas.on('path:created', (e: any) => {
  const path = e.path as fabric.Path;
  path.selectable = false;
  path.evented = false;
  // Помечаем для идентификации
  (path as any).data = { type: 'eraser-stroke' };
});
```

**Важно:** Этот обработчик нужно снимать при переключении инструмента — добавить `canvas.off('path:created')` в секцию Reset в начале `attachToolHandlers`.

---

### A3. Ластик (кисть) — нет ползунка толщины кисти

**Проблема:**  
При выборе «Стереть» → «Кисть» нет ползунка для настройки размера кисти ластика. Текущий `brushSize` state используется и для толщины стены, и для размера ластика, но ползунок появляется только при `activeTool === 'wall'`.

**Решение:**  
В `StepWallEditor.tsx` добавить ползунок под подрежимом «Кисть» (аналогично толщине линии у стены). При этом ползунок должен появляться в подменю ластика, когда `eraserMode === 'brush'`:

```tsx
{activeTool === 'eraser' && (
  <div className={styles.subTools}>
    <button ... onClick={() => setEraserMode('brush')}>
      ○ Кисть
    </button>
    {/* Ползунок толщины кисти — только когда выбрана "Кисть" */}
    {eraserMode === 'brush' && (
      <div className={styles.inlineParam}>
        <span className={styles.inlineParamLabel}>Размер кисти</span>
        <div className={styles.sliderRow}>
          <input type="range" ... value={brushSize} onChange={...} />
          <span className={styles.sliderValue}>{brushSize} px</span>
        </div>
      </div>
    )}
    <button ... onClick={() => setEraserMode('select')}>
      □ Выделить область
    </button>
  </div>
)}
```

---

### A4. Ластик — режим «Кисть» иногда ведёт себя как «Выделить область»

**Проблема:**  
Даже при выбранном режиме «Кисть» периодически начинается поведение «Выделить область» (drag-rectangle). 

**Корневая причина:**  
В `attachToolHandlers` проверка `eraserModeRef.current` замыкается в момент вызова, но `useCallback(() => {...}, [])` имеет пустой массив зависимостей (строка 503). При этом `attachToolHandlers` вызывается через `useEffect` при изменении `activeTool` и `brushSize`, но **НЕ при изменении `eraserMode`**:

```typescript
// Строка 506-508:
useEffect(() => {
  attachToolHandlers();
}, [activeTool, brushSize, attachToolHandlers]); // ← eraserMode НЕТ!
```

Хотя `eraserModeRef` обновляется, handlers уже навешены от предыдущего режима и не переподключаются.

**Решение:**  
Добавить `eraserMode` в зависимости useEffect:

```typescript
useEffect(() => {
  attachToolHandlers();
}, [activeTool, brushSize, eraserMode, attachToolHandlers]);
```

---

### A5. Ластик (выделить область) — уродливые зелёный/серый кружки вместо кнопок ✓/✕

**Проблема:**  
Текущая реализация «Выделить область» создаёт `fabric.Circle` (зелёный `#4CAF50` для подтверждения, серый `#666` для отмены) как Fabric.js-объекты на канвасе (строки 250–259). Выглядит непрофессионально и не соответствует дизайн-референсу (скриншоты 5–6).

**Решение:**  
Полностью переделать кнопки подтверждения/отмены. Вместо Fabric.js-объектов — **HTML-кнопки** поверх канваса через React state. Это даёт:
- Правильный дизайн (квадратные кнопки, тень, hover-анимация)
- Нет конфликтов с Fabric.js selection
- Легче стилизовать

**Новый подход:**

1. В `WallEditorCanvas.tsx` добавить props и state для передачи координат выделения наверх:

```typescript
// Новый prop:
onSelectionComplete?: (rect: { x: number; y: number; w: number; h: number }) => void;
onSelectionConfirm?: () => void;

// Или проще — новые state:
const [eraseSelection, setEraseSelection] = useState<{
  left: number; top: number; width: number; height: number;
  fabricRect: fabric.Rect;
} | null>(null);
```

2. В обработчике `onMouseUp` для select-erase: вместо создания `fabric.Circle` — сохранить координаты выделения в state и отрендерить HTML-кнопки в JSX.

3. JSX рендер кнопок (в `WallEditorCanvas` return):

```tsx
{eraseSelection && (
  <div
    className={styles.eraseButtons}
    style={{
      left: eraseSelection.left + eraseSelection.width + 12,
      top: Math.min(
        eraseSelection.top + eraseSelection.height - 40,
        containerHeight - 50
      ),
    }}
  >
    <button
      className={styles.eraseConfirm}
      onClick={handleConfirmErase}
      title="Подтвердить удаление"
    >
      ✓
    </button>
    <button
      className={styles.eraseCancel}
      onClick={handleCancelErase}
      title="Отменить"
    >
      ✕
    </button>
  </div>
)}
```

4. CSS (дизайн по референсу — скриншоты 5, 6):

```css
.eraseButtons {
  position: absolute;
  display: flex;
  gap: 4px;
  z-index: 20;
  pointer-events: auto;
}

.eraseConfirm {
  width: 40px;
  height: 40px;
  background: #FF4500;
  color: white;
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  box-shadow: 2px 2px 0px 0px rgba(0, 0, 0, 1);
  transition: transform 0.1s, box-shadow 0.1s;
}

.eraseConfirm:hover {
  transform: translate(1px, 1px);
  box-shadow: 1px 1px 0px 0px rgba(0, 0, 0, 1);
}

.eraseCancel {
  width: 40px;
  height: 40px;
  background: #000;
  color: white;
  border: 1px solid #333;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  box-shadow: 2px 2px 0px 0px rgba(0, 0, 0, 1);
  transition: transform 0.1s, box-shadow 0.1s;
}

.eraseCancel:hover {
  transform: translate(1px, 1px);
  box-shadow: 1px 1px 0px 0px rgba(0, 0, 0, 1);
  background: #1a1a1a;
}
```

**Hover-анимация «продавливания»:** При наведении кнопка сдвигается на 1px вправо-вниз, а тень уменьшается с `2px 2px` до `1px 1px` — создаёт эффект нажатия.

---

### A6. Ластик (выделить область) — при блокировке объектов нужно учитывать этот режим

**Проблема:**  
Даже если мы починим A1 (блокировка интерактивности объектов при рисовании стен), нужно аналогично блокировать объекты при `activeTool === 'eraser'` — иначе при drag-выделении области можно случайно зацепить и выделить стену или аннотацию.

**Решение:**  
Блокировать интерактивность всех объектов при **любом** активном инструменте, кроме режима "просмотр/выделение" (которого у нас нет). Логика из A1 должна работать для всех tool-режимов:

```typescript
// В начале attachToolHandlers — всегда:
canvas.forEachObject((obj) => {
  obj.selectable = false;
  obj.evented = false;
});
canvas.discardActiveObject();
canvas.renderAll();
```

Единственное исключение — если в будущем добавится инструмент «выбор/перемещение», тогда для него объекты нужно разблокировать.

---

## ЧАСТЬ B: UI/визуальные фиксы панели инструментов

### B1. Шрифты кнопок — sans-serif вместо monospace

**Проблема:**  
Сейчас ВСЕ тексты в кнопках панели (названия инструментов: «Нарисовать стену», «Стереть», «Кабинет» и т.д.) используют `font-family: 'Courier New', monospace` (из `.toolBtn` и `.toolLabel` в ToolPanelV2.module.css).

По дизайн-референсу (скриншот 3 vs 4) должно быть:
- **`font-sans` (системный sans-serif)** — для названий инструментов, лейблов ползунков, текста toggle
- **`font-mono` (Courier New, Consolas)** — ТОЛЬКО для заголовков секций (`// РЕДАКТОР СТЕН`, `// РАЗМЕТКА`, etc.) и числовых значений (`6 px`, `15`, `40%`)

**Файл:** `ToolPanelV2.module.css`

**Изменения:**

```css
/* .toolBtn — убрать monospace */
.toolBtn {
  /* ... */
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  font-size: 14px;
  /* ... */
}

/* .toolLabel — убрать, если есть отдельный класс, или поменять */
.toolLabel {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  font-size: 14px;
}
```

**Файл:** `StepWallEditor.module.css`

Аналогично для `.paramLabel`, `.inlineParamLabel`, `.toggleLabel span` — поменять на sans-serif.

Оставить monospace ТОЛЬКО для:
- `.sectionTitle` (уже monospace — ОК)
- `.sliderValue` (числовые значения — уже monospace — ОК)

---

### B2. Дизайн подменю с оранжевой полоской слева (border-left)

**Проблема:**  
Текущие подменю (толщина линии под «Нарисовать стену», подрежимы ластика) не имеют визуальной «привязки» к родительской кнопке. По референсу (документ 9, секция 2) подменю должно иметь:
- `border-left: 2px solid #FF4500` — оранжевая линия слева
- `margin-left: 16px` — отступ от основных кнопок  
- `padding-left: 16px`
- `background: rgba(255, 69, 0, 0.05)` — лёгкий оранжевый фон

**Изменения в StepWallEditor.module.css:**

```css
.inlineParam {
  margin-left: 16px;
  padding: 12px 8px 12px 16px;
  border-left: 2px solid #FF4500;
  background: rgba(255, 69, 0, 0.05);
}

.subTools {
  margin-left: 16px;
  padding: 10px 0 10px 16px;
  border-left: 2px solid #FF4500;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
```

---

### B3. Секция «НАЛОЖЕНИЕ» обрезается снизу

**Проблема:**  
На скриншоте 4 видно, что секция «НАЛОЖЕНИЕ» стоит впритык к нижнему краю панели — ползунок «Прозрачность» едва виден, нет отступа снизу.

**Решение:**  
Добавить `padding-bottom` к последней секции или к `.inner`:

```css
/* В ToolPanelV2.module.css */
.inner {
  /* ... существующие стили ... */
  padding-bottom: 24px;  /* Добавить */
}
```

Или в `StepWallEditor.module.css` для последней `.paramSection` добавить `margin-bottom: 24px`.

---

### B4. Ползунки — стиль по дизайн-референсу

**Проблема:**  
Текущие ползунки (в StepWallEditor.module.css) визуально близки к цели, но нужно убедиться:
- Track: тонкая полоска `#333` (1px высотой), НЕ `#FF4500`
- Thumb: белый прямоугольник (без border-radius), hover — scale(1.1)
- Нет оранжевого accent-color на track

**Проверить в StepWallEditor.module.css:**

```css
.sliderInput {
  flex: 1;
  height: 1px;           /* Тоньше — 1px вместо 3px */
  appearance: none;
  -webkit-appearance: none;
  background: #333;       /* Серый track */
  border-radius: 0;
  outline: none;
  cursor: pointer;
}

.sliderInput::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 16px;            /* Чуть шире */
  height: 24px;           /* Чуть выше */
  background: #fff;       /* Белый, не серый */
  border-radius: 0;
  cursor: pointer;
  border: none;
  transition: transform 0.15s;
}

.sliderInput::-webkit-slider-thumb:hover {
  transform: scale(1.1);
}
```

---

## Порядок реализации

1. **A1 + A6** — Блокировка интерактивности объектов для всех инструментов (это фундаментальный фикс, без него остальные баги канваса проявляются)
2. **A2** — Ластик-кисть: пометка path как non-selectable через `path:created`
3. **A4** — eraserMode в зависимостях useEffect (1 строка, мгновенный фикс)
4. **A5** — Переделка кнопок ✓/✕ с Fabric.Circle на HTML  
5. **A3** — Ползунок толщины для кисти ластика
6. **B1** — Шрифты sans-serif для кнопок
7. **B2** — Подменю с оранжевой border-left  
8. **B3** — Padding для секции НАЛОЖЕНИЕ
9. **B4** — Финальная полировка ползунков

---

## Чеклист после реализации

- [ ] Инструмент «Стена»: клик рядом с существующей стеной НЕ выделяет её
- [ ] Инструмент «Стена»: клик-клик создаёт стену, preview-линия работает
- [ ] Ластик «Кисть»: рисует чёрным, штрихи НЕ выделяемые и НЕ перемещаемые
- [ ] Ластик «Кисть»: есть ползунок размера кисти
- [ ] Ластик «Выделить область»: drag-rectangle рисуется корректно
- [ ] Ластик «Выделить область»: кнопки ✓/✕ — квадратные HTML-кнопки, справа от выделения
- [ ] Ластик «Выделить область»: hover на ✓ — эффект продавливания (тень сжимается)
- [ ] Ластик «Выделить область»: подтверждение стирает область (чёрный rect), отмена убирает рамку
- [ ] Переключение «Кисть» ↔ «Выделить область» работает стабильно (нет путаницы режимов)
- [ ] Шрифты кнопок — sans-serif, заголовки секций — monospace
- [ ] Подменю инструментов — оранжевая полоска слева + лёгкий фон
- [ ] Секция «НАЛОЖЕНИЕ» не обрезается снизу
- [ ] `npx tsc --noEmit` — без ошибок