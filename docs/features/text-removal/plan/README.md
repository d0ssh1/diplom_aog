# Code Plan: Text & Color Removal

date: 2026-03-14
design: ../README.md
status: complete

## Phase Strategy

Bottom-up — новые pure functions в processing → интеграция в service → тесты.

Обоснование: новые функции не зависят от сервисного слоя, а сервис зависит от них. Тесты processing можно запускать сразу после Phase 1, не дожидаясь интеграции.

## Phases

| # | Phase | Layer | Depends on | Status |
|---|-------|-------|------------|--------|
| 1 | Color removal functions | Processing | — | ✓ |
| 2 | Service integration | Service | Phase 1 | ✓ |
| 3 | Processing tests | Tests | Phase 1 | ✓ |
| 4 | Service tests | Tests | Phase 2 | ✓ |

## File Map

### New Files
— нет новых файлов, всё добавляется в существующие

### Modified Files
- `backend/app/processing/pipeline.py` — добавить `remove_green_elements`, `remove_red_elements`, `remove_colored_elements`
- `backend/app/services/mask_service.py` — интегрировать color removal + text removal в `calculate_mask()`
- `backend/tests/processing/test_pipeline.py` — добавить 30 тестов (color removal + text detect/remove)
- `backend/tests/services/test_mask_service.py` — добавить 9 тестов (service integration)

## Success Criteria
- [ ] All phases completed and verified
- [ ] All 39 tests passing (see ../04-testing.md for full test list)
- [ ] Build clean: `python -m py_compile` на всех изменённых файлах
- [ ] Lint clean: `flake8 backend/app/processing/pipeline.py backend/app/services/mask_service.py`
- [ ] Processing functions pure — нет импортов из api/, services/, db/
- [ ] Input arrays never mutated (.copy() в каждой функции)
- [ ] All acceptance criteria from ../README.md met
