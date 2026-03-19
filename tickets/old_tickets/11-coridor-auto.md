# Тикет 21: Автоматическое определение коридоров (MORPH_OPEN) + восстановление аннотаций при возврате

**Приоритет:** Критический (маршрут идёт сквозь стены + аннотации теряются)  
**Предыдущий тикет:** 20 (маршрутизация)  
**Скриншоты:** 3 изображения в чате (маршрут сквозь стены, потеря разметки)

**Затрагиваемые файлы:**

Backend:
- `backend/app/processing/nav_graph.py` — переписать `extract_corridor_mask()`

Frontend:
- `frontend/src/pages/WizardPage.tsx` — передать initialRooms/initialDoors
- `frontend/src/components/Wizard/StepWallEditor.tsx` — прокинуть в canvas
- `frontend/src/components/Editor/WallEditorCanvas.tsx` — восстановить Fabric-объекты при ремаунте

---

## ЧАСТЬ A: Маршрут идёт сквозь стены

### Проблема

Текущий `extract_corridor_mask()` инвертирует маску и вычитает **только размеченные** комнаты. На плане ~15 комнат, пользователь разметил 5. Оставшиеся 10 неразмеченных комнат остаются «белыми» (свободными) → скелет проходит через них → маршрут режет стены напрямую.

Требовать от пользователя размечать ВСЕ комнаты — плохой UX. Нужен автоматический способ отличить коридоры от комнат.

### Решение: MORPH_OPEN для автодетекции комнат

**Ключевое наблюдение:** коридоры — узкие, комнаты — широкие.

**Алгоритм:**

```
1. free_space = bitwise_not(wall_mask)           // Инвертируем: белое = свободно
2. opened = MORPH_OPEN(free_space, kernel)        // Эрозия + дилатация
   - Эрозия «съедает» узкие коридоры (они исчезают)
   - Дилатация «надувает» оставшиеся комнаты обратно до оригинальных границ
   → opened содержит ТОЛЬКО широкие области (комнаты)
3. corridor_mask = free_space - opened            // Вычитаем комнаты
   → остаются ТОЛЬКО коридоры
4. Дополнительно вычитаем вручную размеченные комнаты (room, staircase, elevator)
   → на случай если MORPH_OPEN не убрал мелкую кладовку
```

**Условие работы:** `Ширина коридора < Размер ядра < Ширина самой маленькой комнаты`

Для стандартных планов эвакуации: коридоры ~15–30px, комнаты ~60–200px. Ядро ~40–50px попадает в «золотую зону».

### Реализация: переписать `extract_corridor_mask()` в `nav_graph.py`

```python
def extract_corridor_mask(
    wall_mask: np.ndarray,
    rooms: list[dict],
    mask_width: int,
    mask_height: int,
    corridor_kernel_size: int = 45,
) -> np.ndarray:
    """
    Автоматически извлекает маску коридоров из бинарной маски стен.
    
    Алгоритм:
    1. Инвертирует маску → свободное пространство (белое)
    2. MORPH_OPEN с крупным ядром → остаются только широкие области (комнаты)
    3. Вычитает «открытые» области из свободного пространства → коридоры
    4. Дополнительно вычитает вручную размеченные комнаты (room, staircase, elevator)
    
    Args:
        wall_mask: бинарная маска (uint8, 255=стена, 0=свободно)
        rooms: аннотации комнат (нормализованные координаты)
        mask_width, mask_height: размеры маски
        corridor_kernel_size: размер ядра для MORPH_OPEN.
            Должен быть: ширина_коридора < kernel < ширина_комнаты.
            Для стандартных планов: 40–50px.
            Нечётное число. Если чётное — будет +1.
    
    Returns:
        corridor_mask: (uint8, 255=коридор, 0=стена/комната)
    """
    t0 = time.perf_counter()
    
    # 1. Инвертируем: стены→чёрное, свободное→белое
    free_space = cv2.bitwise_not(wall_mask)
    
    # 2. MORPH_OPEN: эрозия + дилатация
    # Эрозия уничтожает узкие коридоры
    # Дилатация восстанавливает широкие комнаты до оригинального размера
    ks = corridor_kernel_size if corridor_kernel_size % 2 == 1 else corridor_kernel_size + 1
    kernel = np.ones((ks, ks), np.uint8)
    opened = cv2.morphologyEx(free_space, cv2.MORPH_OPEN, kernel)
    
    # 3. Вычитаем: свободное - комнаты = коридоры
    corridor_mask = cv2.subtract(free_space, opened)
    
    # 4. Дополнительно вычитаем вручную размеченные комнаты
    # (страховка: если пользователь разметил комнату меньше ядра, MORPH_OPEN мог её не поймать)
    room_types_to_subtract = {'room', 'staircase', 'elevator'}
    manual_subtracted = 0
    
    for room in rooms:
        if room.get('room_type', 'room') in room_types_to_subtract:
            x = int(room['x'] * mask_width)
            y = int(room['y'] * mask_height)
            w = int(room['width'] * mask_width)
            h = int(room['height'] * mask_height)
            cv2.rectangle(corridor_mask, (x, y), (x + w, y + h), 0, -1)
            manual_subtracted += 1
    
    logger.info(
        "extract_corridor_mask: %dx%d, kernel=%d, opened_white=%d%%, corridor_white=%d%%, manual_sub=%d, %.1fms",
        mask_width, mask_height, ks,
        int(np.sum(opened > 0) / opened.size * 100),
        int(np.sum(corridor_mask > 0) / corridor_mask.size * 100),
        manual_subtracted,
        (time.perf_counter() - t0) * 1000,
    )
    
    return corridor_mask
```

### Debug-визуализация

В `nav_service.py` → `build_graph()`, после `extract_corridor_mask`:

```python
# Сохраняем debug-файлы для визуальной проверки
corridor_debug_path = mask_path.replace('.png', '_corridor_debug.png')
cv2.imwrite(corridor_debug_path, corridor_mask)

# Также сохраняем opened (что MORPH_OPEN определил как «комнаты»)
opened_debug_path = mask_path.replace('.png', '_opened_debug.png')
# opened нужно вычислить здесь или передать из extract_corridor_mask
```

**Опционально:** можно добавить `corridor_kernel_size` как параметр в `BuildNavGraphRequest`, чтобы пользователь мог настроить на UI. Но для MVP — константа 45 достаточна.

### Подбор kernel_size

Размер ядра зависит от масштаба плана. Для динамического вычисления можно использовать:

```python
# Эвристика: ядро = 3% от меньшей стороны маски
auto_kernel = max(15, int(min(mask_width, mask_height) * 0.03))
# Обеспечить нечётность
auto_kernel = auto_kernel if auto_kernel % 2 == 1 else auto_kernel + 1
```

Это даёт ~30px для маски 1000px и ~60px для маски 2000px. Для MVP можно начать с фиксированных 45px и перейти на auto позже.

---

## ЧАСТЬ B: Аннотации теряются при возврате на шаг 3

### Проблема

При нажатии «Назад» с шага 4 (навигационный граф) → шаг 3 (редактор стен), все прямоугольники комнат и линии дверей исчезают. `WallEditorCanvas` перемонтируется, Fabric.js канвас создаётся заново пустым.

Аннотации сохранены в `state.rooms` и `state.doors` (через `saveMaskAndAnnotations`), но не передаются обратно в канвас для визуального восстановления.

### Решение

#### Шаг B1: Передать аннотации в WizardPage → StepWallEditor → WallEditorCanvas

**`WizardPage.tsx`** — case 3:
```tsx
case 3:
  return (
    <StepWallEditor
      maskUrl={...}
      // ... существующие props ...
      initialRooms={state.rooms}     // ← НОВОЕ
      initialDoors={state.doors}     // ← НОВОЕ
    />
  );
```

**`StepWallEditor.tsx`** — добавить props и прокинуть:
```tsx
interface StepWallEditorProps {
  // ... существующие ...
  initialRooms?: RoomAnnotation[];
  initialDoors?: DoorAnnotation[];
}

// В JSX:
<WallEditorCanvas
  ref={canvasRef}
  // ... существующие props ...
  initialRooms={initialRooms}
  initialDoors={initialDoors}
/>
```

**`WallEditorCanvas.tsx`** — добавить props:
```tsx
interface WallEditorCanvasProps {
  // ... существующие ...
  initialRooms?: RoomAnnotation[];
  initialDoors?: DoorAnnotation[];
}
```

#### Шаг B2: Восстановить Fabric.js-объекты при монтировании

В `WallEditorCanvas.tsx`, добавить `useEffect` ПОСЛЕ useEffect загрузки маски:

```typescript
// Восстановление аннотаций из предыдущей сессии
useEffect(() => {
  const canvas = fabricRef.current;
  if (!canvas) return;
  
  // Ждём загрузки фонового изображения
  const bgImg = canvas.backgroundImage;
  if (!bgImg) return;
  
  // Восстановление комнат
  if (initialRooms && initialRooms.length > 0 && roomsRef.current.length === 0) {
    roomsRef.current = [...initialRooms];
    
    for (const room of initialRooms) {
      const x = room.x * canvas.getWidth();
      const y = room.y * canvas.getHeight();
      const w = room.width * canvas.getWidth();
      const h = room.height * canvas.getHeight();
      
      const roomType = room.room_type || 'room';
      
      const rect = new fabric.Rect({
        width: w,
        height: h,
        fill: ROOM_FILL[roomType] ?? 'rgba(255,255,255,0.1)',
        stroke: ROOM_STROKE[roomType] ?? '#fff',
        strokeWidth: 1,
      });
      const text = new fabric.Text(room.name || '', {
        fontSize: 12,
        fill: ROOM_STROKE[roomType] ?? '#fff',
        fontFamily: 'Courier New',
        left: 4,
        top: 4,
      });
      const group = new fabric.Group([rect, text], {
        left: x,
        top: y,
        selectable: false,
        evented: false,
      });
      (group as any).data = { id: room.id, type: 'annotation' };
      canvas.add(group);
    }
  }
  
  // Восстановление дверей
  if (initialDoors && initialDoors.length > 0 && doorsRef.current.length === 0) {
    doorsRef.current = [...initialDoors];
    
    for (const door of initialDoors) {
      const x1 = door.x1 * canvas.getWidth();
      const y1 = door.y1 * canvas.getHeight();
      const x2 = door.x2 * canvas.getWidth();
      const y2 = door.y2 * canvas.getHeight();
      
      const line = new fabric.Line([x1, y1, x2, y2], {
        stroke: '#4CAF50',
        strokeWidth: 3,
        selectable: false,
        evented: false,
      });
      (line as any).data = { id: door.id, type: 'door' };
      canvas.add(line);
    }
  }
  
  canvas.renderAll();
}, [maskUrl]); 
// Зависимость от maskUrl — чтобы выполнялось после загрузки маски
// (маска загружается в другом useEffect с [maskUrl] зависимостью)
```

**Важно:** проверка `roomsRef.current.length === 0` предотвращает дублирование при первом визите (когда нет сохранённых аннотаций).

**Важно 2:** Таймаут может потребоваться, если фоновое изображение загружается асинхронно. В этом случае обернуть в `setTimeout(() => {...}, 100)` или подписаться на callback загрузки маски.

---

## Порядок реализации

1. **Часть A** — `extract_corridor_mask()` с MORPH_OPEN (backend)
2. Debug: сохранить `_corridor_debug.png`, визуально проверить что коридоры выделены корректно
3. Перестроить граф, проверить что маршрут теперь идёт по коридорам
4. **Часть B** — передать initialRooms/initialDoors через props
5. Восстановление Fabric.js-объектов при ремаунте
6. `npx tsc --noEmit` + `pytest`

---

## Чеклист после реализации

**Часть A (коридоры):**
- [ ] `extract_corridor_mask` использует MORPH_OPEN для автодетекции комнат
- [ ] Размер ядра: 45px (или auto = 3% от меньшей стороны)
- [ ] Неразмеченные комнаты автоматически исключены из коридорной маски
- [ ] Скелет проходит только по коридорам (не через комнаты)
- [ ] Маршрут A* не пересекает стены
- [ ] Маршрут A* идёт по центру коридоров
- [ ] Debug: `_corridor_debug.png` сохраняется рядом с маской
- [ ] Вручную размеченные комнаты тоже вычитаются (страховка)

**Часть B (аннотации):**
- [ ] Шаг 3 → разметить комнаты/двери → ПОСТРОИТЬ → шаг 4 → Назад → шаг 3: аннотации на месте
- [ ] Прямоугольники комнат восстанавливаются с правильными цветами/подписями
- [ ] Линии дверей восстанавливаются (зелёные)
- [ ] При первом визите шага 3 (без сохранённых аннотаций) — ничего не падает
- [ ] `npx tsc --noEmit` — без ошибок
- [ ] `pytest` — pass