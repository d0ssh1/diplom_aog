# Code Plan: nav-graph-room-segmentation

date: 2026-03-19
design: ../README.md
status: draft

## Phase Strategy

**Bottom-up** — единственный затронутый слой это `processing/nav_graph.py` (алгоритм)
и вызов в `services/nav_service.py` (передача параметра). Нет новых моделей, нет новых
эндпоинтов, нет фронтенда.

## Phases

| # | Phase | Layer | Depends on | Status |
|---|-------|-------|------------|--------|
| 1 | Заменить алгоритм `extract_corridor_mask` | processing | — | ☐ |
| 2 | Обновить вызов в `NavService.build_graph` | service | Phase 1 | ☐ |
| 3 | Написать тесты | tests | Phase 1 | ☐ |

## File Map

### Modified Files
- `backend/app/processing/nav_graph.py` — заменить тело `extract_corridor_mask` (lines 15-141)
- `backend/app/services/nav_service.py` — передать `wall_thickness_px` в `extract_corridor_mask` (line 59)

### New Files
- `backend/tests/processing/test_nav_graph.py` — 8 тестов (если файл не существует)

## Success Criteria
- [ ] Все фазы завершены
- [ ] 8 тестов проходят (`pytest tests/processing/test_nav_graph.py -v`)
- [ ] Build clean (`python -m py_compile backend/app/processing/nav_graph.py`)
- [ ] `extract_corridor_mask` принимает `wall_thickness_px: float` вместо `dilate_kernel_size` / `dilate_iterations`
- [ ] `NavService.build_graph` передаёт `wall_thickness_px` без повторного вычисления
- [ ] Все acceptance criteria из ../README.md выполнены
