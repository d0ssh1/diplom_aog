# Phase 2: Обновить вызов в `NavService.build_graph`

phase: 2
layer: service
depends_on: phase-01
design: ../README.md

## Goal

Обновить единственный вызов `extract_corridor_mask` в `nav_service.py:59`,
передав уже вычисленный `wall_thickness_px` вместо удалённых параметров.

## Context

Phase 1 изменила сигнатуру `extract_corridor_mask`:
- Убраны: `dilate_kernel_size`, `dilate_iterations`
- Добавлен: `wall_thickness_px: float` (обязательный)

В `nav_service.py:56` уже вычисляется `wall_thickness_px = compute_wall_thickness(wall_mask)`.

## Files to Modify

### `backend/app/services/nav_service.py` (line 59)

**Было:**
```python
corridor_mask = extract_corridor_mask(wall_mask, rooms, w, h)
```

**Стало:**
```python
corridor_mask = extract_corridor_mask(wall_mask, rooms, w, h, wall_thickness_px)
```

Никаких других изменений в файле не требуется.

## Verification

- [ ] `python -m py_compile backend/app/services/nav_service.py`
- [ ] `wall_thickness_px` вычисляется один раз (line 56) и передаётся в `extract_corridor_mask`
