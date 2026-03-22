# Code Plan: 3D Builder Redesign

date: 2026-03-19
design: ../README.md
status: draft

## Phase Strategy

**Bottom-up** — сначала бэкенд (новые цвета + геометрия), потом фронтенд (материалы + освещение).
Фронтенд зависит от того, что GLB содержит vertex colors — поэтому бэкенд идёт первым.

## Phases

| # | Phase | Layer | Depends on | Status |
|---|-------|-------|------------|--------|
| 1 | Цветовые константы | processing/mesh_generator.py | — | ☐ |
| 2 | Геометрия пола и крышек | processing/mesh_builder.py | Phase 1 | ☐ |
| 3 | Фронтенд: материалы и освещение | components/MeshViewer.tsx | Phase 2 | ☐ |

## File Map

### Modified Files
- `backend/app/processing/mesh_generator.py` — добавить 3 новые цветовые константы
- `backend/app/processing/mesh_builder.py` — добавить `_create_floor()`, `_create_wall_cap()`, обновить цикл экструзии
- `frontend/src/components/MeshViewer.tsx` — обновить `applyMapMaterials()`, `COLORS`, освещение, убрать `FloorPlane`

### New Files
- `backend/tests/processing/test_mesh_builder_redesign.py` — тесты для новых функций

## Success Criteria
- [ ] `pytest backend/tests/processing/test_mesh_builder_redesign.py` — все 9 тестов проходят
- [ ] `npx tsc --noEmit` — без ошибок
- [ ] Визуально: серый пол, тёмные бока стен, оранжевые крышки, мягкие тени
- [ ] NavigationPath и RoutePanel работают без изменений
- [ ] Все acceptance criteria из ../README.md выполнены
