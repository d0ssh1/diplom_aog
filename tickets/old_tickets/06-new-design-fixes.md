# Тикет: UI улучшения — ластик, загрузка, панель инструментов

## Fix 1: Два режима ластика

**Файл:** `frontend/src/components/Editor/WallEditorCanvas.tsx`, `StepWallEditor.tsx`

При выборе инструмента "Стереть" под кнопкой появляются два подрежима:

```
┌─────────────────────────┐
│  ◇  Стереть             │  ← основная кнопка (active = оранж рамка)
├─────────────────────────┤
│  ○ Кисть                │  ← подрежим 1 (по умолчанию)
│  ▭ Выделить область     │  ← подрежим 2
└─────────────────────────┘
```

### Подрежим 1: Кисть (текущее поведение)
Без изменений — свободное рисование чёрным, размер из слайдера "Толщина линии".

### Подрежим 2: Выделить область и удалить
1. Курсор — crosshair
2. Клик + drag → рисуется прямоугольник выделения (оранжевая пунктирная рамка)
3. При отпускании — выделение "замораживается" (остаётся на canvas):
   - Полупрозрачная красная заливка rgba(255,0,0,0.2) показывает что будет удалено
   - Рядом с выделением (справа-сверху) появляются две маленькие кнопки:
     - ✓ (галочка, зелёная) — подтвердить удаление
     - ✕ (крестик, серый) — отменить выделение
4. По клику ✓: закрасить область чёрным (стереть стены внутри)
5. По клику ✕: убрать выделение

**Реализация в Fabric.js:**
```typescript
// При mouse:up — создать группу (rect + кнопки)
const selRect = new fabric.Rect({
  left: x, top: y, width: w, height: h,
  fill: 'rgba(255,0,0,0.2)',
  stroke: '#FF5722',
  strokeWidth: 1,
  strokeDashArray: [4, 4],
  selectable: false, evented: false,
});

// Кнопка подтверждения (✓)
const confirmBtn = new fabric.Circle({
  radius: 12, fill: '#4CAF50',
  left: x + w + 4, top: y - 4,
  selectable: false, evented: true,
});

// Кнопка отмены (✕) 
const cancelBtn = new fabric.Circle({
  radius: 12, fill: '#666',
  left: x + w + 4, top: y + 24,
  selectable: false, evented: true,
});

// По клику confirm: закрасить область чёрным
confirmBtn.on('mousedown', () => {
  const eraseRect = new fabric.Rect({
    left: x, top: y, width: w, height: h,
    fill: 'black', selectable: false, evented: false,
  });
  canvas.add(eraseRect);
  canvas.remove(selRect, confirmBtn, cancelBtn);
  canvas.renderAll();
});

// По клику cancel: просто убрать
cancelBtn.on('mousedown', () => {
  canvas.remove(selRect, confirmBtn, cancelBtn);
  canvas.renderAll();
});
```

**UI подрежимов в ToolPanel:**
```tsx
// В StepWallEditor: локальный state
const [eraserMode, setEraserMode] = useState<'brush' | 'select'>('brush');

// Подрежимы видны ТОЛЬКО когда activeTool === 'eraser'
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
      ▭ Выделить область
    </button>
  </div>
)}
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
  background: #1a1a1a;
  border: 1px solid #333;
  color: #aaa;
  padding: 8px 12px;
  border-radius: 6px;
  font-size: 13px;
  cursor: pointer;
  text-align: left;
}
.subToolActive {
  border-color: #FF5722;
  color: #FF5722;
}
```

---

## Fix 2: Дизайн загрузки — по референсу Gemini

**Файлы:** `StepUpload.tsx`, `StepUpload.module.css`, `FileCard.tsx`, `MetadataForm.tsx`

**Скриншоты 1-2:** Текущий дизайн (бледный) → новый (как Gemini, скриншоты 4-5).

### Изменения в правой панели (после загрузки файла):

Текущий (скриншот 3): серый фон, мелкое превью, поля Здание/Этаж/Крыло/Блок друг под другом.

Новый (скриншоты 4-5):
```
┌──────────────────────────────────┐
│  ┌────────────────────┐     [×]  │  ← оранжевый × справа сверху
│  │                    │          │
│  │    ПРЕВЬЮ          │          │  ← большое превью, тень, белый фон карточки
│  │    (план)          │          │
│  │                    │          │
│  └────────────────────┘          │
│  plan_level_11.jpg    Готово     │  ← имя файла + зелёная надпись "Готово"
│                                  │
│  ЗДАНИЕ                          │  ← uppercase, серый, маленький
│  > Главный корпус                │  ← placeholder оранжевый, underline input
│                                  │
│  ЭТАЖ          КРЫЛО             │  ← два поля В ОДНУ строку
│  > 11          > А               │
│                                  │
│  ─────────────────────────────── │
│  Загружено: 1 изображений        │  ← тёмный footer с счётчиком
│  Назад              > ДАЛЕЕ      │
└──────────────────────────────────┘
```

Ключевые отличия:
1. **Превью как карточка** — белый фон, тень (box-shadow), скруглённые углы
2. **Имя файла + "Готово"** — в одну строку, "Готово" зелёным
3. **ЭТАЖ и КРЫЛО в одну строку** (display: grid, grid-template-columns: 1fr 1fr)
4. **Убрать поле "Блок"** — не нужно
5. **Лейблы uppercase** — `text-transform: uppercase; color: #666; font-size: 12px; letter-spacing: 1px`
6. **Placeholder с ">** — `> Главный корпус` серым
7. **Инпуты underline** — только нижняя граница, без рамки
8. **Автоповорот превью** — если изображение вертикальное, повернуть на 90° (как на шаге 2)

**CSS карточки превью:**
```css
.previewCard {
  background: #ffffff;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
  padding: 16px;
  margin: 0 20px;
  position: relative;
}
.previewImage {
  width: 100%;
  aspect-ratio: 16/10;
  object-fit: contain;
  background: #f5f5f5;
  border-radius: 4px;
}
.previewFooter {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 8px;
  font-size: 14px;
}
.fileName {
  color: #333;
  font-family: monospace;
}
.statusReady {
  color: #4CAF50;
  font-weight: 600;
}
.removeBtn {
  position: absolute;
  top: -8px;
  right: -8px;
  width: 28px;
  height: 28px;
  background: #FF5722;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
}
```

**CSS метаданных (Gemini стиль):**
```css
.metaSection {
  padding: 16px 20px;
}
.metaLabel {
  text-transform: uppercase;
  color: #888;
  font-size: 11px;
  letter-spacing: 1px;
  margin-bottom: 4px;
  font-weight: 600;
}
.metaInput {
  width: 100%;
  border: none;
  border-bottom: 1px solid #ddd;
  padding: 8px 0;
  font-size: 15px;
  color: #333;
  background: transparent;
  outline: none;
}
.metaInput::placeholder {
  color: #bbb;
}
.metaInput:focus {
  border-bottom-color: #FF5722;
}
.metaRow {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}
.uploadCounter {
  background: #333;
  color: #fff;
  padding: 12px 20px;
  font-family: monospace;
  font-size: 14px;
}
```

---

## Fix 3: Панель инструментов — группировка ползунков

**Файл:** `StepWallEditor.tsx`, `StepWallEditor.module.css`

Скриншот 6 (текущий): три отдельные секции — "Толщина линии", "Настройка", "Наложение".
Скриншот 7 (нужно): объединить толщину/чувствительность/контраст в одну секцию "// ПАРАМЕТРЫ".

```
// ПАРАМЕТРЫ
  Толщина линии
  ■━━━━━━━━━━━━━━━━━ 6 px

  Чувствительность  
  ■━━━━━━━━━━━━━━━━━ 15

  Контраст
  ■━━━━━━━━━━━━━━━━━ 10

// НАЛОЖЕНИЕ
  Показать оригинал  [■]     ← квадратный toggle, не круглый
  Прозрачность
  ■━━━━━━━━━━━━━━━━━ 40 %
```

Изменения:
1. **Объединить** "// ТОЛЩИНА ЛИНИИ" + "// НАСТРОЙКА" → одна секция "// ПАРАМЕТРЫ"
2. **Все ползунки одинаковые** — белый track, серый thumb (прямоугольный), значение справа серым
3. **Toggle "Показать оригинал"** — КВАДРАТНЫЙ (не круглый), как на скриншоте 7:

```css
.squareToggle {
  width: 24px;
  height: 24px;
  background: #333;
  border: 2px solid #555;
  border-radius: 3px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}
.squareToggleActive {
  background: #FF5722;
  border-color: #FF5722;
}
```

4. **Слайдеры — единый стиль (белый track без оранжевого):**
```css
input[type="range"] {
  -webkit-appearance: none;
  width: 100%;
  height: 3px;
  background: #555;
  border-radius: 2px;
  outline: none;
}
input[type="range"]::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 14px;
  height: 18px;
  background: #ccc;
  border-radius: 2px;
  cursor: pointer;
}
```
БЕЗ оранжевой части — просто серый track и светлый thumb.

5. **Кнопка "Назад" + "> ПОСТРОИТЬ"** в footer внизу правой панели (как на скриншоте 7)

---

## Fix 4: Убрать отдельную страницу "Построить" — кнопка "> ПОСТРОИТЬ" на шаге 3

**Проблема:** Сейчас wizard 6 шагов: загрузка → препроцессинг → редактор стен → 
ОТДЕЛЬНАЯ СТРАНИЦА "Построить" → 3D просмотр → сохранение. Страница "Построить" 
лишняя — это просто одна кнопка на пустом фоне.

**Решение:** Кнопка "> ПОСТРОИТЬ" заменяет "> Далее" в footer на шаге 3.
При клике — сразу построение 3D и переход к просмотру.

Wizard становится 5 шагов:
1. Загрузка
2. Препроцессинг (кадрирование)
3. Редактор стен + кнопка "> ПОСТРОИТЬ"
4. Просмотр 3D
5. Сохранение

### Изменения:

**`frontend/src/pages/WizardPage.tsx`:**
1. Убрать `case 4: <StepBuild ...>` — этот шаг удаляется
2. Перенумеровать: старый case 5 (StepView3D) → case 4, старый case 6 (StepSave) → case 5
3. `totalSteps={6}` → `totalSteps={5}`
4. На шаге 3 кнопка "Далее" заменяется на "ПОСТРОИТЬ":
   ```tsx
   nextLabel={state.step === 3 ? '> ПОСТРОИТЬ' : '> Далее'}
   ```
5. `handleNext` для step 3:
   ```tsx
   if (state.step === 3 && canvasRef.current) {
     const blob = await canvasRef.current.getBlob();
     const { rooms, doors } = canvasRef.current.getAnnotations();
     await wizard.saveMaskAndAnnotations(blob, rooms, doors);
     await wizard.buildMesh();  // строит 3D и устанавливает meshUrl
     // buildMesh уже делает nextStep внутри (переход к шагу 4 = 3D просмотр)
   }
   ```

**`frontend/src/hooks/useWizard.ts`:**
1. `WizardStep`: `1 | 2 | 3 | 4 | 5` (было 6)
2. `nextStep`: clamp к 5 (было 6)
3. `buildMesh`: после успеха — `step: 4` (было 4, но теперь 4 = 3D просмотр)

**`frontend/src/types/wizard.ts`:**
1. `WizardStep = 1 | 2 | 3 | 4 | 5` (убрать 6)

**Удалить файлы:**
- `frontend/src/components/Wizard/StepBuild.tsx`
- `frontend/src/components/Wizard/StepBuild.module.css` (если есть)

**`frontend/src/components/Wizard/WizardShell.tsx`:**
Добавить prop `nextLabel` если его ещё нет:
```tsx
interface WizardShellProps {
  // ...существующие
  nextLabel?: string;  // default: '> Далее'
}
```

---

## Скриншоты-референсы

Все в `docs/design/fixes2/`:
- `upload-current.png` — загрузка текущая (бледная)
- `upload-target.png` — загрузка новый дизайн (с облаком)
- `upload-file-current.png` — после загрузки файла текущий
- `upload-file-target.png` — после загрузки Gemini карточка
- `upload-metadata-target.png` — метаданные Gemini стиль
- `panel-current.png` — панель ползунков текущая
- `panel-target.png` — панель ползунков целевая

## Порядок

1. Fix 4 — убрать StepBuild, кнопка "ПОСТРОИТЬ" на шаге 3 (структурное изменение — сначала)
2. Fix 3 — группировка ползунков + стили
3. Fix 2 — дизайн загрузки (StepUpload + MetadataForm)
4. Fix 1 — два режима ластика

После каждого — `npx tsc --noEmit` + визуальная проверка.