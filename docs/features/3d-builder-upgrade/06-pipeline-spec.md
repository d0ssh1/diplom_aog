# Pipeline Specification: 3d-builder-upgrade

## Где в пайплайне

```
[1] Preprocessing → [2] Vectorization → [3] VectorizationResult (DB)
    → [4] THIS STEP: build_mesh_from_vectorization → [5] GLB export → DB
```

Шаг 4 заменяет текущий `find_contours() → build_mesh(contours)` на
`build_mesh_from_vectorization(vr)` — использует уже готовый VectorizationResult.

## Input / Output

**Input:** `VectorizationResult` — domain модель из `models/domain.py:52`
- `walls: List[Wall]` — нормализованные [0,1] координаты
- `rooms: List[Room]` — нормализованные [0,1] полигоны
- `doors: List[Door]` — нормализованные [0,1] позиции
- `image_size_cropped: tuple[int, int]` — (width, height) в пикселях

Дополнительно: `image_width: int`, `image_height: int`, `floor_height: float = 3.0`

**Output:** `trimesh.Trimesh` — объединённый меш с vertex colors. НЕ сохранён на диск.

## Алгоритм

### Шаг 1: Денормализация координат
```
wall.points[i].x * image_width  → pixel_x
wall.points[i].y * image_height → pixel_y
```
Нужно для `contour_to_polygon(scale = 1/pixels_per_meter)`.

### Шаг 2: Стены → полигоны → экструзия
```
for wall in vr.walls:
    contour = denormalize(wall.points, w, h)  # np.ndarray (N,1,2)
    polygon = contour_to_polygon(contour, scale=1/pixels_per_meter)
    if polygon:
        wall_mesh = extrude_wall(polygon, height=floor_height)
        meshes.append(wall_mesh)
```

### Шаг 3: Дверные проёмы (если doors не пуст)

`Door.width` по умолчанию `0.0` — если ширина нулевая, проём пропускается.

```
MIN_DOOR_WIDTH = 0.3  # метры — минимальная ширина проёма

for door in vr.doors:
    door_width_m = (door.width / pixels_per_meter)
    if door_width_m < MIN_DOOR_WIDTH:
        continue  # пропустить нулевые/слишком узкие двери
    door_box = cut_door_opening(door.position, door_width_m, floor_height, w, h, pixels_per_meter)
    # door_box: Shapely box в метрах
    # Применить difference к полигонам стен в радиусе door_width_m * 2
    # При ошибке (невалидный результат) — пропустить, стена остаётся целой
```

**`cut_door_opening(position, width_m, height, img_w, img_h, ppm) -> Polygon`** — чистая функция:
- Денормализует `position` → пиксели → метры
- Возвращает Shapely `box(cx - w/2, 0, cx + w/2, height)` в системе координат стены

### Шаг 4: Пол по комнатам
```
if vr.rooms:
    for room in vr.rooms:
        room_polygon = denormalize_polygon(room.polygon, w, h, pixels_per_meter)
        floor_mesh = build_floor_mesh(room_polygon, z_offset=0.0)
        meshes.append(floor_mesh)
else:
    # Fallback: прямоугольный пол по всему изображению
    floor_mesh = build_floor_mesh_rect(w/ppm, h/ppm, z_offset=0.0)
    meshes.append(floor_mesh)
```

### Шаг 5: Потолок
```
ceiling = build_ceiling_mesh(w/ppm, h/ppm, z_offset=floor_height)
meshes.append(ceiling)
```

### Шаг 6: Цвета по типу комнаты
```
ROOM_COLORS = {
    "classroom":  [245, 197, 66,  255],   # жёлтый
    "corridor":   [66,  135, 245, 255],   # синий
    "staircase":  [245, 66,  66,  255],   # красный
    "toilet":     [66,  245, 200, 255],   # бирюзовый
    "other":      [200, 200, 200, 255],   # серый
}
combined = trimesh.util.concatenate(meshes)
combined = assign_room_colors(combined, vr.rooms, pixels_per_meter)
```

### Шаг 7: Поворот координат
```
# Z-up (trimesh default) → Y-up (Three.js convention)
matrix = trimesh.transformations.rotation_matrix(-π/2, [1, 0, 0])
combined.apply_transform(matrix)
```

## Параметры

| Параметр | Тип | Default | Источник |
|----------|-----|---------|----------|
| `floor_height` | `float` | `3.0` | `settings.DEFAULT_FLOOR_HEIGHT` |
| `pixels_per_meter` | `float` | из `vr.estimated_pixels_per_meter` | `VectorizationResult` |
| `min_polygon_area` | `float` | `0.01` м² | константа в `mesh_generator.py` |

## Error Handling

| Condition | Exception | Message |
|-----------|-----------|---------|
| `walls` пуст | `ImageProcessingError` | `"build_mesh_from_vectorization: No walls in VectorizationResult"` |
| `trimesh` не установлен | `ImageProcessingError` | `"build_mesh_from_vectorization: trimesh not installed"` |
| `shapely` не установлен | `ImageProcessingError` | `"build_mesh_from_vectorization: shapely not installed"` |
| Полигон невалиден после buffer(0) | `logger.debug` + skip | Стена пропускается, не прерывает pipeline |
| Shapely difference даёт пустой полигон | `logger.debug` + skip | Стена остаётся без проёма |

## Цветовая карта комнат (для overlay и vertex colors)

`Room.room_type` в `domain.py:32` имеет default `"room"` и комментарий `"room" | "corridor"`.
Реальные значения из `processing/pipeline.py` (classify_rooms): `"classroom"`, `"corridor"`, `"staircase"`, `"toilet"`, `"other"`.
Значение `"room"` — legacy default, маппится на `"other"`.

| room_type | Vertex color (RGBA) | HEX overlay |
|-----------|---------------------|-------------|
| `classroom` | `[245, 197, 66, 255]` | `#f5c542` |
| `corridor` | `[66, 135, 245, 255]` | `#4287f5` |
| `staircase` | `[245, 66, 66, 255]` | `#f54242` |
| `toilet` | `[66, 245, 200, 255]` | `#42f5c8` |
| `other` | `[200, 200, 200, 255]` | `#c8c8c8` |
| `room` (legacy) | `[200, 200, 200, 255]` | `#c8c8c8` |
