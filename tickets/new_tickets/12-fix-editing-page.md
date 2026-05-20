# BUG: Комнаты отображаются неправильно при открытии в EditPlanPage

## Что видит пользователь
- При первой загрузке плана в wizard → комнаты корректные (скрин 2)
- При открытии того же плана через EditPlanPage → комнаты огромные, смещённые (скрин 1)
- У некоторых комнат "правильный размер, но сломана привязка"

## Корневая причина — цепочка из 3 багов

---

### БАГ A: `saveVectors` игнорирует правки пользователя (ГЛАВНЫЙ)

**Файл:** `EditPlanPage.tsx`, функция `saveVectors`, строка ~131

```typescript
const updatedPayload: VectorizationResult = {
  ...(data.rawVectors ?? { ... }),
  rooms: data.rawVectors?.rooms ?? rooms.map((r) => ({ ... })),
  //     ^^^^^^^^^^^^^^^^^^^^^^^^
  //     Если rawVectors существует → ВСЕГДА используются rooms из ПАЙПЛАЙНА
  //     Пользовательские правки ИГНОРИРУЮТСЯ
  doors: data.rawVectors?.doors ?? doors.map((d) => ({ ... })),
};
```

**Что происходит:**
1. Пользователь открывает EditPlanPage
2. Бэкенд возвращает `vectorData` с rooms из пайплайна (контурные полигоны от OpenCV)
3. `data.rawVectors` заполняется → truthy
4. При сохранении `data.rawVectors?.rooms` → ЕСТЬ → используются rooms пайплайна
5. Пользовательские аннотации (`rooms` из `canvasRef.current.getAnnotations()`) **отбрасываются**

**Это значит:** даже если пользователь перерисует все комнаты, сохранятся старые данные из пайплайна.

**Исправление:**

```typescript
// БЫЛО:
const updatedPayload: VectorizationResult = {
  ...(data.rawVectors ?? { rooms: [], doors: [], rotation_angle: data.rotation, crop_rect: data.cropRect }),
  rooms: data.rawVectors?.rooms ?? rooms.map((r) => ({
    id: r.id,
    name: r.name,
    room_type: r.room_type,
    center: { x: r.x + r.width / 2, y: r.y + r.height / 2 },
    polygon: [
      { x: r.x, y: r.y },
      { x: r.x + r.width, y: r.y },
      { x: r.x + r.width, y: r.y + r.height },
      { x: r.x, y: r.y + r.height },
    ],
    area_normalized: r.width * r.height,
  })),
  doors: data.rawVectors?.doors ?? doors.map((d) => ({
    id: d.id,
    position: { x: d.x1, y: d.y1 },
    width: 0.05,
    connects: d.room_id ? [d.room_id] : [],
  })),
};

// СТАЛО:
const updatedPayload: VectorizationResult = {
  ...(data.rawVectors ?? { rooms: [], doors: [], rotation_angle: data.rotation, crop_rect: data.cropRect }),
  // ВСЕГДА используем текущие аннотации пользователя:
  rooms: rooms.map((r) => ({
    id: r.id,
    name: r.name,
    room_type: r.room_type,
    center: { x: r.x + r.width / 2, y: r.y + r.height / 2 },
    polygon: [
      { x: r.x, y: r.y },
      { x: r.x + r.width, y: r.y },
      { x: r.x + r.width, y: r.y + r.height },
      { x: r.x, y: r.y + r.height },
    ],
    area_normalized: r.width * r.height,
  })),
  doors: doors.map((d) => ({
    id: d.id,
    position: { x: d.x1, y: d.y1 },
    width: 0.05,
    connects: d.room_id ? [d.room_id] : [],
  })),
};
```

---

### БАГ B: Полигоны пайплайна → bounding box = огромные прямоугольники

**Файл:** `EditPlanPage.tsx`, `useEffect` загрузки данных, строка ~65

Пайплайн (OpenCV `room_detect`) возвращает rooms с произвольными контурными полигонами:

```
Пример полигона коридора из пайплайна:
polygon: [
  {x: 0.05, y: 0.3},   // начало коридора слева
  {x: 0.95, y: 0.3},   // конец коридора справа
  {x: 0.95, y: 0.35},
  {x: 0.7,  y: 0.35},  // коридор поворачивает
  {x: 0.7,  y: 0.6},
  {x: 0.05, y: 0.6},
  ...
]
```

EditPlanPage вычисляет bounding box:
```typescript
x: Math.min(...xs),                          // → 0.05
y: Math.min(...ys),                          // → 0.3
width: Math.max(...xs) - Math.min(...xs),    // → 0.95 - 0.05 = 0.9  ← 90% ширины!
height: Math.max(...ys) - Math.min(...ys),   // → 0.6 - 0.3 = 0.3
```

Результат: оранжевый прямоугольник покрывает 90% ширины × 30% высоты холста. Вот откуда "огромные" комнаты на скриншоте.

Для обычных прямоугольных комнат bounding box ≈ реальная форма. Но для L-образных комнат, коридоров, лестничных клеток — bounding box **сильно больше** реальной формы.

**Исправление:**

Вместо bounding box использовать `center` из VectorRoom (уже есть в данных пайплайна) и вычислять размер более осторожно:

```typescript
// БЫЛО:
const rooms: RoomAnnotation[] = (vectorData?.rooms ?? []).map((r) => {
  const xs = r.polygon.map((p) => p.x);
  const ys = r.polygon.map((p) => p.y);
  const maxCoord = Math.max(...xs, ...ys);
  const normalize = maxCoord > 1 ? maxCoord : 1;
  return {
    id: r.id,
    name: r.name,
    room_type: r.room_type,
    x: Math.min(...xs) / normalize,
    y: Math.min(...ys) / normalize,
    width: (Math.max(...xs) - Math.min(...xs)) / normalize,
    height: (Math.max(...ys) - Math.min(...ys)) / normalize,
  };
});

// СТАЛО:
const rooms: RoomAnnotation[] = (vectorData?.rooms ?? []).map((r) => {
  // Если полигон — прямоугольник (4 точки, создан вручную) → bounding box OK
  if (r.polygon.length === 4) {
    const xs = r.polygon.map((p) => p.x);
    const ys = r.polygon.map((p) => p.y);
    return {
      id: r.id,
      name: r.name,
      room_type: r.room_type,
      x: Math.min(...xs),
      y: Math.min(...ys),
      width: Math.max(...xs) - Math.min(...xs),
      height: Math.max(...ys) - Math.min(...ys),
    };
  }

  // Сложный полигон (пайплайн) → использовать area_normalized для оценки размера
  // Квадрат с такой же площадью, центрированный на center
  const side = Math.sqrt(r.area_normalized);
  return {
    id: r.id,
    name: r.name,
    room_type: r.room_type,
    x: r.center.x - side / 2,
    y: r.center.y - side / 2,
    width: side,
    height: side,
  };
});
```

> **Примечание:** это компромисс. Для полноценной поддержки нужно хранить тип полигона (rectangle vs contour) или перейти к рендеру полигонов вместо bounding boxes. Но для защиты диплома это решает визуальную проблему.

---

### БАГ C: Shadowed import в `reconstruction.py` — две модели `VectorizationResult`

**Файл:** `backend/app/api/reconstruction.py`, строки ~36-43

```python
from app.models.reconstruction_vectors import VectorizationResult   # ← импорт 1
# ...
from app.models.domain import VectorizationResult                   # ← импорт 2 ЗАТЕНЯЕТ импорт 1
```

Второй импорт **перезаписывает** первый. Теперь `VectorizationResult` в этом файле — это **domain-модель** (с полями `walls`, `text_blocks`, `image_size_original`, и т.д.), а НЕ reconstruction_vectors модель.

**Последствия:**

1. **GET `/reconstructions/{id}/vectors`**: `response_model=VectorizationResult` — использует domain-модель. Сервис возвращает `ReconstructionVectorizationResult`. FastAPI сериализует через domain-модель → ответ включает `walls`, `text_blocks` и прочие поля, которые фронтенд не ожидает (но они просто игнорируются — не критично).

2. **PUT `/reconstructions/{id}/vectors`**: `data: VectorizationResult` — принимает domain-модель. Фронтенд шлёт payload с полями `rooms`, `doors`, `rotation_angle`, `crop_rect` (из `reconstructionVectors.ts`). Domain-модель заполняет **дефолтами** все остальные поля:
   ```python
   walls: list[Wall] = []                    # ← стены ОБНУЛЯЮТСЯ
   text_blocks: list[TextBlock] = []         # ← текстовые блоки ОБНУЛЯЮТСЯ
   image_size_original: tuple = (0, 0)       # ← размер ОБНУЛЯЕТСЯ
   image_size_cropped: tuple = (0, 0)        # ← размер ОБНУЛЯЕТСЯ
   wall_thickness_px: float = 0.0            # ← толщина стен ОБНУЛЯЕТСЯ
   estimated_pixels_per_meter: float = 0.0   # ← масштаб ОБНУЛЯЕТСЯ
   ```

   **Это значит: каждый раз когда пользователь сохраняет через EditPlanPage, бэкенд ТЕРЯЕТ все данные кроме rooms и doors!** Стены, текстовые блоки, размеры изображения — всё обнуляется.

**Исправление:**

```python
# БЫЛО:
from app.models.reconstruction_vectors import VectorizationResult
# ...
from app.models.domain import VectorizationResult

# СТАЛО:
from app.models.reconstruction_vectors import VectorizationResult as EditVectorizationResult
from app.models.domain import VectorizationResult as DomainVectorizationResult
```

И обновить использования:

```python
# GET endpoint — response_model остаётся domain (возвращает полный набор полей):
@router.get("/reconstructions/{id}/vectors", response_model=DomainVectorizationResult)

# PUT endpoint — принимает EditVectorizationResult (только rooms/doors/etc):
@router.put("/reconstructions/{id}/vectors", response_model=dict)
async def update_vectorization_data(
    id: int,
    data: EditVectorizationResult,   # ← reconstruction_vectors модель
    ...
):
```

**Но это не полное решение для потери данных.** Нужен merge вместо replace:

```python
# В ReconstructionService.update_vectorization_data:

async def update_vectorization_data(
    self, reconstruction_id: int, data: ReconstructionVectorizationResult
) -> bool:
    # 1. Загрузить текущие данные
    existing = await self.get_vectorization_data(reconstruction_id)

    if existing:
        # 2. Merge: обновить только rooms и doors, сохранить остальное
        merged = existing.model_copy(update={
            'rooms': data.rooms,
            'doors': data.doors,
            'rotation_angle': data.rotation_angle,
            'crop_rect': data.crop_rect,
        })
        json_str = json.dumps(merged.model_dump(), ensure_ascii=False)
    else:
        json_str = json.dumps(data.model_dump(), ensure_ascii=False)

    result = await self._repo.update_vectorization_data(
        reconstruction_id, json_str
    )
    return result is not None
```

---

## Порядок исправления

```
БАГ C (shadowed import + merge) → БАГ A (saveVectors) → БАГ B (polygon→bbox)
```

1. **Сначала БАГ C** — иначе каждое сохранение обнуляет walls/textblocks/sizes
2. **Потом БАГ A** — иначе пользовательские правки не сохраняются
3. **Потом БАГ B** — без этого пайплайновые комнаты рисуются как огромные прямоугольники

## Файлы для изменения

| Файл | Баг | Что менять |
|------|-----|-----------|
| `backend/app/api/reconstruction.py` | C | Развести импорты, убрать shadowing |
| `backend/app/services/reconstruction_service.py` | C | Merge вместо replace в `update_vectorization_data` |
| `frontend/src/pages/EditPlanPage.tsx` | A, B | Убрать `rawVectors?.rooms ??`, исправить polygon→bbox |

## НЕ ТРОГАТЬ

- `WallEditorCanvas.tsx` — его логика координат (`restoreAnnotations`, `toDisplayX/Y`) **корректна**
- `backend/app/models/reconstruction_vectors.py` — модель правильная
- `frontend/src/types/reconstructionVectors.ts` — контракт правильный
- `useStitchingCanvas.ts` и весь stitching flow

## Критерий готовности

- [ ] При открытии EditPlanPage комнаты отображаются в тех же позициях и размерах, что и в wizard
- [ ] После сохранения и повторного открытия комнаты не сдвигаются
- [ ] После сохранения через EditPlanPage поля `walls`, `text_blocks`, `image_size_*` в БД **не обнуляются**
- [ ] Коридоры и L-образные комнаты не рисуются как гигантские прямоугольники
- [ ] Console не содержит ошибок при загрузке EditPlanPage