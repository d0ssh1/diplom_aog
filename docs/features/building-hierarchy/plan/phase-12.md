# Phase 12: RouteTestPage Adaptation

phase: 12
layer: frontend refactor
depends_on: 06
design: ../03-decisions.md §R-8

## Goal

Адаптировать существующий `RouteTestPage` под новую схему: фильтрация реконструкций по floor_id, displayLabel из иерархии (Building.code/Floor.number/Section.number).

## Context from Phase 06

`apiService.getReconstructions()` теперь возвращает `floor: ReconstructionFloor | null` и `section: { id, number } | null` вместо плоских полей. Существующие файлы — `frontend/src/pages/RouteTestPage.tsx`, `frontend/src/hooks/useRouteTest.ts`, `frontend/src/hooks/useRouteTest.helpers.ts`, `frontend/src/hooks/useRouteTest.helpers.test.ts`.

## Files to Modify

### `frontend/src/hooks/useRouteTest.helpers.ts`
**What changes:**
- `buildRoomRegistry(bundles)` — изменить вычисление `displayLabel`: `${reconstruction.floor?.building.code ?? '?'}-${reconstruction.floor?.number ?? '?'}-${reconstruction.section?.number ?? '?'}__${room.number}`
- Добавить фильтрацию: реконструкции без `floor_id` (`reconstruction.floor === null`) исключаются из реестра

### `frontend/src/hooks/useRouteTest.ts`
**What changes:**
- При вызове `apiService.getReconstructions()` — больше не использовать поля `building_id`, `floor_number` (их нет в новом типе); заменить на `floor.building.code` и `floor.number`
- Если код где-то фильтрует по `building_id` — переписать на `building.code` (если нужен фильтр по корпусу) или `floor_id` (если нужен фильтр по этажу)

### `frontend/src/hooks/useRouteTest.helpers.test.ts`
**What changes:**
- Обновить fixtures (mock reconstructions) под новую форму с `floor` и `section`
- Добавить тесты:
  - test_useRouteTest_displayLabel_uses_hierarchy
  - test_useRouteTest_filters_reconstructions_without_floor

### `frontend/src/pages/RouteTestPage.tsx`
**What changes:** скорее всего минимальные правки — отрефактореныe helpers/hooks делают всю работу. Проверить что в render нет прямых обращений к `reconstruction.building_id` / `reconstruction.floor_number`.

## Verification

- [ ] `npm run build` зелёный (TS должен поймать обращения к удалённым полям)
- [ ] `npm test` тесты helpers + новые 2 теста зелёные
- [ ] Manual: открыть `/admin/route-test`, выбрать комнаты разных секций → маршрут строится корректно
- [ ] Manual: реконструкция без привязки к этажу не появляется в dropdown'е комнат

## Phase 12 — Финальная проверка фичи

После всех 12 фаз (это последняя):
- [ ] Все acceptance criteria из `../README.md` проверены вручную
- [ ] Все 78 тестов из `../04-testing.md` зелёные
- [ ] `cd backend && pytest -v` — green
- [ ] `cd frontend && npm run build && npm test && npm run lint` — green
- [ ] Manual smoke-тест из `../04-testing.md §Manual Test Plan` пройден полностью
- [ ] `requirements.txt` обновлён (если добавлены backend-зависимости — вряд ли, фича на существующих)
- [ ] Код-ревью: routers тонкие, services в своём слое, никаких `any`/`print`
- [ ] Память обновлена (`MEMORY.md` + `building-hierarchy-progress.md`) с результатом
