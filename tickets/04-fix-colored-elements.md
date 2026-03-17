# Тикет: Мелкие улучшения — цветовая очистка, курсор ластика, иконки

## Fix 1: Увеличить dilate и inpaint_radius для цветных элементов

**Файл:** `backend/app/processing/pipeline.py`

**Проблема:** Остатки зелёных стрелок и красных символов на границах — dilate и inpaint_radius слишком маленькие.

**Что изменить:**

В функции `remove_green_elements` (строка ~126):
```python
# БЫЛО:
kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3))
green_mask = cv2.dilate(green_mask, kernel, iterations=1)
result = cv2.inpaint(result, green_mask, inpaint_radius, cv2.INPAINT_TELEA)
# где inpaint_radius=3

# СТАЛО:
kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (5, 5))
green_mask = cv2.dilate(green_mask, kernel, iterations=2)
result = cv2.inpaint(result, green_mask, 7, cv2.INPAINT_TELEA)
```

В функции `remove_red_elements` (строка ~178) — аналогично:
```python
# БЫЛО:
kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3))
red_mask = cv2.dilate(red_mask, kernel, iterations=1)
result = cv2.inpaint(result, red_mask, inpaint_radius, cv2.INPAINT_TELEA)

# СТАЛО:
kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (5, 5))
red_mask = cv2.dilate(red_mask, kernel, iterations=2)
result = cv2.inpaint(result, red_mask, 7, cv2.INPAINT_TELEA)
```

**Почему безопасно:** Работает ДО бинаризации, на цветном изображении. Удаляет только пиксели с высокой насыщенностью (цветные). Серые/чёрные стены имеют низкую насыщенность — не затрагиваются.

**НЕ менять:** HSV диапазоны (hue_low, hue_high, sat_min, val_min) — оставить оригинальные.

---

## Fix 2: Курсор ластика — кружок по размеру кисти

**Файл:** `frontend/src/components/Editor/WallEditorCanvas.tsx`

**Проблема:** При выборе ластика курсор обычный — не видно какую область сотрёшь.

**Что сделать:** При активном ластике показывать оранжевый пунктирный кружок размером с кисть, который следует за курсором мыши.

В `useEffect` при `tool === 'eraser'`, после настройки `freeDrawingBrush`, добавить кастомный курсор:

```typescript
if (tool === 'eraser') {
  canvas.isDrawingMode = true;
  canvas.freeDrawingBrush = new fabric.PencilBrush(canvas);
  canvas.freeDrawingBrush.color = 'black';
  canvas.freeDrawingBrush.width = brushSizeRef.current;

  // Кастомный курсор — оранжевый пунктирный кружок
  const size = brushSizeRef.current;
  const cursorCanvas = document.createElement('canvas');
  cursorCanvas.width = size + 4;
  cursorCanvas.height = size + 4;
  const ctx = cursorCanvas.getContext('2d');
  if (ctx) {
    ctx.strokeStyle = '#FF5722';
    ctx.lineWidth = 2;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.arc(
      (size + 4) / 2,
      (size + 4) / 2,
      size / 2,
      0,
      Math.PI * 2,
    );
    ctx.stroke();
  }
  const cursorUrl = cursorCanvas.toDataURL();
  const offset = Math.round((size + 4) / 2);
  canvas.freeDrawingCursor = `url(${cursorUrl}) ${offset} ${offset}, crosshair`;
  return;
}
```

Кружок будет:
- Оранжевый (#FF5722)
- Пунктирный (dashed)
- Размер = текущий brushSize
- Центрирован на точку курсора

При смене brushSize курсор пересоздаётся (attachToolHandlers уже вызывается при изменении brushSize).

---

## Fix 3: Иконка не видна при активной кнопке

**Файл:** `frontend/src/components/Editor/ToolPanelV2.tsx` (или `ToolPanelV2.module.css`)

**Проблема:** При выборе инструмента весь квадратик иконки становится оранжевым, и белая иконка на оранжевом фоне сливается / не видна.

**Что исправить:** Активная кнопка должна иметь:
- Оранжевую РАМКУ (border), НЕ заливку фона иконки
- Оранжевый текст лейбла
- Иконка остаётся на тёмном фоне (видна)

В CSS/стилях кнопки:
```css
/* Неактивная кнопка */
.toolButton {
  background: #2a2a2a;
  border: 2px solid transparent;
  color: #ffffff;
}
.toolButtonIcon {
  width: 32px;
  height: 32px;
  background: #3a3a3a;  /* тёмный фон — иконка белая, видна */
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #ffffff;
}

/* Активная кнопка */
.toolButtonActive {
  border-color: #FF5722;
  color: #FF5722;        /* текст лейбла оранжевый */
}
.toolButtonActive .toolButtonIcon {
  background: #FF5722;   /* иконка на оранжевом фоне */
  color: #ffffff;         /* иконка БЕЛАЯ на оранжевом */
}
```

Убедиться что SVG-иконка (lucide-react) имеет `color: currentColor` или явно `stroke: white` когда активна. Если иконка чёрная на оранжевом — не видно. Должна быть белая на оранжевом.

---

## Порядок

1. Fix 3 — иконки (фронтенд, быстро)
2. Fix 2 — курсор ластика (фронтенд)
3. Fix 1 — dilate/inpaint (бэкенд, перестроить маску для проверки)

После каждого — визуальная проверка.