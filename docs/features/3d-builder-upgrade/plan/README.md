# Code Plan: 3d-builder-upgrade

date: 2026-03-14
design: ../README.md
status: draft

## Phase Strategy

**Bottom-up** — Models → Processing → Service → Frontend.

Причина: processing-функции не зависят от сервиса, сервис зависит от processing,
фронтенд зависит от API-контракта. Каждая фаза компилируется и тестируется независимо.

## Phases

| # | Phase | Layer | Depends on | Status |
|---|-------|-------|------------|--------|
| 1 | Refactor mesh_generator to pure functions | processing | — | ☐ |
| 2 | New mesh_builder entry point | processing | Phase 1 | ☐ |
| 3 | Update ReconstructionService | service | Phase 2 | ☐ |
| 4 | Extend API response with room_labels | api | Phase 3 | ☐ |
| 5 | Frontend: MeshViewer upgrade + RoomLabels | frontend | Phase 4 | ☐ |

## File Map

### New Files
- `backend/app/processing/mesh_generator.py` — полная замена: чистые функции вместо класса
- `backend/tests/processing/test_mesh_generator.py` — 19 тестов
- `backend/tests/services/test_builder_3d.py` — 4 теста
- `frontend/src/hooks/useMeshViewer.ts` — логика вьюера
- `frontend/src/components/MeshViewer/RoomLabels.tsx` — HTML overlay меток
- `frontend/src/components/MeshViewer/ViewerControls.tsx` — кнопки управления
- `frontend/src/types/reconstruction.ts` — TypeScript типы

### Modified Files
- `backend/app/processing/mesh_builder.py` — новая функция `build_mesh_from_vectorization()`
- `backend/app/services/reconstruction_service.py` — использует новый entry point + room_labels
- `backend/app/models/__init__.py` — добавить `RoomLabelResponse` в `CalculateMeshResponse`
- `frontend/src/components/MeshViewer.tsx` → `frontend/src/components/MeshViewer/MeshViewer.tsx` — рефактор + стиль
- `frontend/src/pages/ViewMeshPage.tsx` — использует `useMeshViewer` hook

## Success Criteria
- [ ] Все фазы завершены и проверены
- [ ] 23 теста проходят (`pytest tests/processing/test_mesh_generator.py tests/services/test_builder_3d.py`)
- [ ] Build чистый (`tsc --noEmit`)
- [ ] Lint чистый (`flake8 backend/app/processing/mesh_generator.py mesh_builder.py`)
- [ ] API контракт соответствует `../05-api-contract.md`
- [ ] Все acceptance criteria из `../README.md` выполнены
- [ ] Вьюер визуально соответствует стилю 2GIS: цветные полы, тёмные стены, метки комнат
