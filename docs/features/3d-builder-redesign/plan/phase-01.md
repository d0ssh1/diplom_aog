# Phase 1: Цветовые константы

phase: 1
layer: processing
depends_on: none
design: ../README.md

## Goal

Добавить три новые цветовые константы в `mesh_generator.py` рядом с существующими `WALL_COLOR` и `ROOM_COLORS`.

## Context

Нет — это первая фаза.

## Files to Modify

### `backend/app/processing/mesh_generator.py`

**Что меняется:** Добавить 3 константы после строки 44 (после `DEFAULT_FLOOR_COLOR`).

**Текущий код (строки 43-53):**
```python
WALL_COLOR: list = [230, 230, 230, 255]        # light grey #e6e6e6
DEFAULT_FLOOR_COLOR: list = [245, 240, 232, 255]  # beige #f5f0e8

ROOM_COLORS: dict = { ... }
```

**Добавить после `DEFAULT_FLOOR_COLOR`:**
```python
# Diplom3D cyber-brutalism palette
WALL_SIDE_COLOR: list = [74, 74, 74, 255]      # dark grey  #4A4A4A — wall sides
WALL_CAP_COLOR: list  = [255, 69, 0, 255]      # orange     #FF4500 — wall tops
FLOOR_COLOR: list     = [184, 181, 173, 255]   # warm grey  #B8B5AD — floor
```

**Правило:** `WALL_COLOR` не удалять — используется в `build_mesh` (legacy wrapper, строка 179 в mesh_builder.py).

## Verification
- [ ] `python -m py_compile backend/app/processing/mesh_generator.py` — без ошибок
- [ ] Константы импортируются: `from app.processing.mesh_generator import WALL_SIDE_COLOR, WALL_CAP_COLOR, FLOOR_COLOR`
