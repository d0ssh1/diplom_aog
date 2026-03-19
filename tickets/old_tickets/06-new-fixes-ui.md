# Тикет 14: Визуальные фиксы панели + баг ластика + центрирование канваса

**Приоритет:** Высокий  
**Предыдущий тикет:** 13 (выполнен)  
**Скриншоты-референсы:** 8 изображений в чате

**Затрагиваемые файлы:**
- `frontend/src/components/Editor/WallEditorCanvas.tsx`
- `frontend/src/components/Editor/WallEditorCanvas.module.css`
- `frontend/src/components/Editor/ToolPanelV2.module.css`
- `frontend/src/components/Wizard/StepWallEditor.tsx`
- `frontend/src/components/Wizard/StepWallEditor.module.css`
- `frontend/src/components/Wizard/WizardShell.tsx` (footer с кнопкой «Назад»)
- `frontend/src/components/Wizard/StepIndicator.tsx` (кружки прогресса)
- `frontend/src/components/Upload/MetadataForm.tsx`

---

## 1. Заголовки секций — неверный шрифт и слишком блеклые

**Текущее состояние (скриншот 1):** заголовки `// РЕДАКТОР СТЕН`, `// РАЗМЕТКА` и т.д. — тусклые, мелкие, недостаточно выразительные.

**Целевое состояние (скриншот 2):** заголовки заметнее, шрифт жирнее, чуть крупнее.

**Файл:** `ToolPanelV2.module.css`, класс `.sectionTitle`

**Изменения:**
```css
.sectionTitle {
  font-family: 'Courier New', 'Consolas', monospace;
  font-size: 12px;        /* было 11px */
  font-weight: 700;       /* было 400 — сделать жирным */
  color: #666;            /* было #555 — чуть светлее */
  text-transform: uppercase;
  letter-spacing: 2px;    /* было 3px — плотнее */
  padding: 12px 16px 8px;
  margin: 0;
}
```

---

## 2. Цвет иконки при выборе инструмента — должен быть ЧЁРНЫМ

**Текущее состояние (скриншот 1):** иконка внутри оранжевого квадрата — белая.

**Целевое состояние (скриншот 2):** иконка — **чёрная** на оранжевом фоне.

**Файл:** `ToolPanelV2.module.css`

**Текущий CSS:**
```css
.toolBtnActive .toolIcon {
  background: #FF5722;
  color: #ffffff;  /* ← белый */
}
```

**Исправление:**
```css
.toolBtnActive .toolIcon {
  background: #FF4500;
  color: #000000;  /* ← ЧЁРНЫЙ */
}
```

---

## 3. Квадратик «□» в «Выделить область» — слишком мелкий

**Текущее состояние (скриншот 1):** символ `□` перед текстом «Выделить область» отображается очень маленьким — едва заметен. Аналогично `○` у «Кисть».

**Целевое состояние (скриншот 2):** символы `◉`/`○` и `■`/`□` имеют нормальный размер, визуально ~16–18px.

**Файл:** `StepWallEditor.tsx` + `StepWallEditor.module.css`

**Решение — обернуть символы в span с фиксированным размером:**

В JSX:
```tsx
<button className={...} onClick={() => setEraserMode('brush')}>
  <span className={styles.radioMark}>
    {eraserMode === 'brush' ? '◉' : '○'}
  </span>
  Кисть
</button>

<button className={...} onClick={() => setEraserMode('select')}>
  <span className={styles.radioMark}>
    {eraserMode === 'select' ? '■' : '□'}
  </span>
  Выделить область
</button>
```

CSS:
```css
.radioMark {
  font-size: 18px;
  line-height: 1;
  width: 20px;
  display: inline-block;
  text-align: center;
  flex-shrink: 0;
}
```

---

## 4. КРИТИЧНО: Ластик «Выделить область» — нельзя использовать дважды подряд

**Проблема:** после первого успешного удаления области (нажатие ✓), повторная попытка выделить и удалить новую область не работает. Нужно переключиться на другой инструмент (например, «Кисть») и обратно — только тогда выделение снова заработает.

**Корневая причина:**

После подтверждения удаления кнопки (HTML или Fabric-объекты) удаляются, но обработчики `mouse:down`/`mouse:move`/`mouse:up` на canvas НЕ переподключаются. Внутренние переменные замыкания (например, состояние `isDrawing`, `selRect`, ссылки на кнопки) остаются в «грязном» состоянии после первого цикла. Новый `mouseDown` либо блокируется guard-условием, либо ссылается на устаревшие объекты.

**Решение:**

После каждого подтверждения или отмены — **сбрасывать состояние и переподключать обработчики** вызовом `attachToolHandlers()`:

```typescript
// В handleConfirmErase (или внутри onMouseDown кнопки подтверждения):
const handleConfirmErase = () => {
  // ... логика удаления (добавить чёрный rect, убрать selRect) ...
  
  // Сбрасываем React state (если кнопки HTML):
  setEraseSelection(null);
  
  // Переподключаем обработчики для чистого повторного использования:
  attachToolHandlers();
};

// Аналогично в handleCancelErase:
const handleCancelErase = () => {
  // ... убрать selRect с канваса ...
  setEraseSelection(null);
  attachToolHandlers();
};
```

Если кнопки подтверждения/отмены реализованы как React state + HTML (из тикета 13, пункт A5), то нужно убедиться что:
1. `setEraseSelection(null)` вызывается в обоих обработчиках
2. `attachToolHandlers()` переподключается после сброса
3. Guard-условие в `onMouseDown` проверяет React state, а не замкнутые переменные

Альтернативный подход без `attachToolHandlers()` — вынести флаг «ожидание подтверждения» в `useRef` и проверять его:

```typescript
const pendingEraseRef = useRef(false);

// В onMouseDown:
if (pendingEraseRef.current) return; // Ждём подтверждения/отмены

// В onMouseUp (после создания selRect):
pendingEraseRef.current = true;

// В handleConfirmErase / handleCancelErase:
pendingEraseRef.current = false;
```

---

## 5. Кнопка «Назад» — неверный шрифт

**Текущее состояние (скриншот 3):** шрифт serif-подобный или monospace с засечками, выглядит грубо.

**Целевое состояние (скриншот 4):** чистый sans-serif, жирный, компактный.

**Файл:** `WizardShell.tsx` (или компонент, где рендерится footer wizard'а)

**Изменение:**
```css
/* Кнопка «Назад» */
font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
font-weight: 700;
font-size: 14px;
letter-spacing: 0;
```

Если сейчас используется `font-mono` / `'Courier New'` — заменить на sans-serif. Проверить также кнопку `> ПОСТРОИТЬ` — она тоже должна использовать sans-serif bold.

---

## 6. Убрать поле «Крыло» из формы метаданных загрузки

**Текущее состояние (скриншот 5):** на шаге 1 (Загрузка) форма метаданных содержит поля: Здание, Этаж, Крыло.

**Целевое состояние:** поле «Крыло» убрано. Остаётся:
- **Здание** — на всю ширину
- **Этаж** — на всю ширину

**Файл:** `MetadataForm.tsx`

**Действие:** удалить JSX-блок с input для «Крыло» и при необходимости убрать из типов/state.

---

## 7. Кружки прогресса — неверный стиль

**Текущее состояние (скриншоты 6, 7):** кружки одинакового размера, неправильные цвета (не соответствуют дизайну).

**Целевое состояние:**
- **Пройденные шаги** — оранжевые (`#FF4500`)
- **Текущий шаг** — белый со свечением (`box-shadow: 0 0 8px #fff`)
- **Будущие шаги** — тёмно-серые (`#3f3f46` / `zinc-700`)

**Файл:** `StepIndicator.tsx` (или где рендерятся кружки в header wizard'а)

**Код:**
```tsx
<div style={{ display: 'flex', gap: '16px' }}>
  {Array.from({ length: totalSteps }).map((_, i) => {
    const stepIndex = i + 1; // шаги считаются с 1 в useWizard
    let className = '';
    
    if (stepIndex < currentStep) {
      // Пройденные — оранжевые
      className = 'bg-[#FF4500]';
    } else if (stepIndex === currentStep) {
      // Текущий — белый со свечением
      className = 'bg-white shadow-[0_0_8px_#fff]';
    } else {
      // Будущие — тёмно-серые
      className = 'bg-zinc-700';
    }
    
    return (
      <div
        key={i}
        className={`w-3 h-3 rounded-full ${className}`}
      />
    );
  })}
</div>
```

**Примечание:** в `useWizard.ts` шаги считаются с 1 (`step: 1`). Нужно проверить, как `currentStep` передаётся в `StepIndicator` — если как `state.step` (1-based), то сравнение `stepIndex < currentStep` / `=== currentStep` корректно. Если передаётся 0-based — подстроить.

---

## 8. Канвас — маска не по центру + нет фоновой сетки

**Текущее состояние:**
- Полное изображение — прижимается к верхнему левому углу, справа чёрная область (скриншот 6)
- Кадрированное — прижимается вверх, внизу чёрная полоса (скриншот 7)
- Фон — сплошной чёрный

**Целевое состояние (скриншот 8 — шаг кадрирования как референс):**
- Маска отцентрирована на канвасе
- Фон — тёмно-серая полупрозрачная сетка (как на шаге кадрирования)

### 8a. Центрирование маски

**Файл:** `WallEditorCanvas.tsx`, в `fabric.Image.fromURL` callback (строки 106–126)

**Текущий код:**
```typescript
img.set({ scaleX: scale, scaleY: scale, originX: 'left', originY: 'top' });
// ...
setBgDims({ left: 0, top: 0, width: ..., height: ... });
```

**Исправление — вычислить offset для центрирования:**
```typescript
const scaledW = (img.width ?? 0) * scale;
const scaledH = (img.height ?? 0) * scale;
const offsetX = (c.getWidth() - scaledW) / 2;
const offsetY = (c.getHeight() - scaledH) / 2;

img.set({
  scaleX: scale,
  scaleY: scale,
  originX: 'left',
  originY: 'top',
  left: offsetX,
  top: offsetY,
});

c.setBackgroundImage(img, () => {
  c.renderAll();
  setBgDims({
    left: offsetX,
    top: offsetY,
    width: scaledW,
    height: scaledH,
  });
});
```

### 8b. Фоновая сетка вместо чёрного фона

**Два изменения:**

1. **Fabric.js canvas — прозрачный фон:**

```typescript
const canvas = new fabric.Canvas(canvasElRef.current, {
  selection: false,
  width,
  height,
  backgroundColor: 'transparent',  // ← Добавить
});
```

2. **CSS-сетка за canvas-элементом:**

В `StepWallEditor.module.css` (стиль `.gridBg` или `.canvasArea`):
```css
.gridBg {
  position: absolute;
  inset: 0;
  background-color: #1a1a1a;
  background-image:
    linear-gradient(rgba(255, 255, 255, 0.04) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255, 255, 255, 0.04) 1px, transparent 1px);
  background-size: 40px 40px;
  z-index: 0;
}
```

### 8c. Экспорт маски — сохранить чёрный фон

Прозрачный `backgroundColor` сломает экспорт (при `getBlob()` пустые области станут прозрачными, а не чёрными). Нужно временно переключать фон:

```typescript
getBlob: () => new Promise<Blob>((resolve) => {
  const canvas = fabricRef.current;
  if (!canvas) { resolve(new Blob()); return; }
  
  // Временно ставим чёрный фон для корректного экспорта
  const origBg = canvas.backgroundColor;
  canvas.backgroundColor = 'black';
  
  // Скрываем аннотации
  const annotations = canvas.getObjects()
    .filter((o) => (o as any).data?.type === 'annotation');
  annotations.forEach((o) => { o.visible = false; });
  canvas.renderAll();
  
  const dataUrl = canvas.toDataURL({ format: 'png' });
  
  // Восстанавливаем
  annotations.forEach((o) => { o.visible = true; });
  canvas.backgroundColor = origBg;
  canvas.renderAll();
  
  fetch(dataUrl).then((r) => r.blob()).then(resolve);
}),
```

---

## Порядок реализации

1. **Пункт 4** — Баг повторного использования ластика (КРИТИЧНО, блокирует работу)
2. **Пункт 8** — Центрирование маски + сетка фона (визуально заметный баг)
3. **Пункты 1, 2, 3** — Быстрые CSS-фиксы панели (шрифт заголовков, цвет иконки, размер символов)
4. **Пункт 5** — Шрифт кнопки «Назад»
5. **Пункт 6** — Убрать «Крыло»
6. **Пункт 7** — Кружки прогресса

---

## Чеклист после реализации

- [ ] Ластик «Выделить область»: можно удалить несколько областей подряд без переключения инструмента
- [ ] Маска отцентрирована на канвасе (нет чёрных полос с одной стороны)
- [ ] Фон канваса — тёмная сетка (не сплошной чёрный)
- [ ] Экспорт маски (`getBlob`) — фон чёрный (не прозрачный)
- [ ] Заголовки секций — жирные, `#666`, 12px
- [ ] Иконка выбранного инструмента — ЧЁРНАЯ на оранжевом фоне
- [ ] Символы ○/□ в подменю ластика — нормального размера (18px)
- [ ] Кнопка «Назад» — sans-serif bold
- [ ] MetadataForm — нет поля «Крыло»
- [ ] Кружки прогресса: пройденные оранжевые, текущий белый со свечением, будущие серые
- [ ] `npx tsc --noEmit` — без ошибок