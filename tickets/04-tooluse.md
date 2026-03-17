# Тикет: Wizard Steps 2-3 — Препроцессинг + Редактор стен

## Обзор

Wizard теперь 6 шагов (было 5):
1. Загрузка файлов
2. **Препроцессинг** (кадрирование + поворот) ← этот тикет
3. **Редактор стен** (стены, ластик, разметка объектов) ← этот тикет
4. Построение 3D
5. Просмотр 3D
6. Сохранение

Backend API: `calculateMask` вызывается при переходе с шага 2 на шаг 3.
На шаге 2 работаем с СЫРОЙ фотографией. На шаге 3 — с РЕЗУЛЬТАТОМ векторизации (маской).

---

## Шаг 2: Препроцессинг

### Назначение
Пользователь подготавливает фотографию плана перед автоматической векторизацией:
обрезает лишнее (легенду, мини-план, рамки), поворачивает если план вертикальный.

### Layout

```
┌──────────────────────────────────────────────────────────────┐
│  ● ●(оранж) ● ● ● ●                                    ×   │  ← Header + 6 step indicators
├──────────────────────────────────────────┬───────────────────┤
│                                          │                   │
│                                          │ // ПРЕПРОЦЕССИНГ  │
│                                          │                   │
│       Фотография плана эвакуации         │ ┌───────────────┐ │
│       (object-fit: contain)              │ │ ⬚ Кадриров.  │ │  ← активная, оранж рамка
│                                          │ └───────────────┘ │
│       Если активно кадрирование:         │ ┌───────────────┐ │
│       поверх — оранжевая пунктирная      │ │ ↻ Повернуть   │ │
│       рамка с drag-ручками по углам      │ └───────────────┘ │
│                                          │                   │
│       ~75% ширины                        │   ~25% ширины     │
│                                          │   (~300px)        │
│                                          │                   │
├──────────────────────────────────────────┴───────────────────┤
│  [Назад]                                        [> Далее]    │
└──────────────────────────────────────────────────────────────┘
```

### Правая панель: инструменты

Фон: `#1a1a1a` (тёмный, почти чёрный). Текст: белый.

**Секция "// ПРЕПРОЦЕССИНГ"** (заголовок: uppercase, letter-spacing 2px, серый #9E9E9E, 12px)

Кнопки — горизонтальные прямоугольники (как на скриншоте Gemini):

```
┌─────────────────────────┐
│  [icon]  Кадрирование   │   ← если активна: оранжевая рамка (#FF5722), оранж текст
└─────────────────────────┘
┌─────────────────────────┐
│  [icon]  Повернуть 90°  │   ← серый фон, белый текст
└─────────────────────────┘
```

Стиль кнопки:
```css
.toolButton {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 16px 20px;
  background: #2a2a2a;
  border: 2px solid transparent;
  border-radius: 8px;
  color: #ffffff;
  font-size: 15px;
  cursor: pointer;
  transition: all 0.15s;
}
.toolButton:hover {
  background: #333333;
}
.toolButtonActive {
  border-color: #FF5722;
  color: #FF5722;
}
.toolButtonIcon {
  width: 32px;
  height: 32px;
  background: #FF5722;  /* оранж для активного */
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
}
```

### Инструмент: Кадрирование

**Поведение:**
1. При активации — поверх изображения появляется пунктирная оранжевая рамка
2. Рамка по умолчанию = 90% от изображения (с отступом по краям)
3. 4 угловых маркера (оранжевые квадраты 12×12px) — drag для изменения размера
4. Drag за внутреннюю область рамки — перемещение рамки
5. Область за рамкой — затемнение (overlay rgba(0,0,0,0.5))
6. Результат кадрирования сохраняется в `wizardState.cropRect` = `{x, y, width, height}` в нормализованных координатах [0,1]

**Реализация:**
```typescript
// Canvas overlay поверх <img>
// Использовать HTML Canvas или абсолютно позиционированные div'ы
// НЕ Fabric.js для кадрирования — слишком тяжело для простой рамки

interface CropRect {
  x: number;      // 0-1, левый край
  y: number;      // 0-1, верхний край
  width: number;  // 0-1
  height: number; // 0-1
}
```

### Инструмент: Поворот

**Поведение:**
1. Клик → изображение поворачивается на 90° по часовой стрелке
2. Применяется через CSS `transform: rotate(${rotation}deg)` для превью
3. Значение `rotation` (0/90/180/270) сохраняется в `wizardState.rotation`
4. **Автоповорот при загрузке:** если `naturalHeight > naturalWidth` → автоматически поставить `rotation = 90` и показать уведомление "Изображение автоматически повёрнуто"

### Переход "Далее" (Шаг 2 → Шаг 3)

При нажатии "Далее":
1. Вызвать `reconstructionApi.calculateMask(planFileId, cropRect, rotation)`
2. Показать спиннер/прогресс "Векторизация..."
3. Backend возвращает `maskFileId`
4. Загрузить маску по URL: `/api/v1/uploads/masks/{maskFileId}.png`
5. Перейти на шаг 3 с маской

---

## Шаг 3: Редактор стен

### Назначение
Пользователь корректирует результат автоматической векторизации:
дорисовывает пропущенные стены, стирает артефакты, размечает типы помещений.

### Layout

```
┌──────────────────────────────────────────────────────────────┐
│  ● ● ●(оранж) ● ● ●                                    ×   │
├──────────────────────────────────────────┬───────────────────┤
│                                          │ // РЕДАКТОР СТЕН  │
│                                          │ ┌───────────────┐ │
│                                          │ │ ╱ Стена       │ │
│     Векторизованное изображение          │ └───────────────┘ │
│     (маска: белые стены на               │ ┌───────────────┐ │
│      светлом/сером фоне)                 │ │ ◇ Ластик      │ │
│                                          │ └───────────────┘ │
│     Рисование стен поверх маски:         │                   │
│     белые линии заданной толщины         │ // ТОЛЩИНА ЛИНИИ  │
│                                          │ ●━━━━━━━━━  6 px  │
│     Fabric.js canvas                     │                   │
│                                          │ // РАЗМЕТКА       │
│     ~75% ширины                          │ ┌───────────────┐ │
│                                          │ │ □ Кабинет     │ │
│                                          │ └───────────────┘ │
│                                          │ ┌───────────────┐ │
│                                          │ │ ⬒ Лестница    │ │
│                                          │ └───────────────┘ │
│                                          │ ┌───────────────┐ │
│                                          │ │ ▣ Лифт        │ │
│                                          │ └───────────────┘ │
│                                          │ ┌───────────────┐ │
│                                          │ │ ⊡ Коридор     │ │
│                                          │ └───────────────┘ │
│                                          │ ┌───────────────┐ │
│                                          │ │ ▯ Дверь       │ │
│                                          │ └───────────────┘ │
├──────────────────────────────────────────┴───────────────────┤
│  [Назад]                                        [> Далее]    │
└──────────────────────────────────────────────────────────────┘
```

### Правая панель: инструменты

Тот же стиль что на шаге 2.

**Секция "// РЕДАКТОР СТЕН"**

| Кнопка | Иконка (lucide-react) | Описание |
|--------|-----------------------|----------|
| Стена | `Pencil` или `Minus` | Рисовать прямые стены |
| Ластик | `Eraser` | Стирать артефакты |

**Секция "// ТОЛЩИНА ЛИНИИ"**

Слайдер (min: 1, max: 30, default: 6). Стиль:
- Track: оранжевая полоса (#FF5722) до ползунка, серая после
- Thumb: серый прямоугольник 16×20px
- Значение "6 px" справа от слайдера

**Секция "// РАЗМЕТКА"**

| Кнопка | Иконка (lucide-react) | Действие |
|--------|-----------------------|----------|
| Кабинет | `Square` | Выделить прямоугольник → ввести номер |
| Лестница | `ArrowUpDown` | Выделить область → тип "staircase" |
| Лифт | `ArrowUp` | Выделить область → тип "elevator" |
| Коридор | `StretchHorizontal` | Выделить область → тип "corridor" |
| Дверь | `DoorOpen` или `Minus` | Нарисовать линию между комнатами |

### Инструмент: Стена (ВАЖНО — не кисть!)

**Поведение:**
1. Курсор меняется на crosshair
2. Первый клик — начальная точка (оранжевая точка-маркер)
3. Движение мыши — превью линии от начальной точки до курсора (оранжевая пунктирная)
4. Второй клик — конечная точка
5. Между точками рисуется ПРЯМАЯ БЕЛАЯ линия заданной толщины на canvas маски
6. Линия добавляется как объект `fabric.Line` с `strokeWidth` из слайдера, `stroke: 'white'`
7. Shift+клик — привязка к горизонтали/вертикали (snap 0° / 90°)

**Реализация в Fabric.js:**
```typescript
// При первом клике:
const startPoint = { x: e.pointer.x, y: e.pointer.y };

// При движении мыши — превью:
const previewLine = new fabric.Line(
  [startPoint.x, startPoint.y, pointer.x, pointer.y],
  { stroke: '#FF5722', strokeWidth: 2, strokeDashArray: [5, 5], selectable: false }
);

// При втором клике — финальная линия:
const wallLine = new fabric.Line(
  [startPoint.x, startPoint.y, endPoint.x, endPoint.y],
  { stroke: 'white', strokeWidth: brushSize, selectable: false }
);
canvas.add(wallLine);
```

### Инструмент: Ластик

**Поведение:**
1. Курсор — круг размером = толщина (визуальный preview)
2. Клик + drag — стирает пиксели (рисует чёрным/прозрачным)
3. Размер настраивается слайдером "Толщина линии"

**Реализация:**
```typescript
// Fabric.js free drawing mode с чёрным цветом
canvas.isDrawingMode = true;
canvas.freeDrawingBrush.color = 'black'; // стирает белые стены
canvas.freeDrawingBrush.width = brushSize;
```

### Инструмент: Кабинет

**Поведение:**
1. Курсор — crosshair
2. Клик + drag — рисует прямоугольник выделения (оранжевая пунктирная рамка)
3. При отпускании — popup/inline форма: поле ввода "Номер кабинета" (например "1104")
4. После ввода:
   - На canvas рисуется полупрозрачный оранжевый прямоугольник с номером
   - Данные сохраняются в массив `rooms`: `{ polygon, name, room_type: 'room' }`
5. Прямоугольник можно выделить и удалить (Delete/Backspace)

**Визуал на canvas:**
```typescript
const rect = new fabric.Rect({
  left: x, top: y, width: w, height: h,
  fill: 'rgba(255, 87, 34, 0.15)',   // полупрозрачный оранжевый
  stroke: '#FF5722',
  strokeWidth: 2,
  strokeDashArray: [4, 4],
  selectable: true,
});
const label = new fabric.Text(roomNumber, {
  left: x + 8, top: y + 4,
  fontSize: 14, fill: '#FF5722', fontWeight: 'bold',
});
const group = new fabric.Group([rect, label], { selectable: true });
canvas.add(group);
```

### Инструменты: Лестница / Лифт / Коридор

Аналогично "Кабинет", но:
- Без ввода номера (просто выделить область)
- Разные цвета заливки:
  - Лестница: `rgba(244, 67, 54, 0.15)` красный
  - Лифт: `rgba(244, 67, 54, 0.15)` красный
  - Коридор: `rgba(33, 150, 243, 0.15)` синий
- `room_type`: 'staircase' / 'elevator' / 'corridor'

### Инструмент: Дверь

**Поведение:**
1. Аналогично стене: клик-клик (две точки → прямая линия)
2. Но линия рисуется ЦВЕТНАЯ (зелёная/красная), не белая
3. Толщина фиксирована (~3px)
4. Данные сохраняются в массив `doors`: `{ position, width }`

**Визуал:**
```typescript
const doorLine = new fabric.Line(
  [x1, y1, x2, y2],
  { stroke: '#4CAF50', strokeWidth: 3, selectable: true }
);
```

### Переход "Далее" (Шаг 3 → Шаг 4)

При нажатии "Далее":
1. Экспортировать canvas как PNG (маска с дорисованными стенами)
2. Загрузить на backend: `uploadApi.uploadUserMask(editedMaskBlob)`
3. Собрать данные разметки: `rooms[]`, `doors[]` из canvas объектов
4. Передать в шаг 4 для построения 3D

---

## Файлы

### Новые
- `frontend/src/components/Wizard/StepPreprocess.tsx` — шаг 2
- `frontend/src/components/Wizard/StepPreprocess.module.css`
- `frontend/src/components/Wizard/StepWallEditor.tsx` — шаг 3
- `frontend/src/components/Wizard/StepWallEditor.module.css`
- `frontend/src/components/Editor/CropOverlay.tsx` — кадрирование (div-based, не Fabric.js)
- `frontend/src/components/Editor/CropOverlay.module.css`
- `frontend/src/components/Editor/WallEditorCanvas.tsx` — Fabric.js canvas с инструментами
- `frontend/src/components/Editor/ToolPanelV2.tsx` — обновлённая правая панель
- `frontend/src/components/Editor/ToolPanelV2.module.css`
- `frontend/src/components/Editor/RoomPopup.tsx` — popup для ввода номера кабинета
- `frontend/src/components/Editor/RoomPopup.module.css`

### Изменяемые
- `frontend/src/hooks/useWizard.ts` — добавить шаг 6, обновить totalSteps
- `frontend/src/pages/WizardPage.tsx` — добавить рендер StepPreprocess и StepWallEditor
- `frontend/src/components/Wizard/StepIndicator.tsx` — поддержка 6 шагов

### Удаляемые
- `frontend/src/components/Wizard/StepEditMask.tsx` — заменён на StepPreprocess + StepWallEditor
- `frontend/src/components/Editor/ToolPanel.tsx` — заменён на ToolPanelV2

---

## Порядок реализации

### Phase A: Шаг 2 — Препроцессинг
1. CropOverlay.tsx (кадрирование — div'ы с drag)
2. ToolPanelV2.tsx (новый стиль кнопок — горизонтальные)
3. StepPreprocess.tsx (собрать: img + CropOverlay + ToolPanelV2)
4. Обновить useWizard (6 шагов, rotation, cropRect)
5. Обновить WizardPage (рендер шага 2)

### Phase B: Шаг 3 — Редактор стен
6. WallEditorCanvas.tsx (Fabric.js canvas с инструментами стена/ластик)
7. RoomPopup.tsx (popup для ввода номера)
8. StepWallEditor.tsx (собрать: WallEditorCanvas + ToolPanelV2 с секцией разметки)
9. Обновить WizardPage (рендер шага 3)

### Verification после каждой phase
- `npx tsc --noEmit` — 0 ошибок
- Визуально проверить каждый инструмент
- Кадрирование: drag углов, перемещение рамки
- Стена: клик-клик → прямая белая линия
- Ластик: стирание свободной кистью
- Кабинет: drag прямоугольник → ввод номера → метка на canvas

---

## Что НЕ реализовывать

- Авто-кадрирование (пока нет надёжного backend endpoint)
- Авто-определение типов помещений (будет в floor-editor)
- Undo/redo (можно добавить позже)
- Multi-select объектов на canvas