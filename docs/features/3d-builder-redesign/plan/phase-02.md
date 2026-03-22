# Phase 2: Геометрия пола и крышек стен

phase: 2
layer: processing
depends_on: phase-01
design: ../README.md

## Goal

Добавить в `mesh_builder.py` функции `_create_floor()` и `_create_wall_cap()`,
обновить `build_mesh_from_mask()` чтобы включать пол и крышки в итоговый меш,
перекрасить бока стен в `WALL_SIDE_COLOR`.

## Context

Phase 1 добавила в `mesh_generator.py`:
- `WALL_SIDE_COLOR = [74, 74, 74, 255]`
- `WALL_CAP_COLOR = [255, 69, 0, 255]`
- `FLOOR_COLOR = [184, 181, 173, 255]`

## Files to Modify

### `backend/app/processing/mesh_builder.py`

**Изменение 1 — обновить импорт (строка 44-47):**

```python
# было:
from app.processing.mesh_generator import (
    extrude_wall,
    WALL_COLOR,
)

# стало:
from app.processing.mesh_generator import (
    extrude_wall,
    WALL_COLOR,
    WALL_SIDE_COLOR,
    WALL_CAP_COLOR,
    FLOOR_COLOR,
)
```

**Изменение 2 — добавить `_create_floor()` после импортов (перед `build_mesh_from_mask`):**

```python
def _create_floor(
    width_m: float,
    height_m: float,
    color: list,
) -> "trimesh.Trimesh | None":
    """Плоский прямоугольный пол на Y=0."""
    if width_m <= 0 or height_m <= 0:
        return None
    try:
        import trimesh as _trimesh
    except ImportError:
        return None
    vertices = np.array([
        [0.0,     0.0, 0.0],
        [width_m, 0.0, 0.0],
        [width_m, 0.0, height_m],
        [0.0,     0.0, height_m],
    ], dtype=np.float64)
    faces = np.array([[0, 1, 2], [0, 2, 3]], dtype=np.int64)
    mesh = _trimesh.Trimesh(vertices=vertices, faces=faces)
    colors = np.tile(color, (len(vertices), 1)).astype(np.uint8)
    mesh.visual.vertex_colors = colors
    return mesh
```

**Изменение 3 — добавить `_create_wall_cap()` после `_create_floor()`:**

```python
def _create_wall_cap(
    polygon: "ShapelyPolygon",
    height: float,
    color: list,
) -> "trimesh.Trimesh | None":
    """Плоская крышка полигона стены на заданной высоте.

    Использует trimesh.creation.extrude_polygon с минимальной высотой,
    затем сдвигает на height. Гарантирует корректную триангуляцию.
    """
    try:
        import trimesh as _trimesh
        from trimesh import creation as trimesh_creation
    except ImportError:
        return None
    try:
        if polygon.is_empty or not polygon.is_valid or polygon.area <= 0:
            return None
        # Тонкая плёнка толщиной 0.001м — только для триангуляции
        cap = trimesh_creation.extrude_polygon(polygon, height=0.001)
        if cap is None or len(cap.vertices) == 0:
            return None
        # Сдвинуть на floor_height вдоль Z (Z-up пространство до ротации)
        # После rotation_matrix(-pi/2, [1,0,0]) Z→Y, поэтому cap окажется на Y=height
        cap.apply_translation([0, 0, height + 0.001])
        colors = np.tile(color, (len(cap.vertices), 1)).astype(np.uint8)
        cap.visual.vertex_colors = colors
        return cap
    except Exception as exc:
        logger.debug("_create_wall_cap failed: %s", exc)
        return None
```

**Изменение 4 — обновить Step 3 в `build_mesh_from_mask()` (строки 128-143):**

```python
# было:
# Step 3: Extrude walls
meshes: list = []
for poly in polygons:
    wall_mesh = extrude_wall(poly, height=floor_height)
    if wall_mesh is not None:
        colors = np.tile(WALL_COLOR, (len(wall_mesh.vertices), 1)).astype(np.uint8)
        wall_mesh.visual.vertex_colors = colors
        meshes.append(wall_mesh)

# стало:
# Step 3: Extrude walls (sides) + caps
meshes: list = []
for poly in polygons:
    wall_mesh = extrude_wall(poly, height=floor_height)
    if wall_mesh is not None:
        colors = np.tile(WALL_SIDE_COLOR, (len(wall_mesh.vertices), 1)).astype(np.uint8)
        wall_mesh.visual.vertex_colors = colors
        meshes.append(wall_mesh)
    cap = _create_wall_cap(poly, floor_height, WALL_CAP_COLOR)
    if cap is not None:
        meshes.append(cap)

# Step 3b: Floor
w_m = w / pixels_per_meter
h_m = h / pixels_per_meter
floor_mesh = _create_floor(w_m, h_m, FLOOR_COLOR)
if floor_mesh is not None:
    meshes.append(floor_mesh)
```

**Изменение 5 — обновить комментарий строки 145:**
```python
# было:
# NO floor, NO ceiling — clean wall-only view from above

# стало (удалить эту строку — пол теперь добавляется выше)
```

**Важно:** `build_mesh` (legacy wrapper, строки 160-194) — НЕ менять. Он использует `WALL_COLOR` и не затрагивается.

## Files to Create

### `backend/tests/processing/test_mesh_builder_redesign.py`

```python
"""Tests for _create_floor and _create_wall_cap in mesh_builder."""
import numpy as np
import pytest

pytest.importorskip("trimesh")
pytest.importorskip("shapely")

from shapely.geometry import Polygon as ShapelyPolygon
from app.processing.mesh_builder import _create_floor, _create_wall_cap
from app.processing.mesh_generator import FLOOR_COLOR, WALL_CAP_COLOR, WALL_SIDE_COLOR


# --- _create_floor ---

def test_create_floor_valid_dims_returns_quad():
    # Arrange / Act
    mesh = _create_floor(5.0, 3.0, FLOOR_COLOR)
    # Assert
    assert mesh is not None
    assert len(mesh.vertices) == 4
    assert len(mesh.faces) == 2


def test_create_floor_vertex_colors_match_floor_color():
    mesh = _create_floor(5.0, 3.0, FLOOR_COLOR)
    assert mesh is not None
    colors = np.array(mesh.visual.vertex_colors)
    assert colors.shape == (4, 4)
    assert np.all(colors[:, :3] == FLOOR_COLOR[:3])


def test_create_floor_zero_width_returns_none():
    assert _create_floor(0.0, 3.0, FLOOR_COLOR) is None


def test_create_floor_zero_height_returns_none():
    assert _create_floor(5.0, 0.0, FLOOR_COLOR) is None


# --- _create_wall_cap ---

def test_create_wall_cap_valid_polygon_returns_mesh_at_height():
    poly = ShapelyPolygon([(0, 0), (2, 0), (2, 2), (0, 2)])
    mesh = _create_wall_cap(poly, height=3.0, color=WALL_CAP_COLOR)
    assert mesh is not None
    assert len(mesh.vertices) > 0
    # In Z-up space (before rotation), cap is translated along Z axis
    assert np.all(mesh.vertices[:, 2] >= 3.0)


def test_create_wall_cap_vertex_colors_match_cap_color():
    poly = ShapelyPolygon([(0, 0), (2, 0), (2, 2), (0, 2)])
    mesh = _create_wall_cap(poly, height=3.0, color=WALL_CAP_COLOR)
    assert mesh is not None
    colors = np.array(mesh.visual.vertex_colors)
    assert np.all(colors[:, :3] == WALL_CAP_COLOR[:3])


def test_create_wall_cap_invalid_polygon_returns_none():
    # Polygon with < 3 points is invalid
    poly = ShapelyPolygon([(0, 0), (1, 0)])
    result = _create_wall_cap(poly, height=3.0, color=WALL_CAP_COLOR)
    assert result is None


# --- build_mesh_from_mask integration ---

def test_build_mesh_from_mask_contains_all_three_colors():
    """Integration: result mesh has vertices for walls, caps, and floor."""
    import cv2
    from app.processing.mesh_builder import build_mesh_from_mask

    mask = np.zeros((100, 100), dtype=np.uint8)
    cv2.rectangle(mask, (10, 10), (90, 90), 255, thickness=5)

    mesh = build_mesh_from_mask(mask, floor_height=3.0, pixels_per_meter=10.0)
    colors = np.array(mesh.visual.vertex_colors)[:, :3]

    wall_side = np.array(WALL_SIDE_COLOR[:3])
    wall_cap  = np.array(WALL_CAP_COLOR[:3])
    floor_c   = np.array(FLOOR_COLOR[:3])

    assert any(np.all(row == wall_side) for row in colors), "WALL_SIDE_COLOR not found"
    assert any(np.all(row == wall_cap)  for row in colors), "WALL_CAP_COLOR not found"
    assert any(np.all(row == floor_c)   for row in colors), "FLOOR_COLOR not found"
```

## Verification
- [ ] `python -m py_compile backend/app/processing/mesh_builder.py` — без ошибок
- [ ] `pytest backend/tests/processing/test_mesh_builder_redesign.py -v` — все тесты проходят
- [ ] `_create_floor` и `_create_wall_cap` — чистые функции (нет импортов из `api/` или `db/`)
