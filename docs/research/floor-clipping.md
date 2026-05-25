# Research: floor-clipping
date: 2026-05-25

## Summary

Пользователь видит "лишний пол", который выходит за рамки крайних стен в 3D-просмотрщике. После анализа установлено, что причина **не в 3D-файле (GLB)**, а в **синтетическом плане-заглушке `FloorPlane`**, который рендерится фронтендом поверх модели с коэффициентом 1.5× от bounding box модели.

Бэкенд генерирует только стены — функция `build_mesh_from_mask()` явно задокументирована как "Без пола и потолка". Функция `_create_floor()` существует в файле, но **нигде не вызывается**. Таким образом, в GLB-файле пола нет вообще — вся проблема во фронтенде.

Дополнительная проблема: даже если убрать padding 1.5×, bounding box прямоугольный, а здание — нет. Настоящий пол должен повторять контур внешней стены. Для этого нужно добавить floor mesh в бэкенде из внешнего полигона маски.

## Architecture — Current State

### Backend Structure

- `backend/app/processing/mesh_builder.py:73` — `build_mesh_from_mask(mask, floor_height, pixels_per_meter, vr)` — основная функция. Строит ТОЛЬКО стены. Docstring: "Без пола и потолка — чистые стены для обзора сверху".
- `backend/app/processing/mesh_builder.py:18` — `_create_floor(width_m, height_m, color)` — вспомогательная функция создания прямоугольного пола. **Нигде не вызывается в pipeline.**
- `backend/app/processing/mesh_builder.py:43` — `_create_wall_cap(polygon, height, color)` — крышка стены. Используется внутри mesh_builder, не относится к полу.
- `backend/app/processing/mesh_generator.py:203` — `build_floor_mesh(polygon, z_offset)` — создаёт thin slab (0.05m) из polygon через `trimesh_creation.extrude_polygon(polygon, 0.05)`. **Не вызывается из main pipeline.**
- `backend/app/processing/mesh_generator.py:231` — `build_floor_mesh_rect(...)` — fallback прямоугольный пол через `trimesh_creation.box(width, depth, 0.05)`. **Не вызывается из main pipeline.**
- `backend/app/services/reconstruction_service.py:229` — вызывает `build_mesh_from_mask(mask_array, ...)` → сохраняет GLB. Нет вызова floor-функций.

### Frontend Structure

- `frontend/src/components/MeshViewer.tsx:62` — `FloorPlane` компонент. **КОРЕНЬ ПРОБЛЕМЫ.**
  - `MeshViewer.tsx:73-74`: `const pad = 1.5; meshRef.current.scale.set(size.x * pad, size.z * pad, 1)` — пол масштабируется до 1.5× bounding box модели
  - `MeshViewer.tsx:75`: позиционируется на `y: box.min.y - 0.05` (чуть ниже модели)
  - `MeshViewer.tsx:79-83`: рендерится как `planeGeometry` 1×1 с белым material (`#FFFFFF`)
- `frontend/src/components/MeshViewer.tsx:120` — `FloorPlane` подключён к `ObjModel`
- `frontend/src/components/MeshViewer.tsx:186` — `FloorPlane` подключён к `GlbModel`

### Database Models
Не затронуто этой задачей — floor mesh хранится как часть GLB-файла, который записывается в `reconstruction.mesh_file_id_glb`.

## Closest Analog Feature

Ближайший аналог — wall cap (`_create_wall_cap`): создаёт плоский полигон на заданной высоте из существующего `ShapelyPolygon`. Та же логика применима для floor: взять внешний контур здания и создать тонкую плиту (0.05m).

- Files: `backend/app/processing/mesh_builder.py:43-70`
- Data flow: polygon → `extrude_polygon(polygon, 0.001)` → translate → trimesh.Trimesh
- Test approach: `backend/tests/processing/test_mesh_generator.py:77+` — тесты через Polygon.exterior

## Existing Patterns to Reuse

- `backend/app/processing/mesh_generator.py:203` — `build_floor_mesh(polygon)` — уже есть готовая функция, принимает Shapely polygon и возвращает trimesh floor slab. Осталось вызвать её из `build_mesh_from_mask()`.
- `backend/app/processing/mesh_builder.py:139-145` — уже извлекаются top-level contours (внешние контуры здания). Первый из них — контур внешней стены. Из него можно взять `exterior` полигон для пола.
- `backend/app/processing/mesh_builder.py:171-182` — уже создаются Shapely polygons из contours. Эти же polygons можно использовать для floor mesh.

## Integration Points

- **File storage**: GLB сохраняется через `reconstruction_service.py` в `backend/uploads/models/reconstruction_{id}.glb`. Floor mesh нужно включить в тот же combined mesh до сохранения.
- **API**: POST `/reconstruction/reconstructions` → `build_mesh_from_mask()` → GLB. Изменения только в `mesh_builder.py`, API не меняется.
- **Frontend viewer**: `MeshViewer.tsx` — нужно убрать / изменить `FloorPlane`.

## Root Cause Analysis

Два независимых источника "лишнего пола":

### 1. Frontend FloorPlane (ГЛАВНАЯ причина видимой проблемы)
`MeshViewer.tsx:73`: `const pad = 1.5` → пол на 50% шире и глубже модели.
- Исправление: изменить `pad = 1.5` на `pad = 1.0` (или убрать FloorPlane полностью, если пол будет в GLB).

### 2. Отсутствие реального floor mesh в GLB (причина неправильной формы)
Даже при `pad = 1.0` bounding box прямоугольный. Для нестандартных зданий пол всё равно будет вылезать за стены в угловых зонах.
- Исправление: сгенерировать floor mesh в `build_mesh_from_mask()` из внешнего полигона маски и включить в GLB.

## Fix Options (в порядке сложности)

### Option A — Быстрый (только фронтенд)
Изменить `pad = 1.5` → `pad = 1.0` в `MeshViewer.tsx:73`.
- Плюс: 1 строка, 5 минут.
- Минус: пол остаётся прямоугольным по bounding box, не повторяет форму здания.

### Option B — Правильный (бэкенд + фронтенд)
1. В `build_mesh_from_mask()` (`mesh_builder.py`): найти наибольший внешний polygon (`max(polygons, key=lambda p: p.area)`), взять его `exterior`, построить `build_floor_mesh(outer_polygon)`, включить в `meshes[]`.
2. Убрать `FloorPlane` из `MeshViewer.tsx` (или оставить как shadow catcher без visible geometry).
- Плюс: пол точно совпадает с формой здания.
- Минус: нужно пересобрать все существующие GLB-файлы (или принять, что старые без пола).

## Gaps (what's missing for this feature)

- `build_floor_mesh()` в `mesh_generator.py:203` существует, но не вызывается — gap в pipeline.
- `_create_floor()` в `mesh_builder.py:18` (прямоугольный пол) — мёртвый код, не используется.
- Нет теста для `build_floor_mesh()` с реальным polygon из маски.
- При Option B нужна миграция/пересборка существующих реконструкций.

## Key Files

- `frontend/src/components/MeshViewer.tsx:62-84` — `FloorPlane` компонент — корень видимой проблемы
- `backend/app/processing/mesh_builder.py:73-233` — `build_mesh_from_mask()` — основная функция, нет вызова floor
- `backend/app/processing/mesh_builder.py:18-40` — `_create_floor()` — мёртвый код (прямоугольный пол)
- `backend/app/processing/mesh_generator.py:203-215` — `build_floor_mesh(polygon)` — готовая функция для floor из polygon
- `backend/app/services/reconstruction_service.py:229` — вызов `build_mesh_from_mask()`
