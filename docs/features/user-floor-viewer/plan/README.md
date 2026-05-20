# Code Plan: user-floor-viewer

date: 2026-05-17
design: ../README.md
status: draft

## Phase Strategy

**Vertical-incremental** (по слоям + по визуальным блокам, каждый шаг доводит фичу до работающего состояния).

**Почему не bottom-up:** фича — это bug-fix существующей страницы + UI-редизайн. Бэкенд — одна правка в роутере и тесты. Фронт — каскад правок CSS и два новых компонента. Каждая фаза должна оставлять систему рабочей (не ломать существующий админский UI), поэтому идём от безопасного фундамента (auth, навигация) к визуальной переработке.

**Зачем такой порядок:**
1. **Backend сначала** — без снятия 401 любая правка фронта бессмысленна.
2. **Routing fix** — минимальная правка, открывающая путь к странице из главной.
3. **Theme + layout** — переписываем CSS под чёрный хедер/белый viewport/sharp corners, не трогая логику.
4. **Селекторы + минимапа** — restyle существующих компонентов под новые токены.
5. **Новые компоненты** — `RouteInputs` (swap) + `ZoomControls`.
6. **UX-полиш + sanity** — валидация ввода комнат + скрипт проверки данных ДВФУ.

---

## Phases

| # | Phase | Layer | Depends on | Status |
|---|---|---|---|---|
| 1 | [Backend: публичный доступ + тесты](phase-01.md) | api + tests | — | ☐ |
| 2 | [Frontend: фикс роута /map → /viewer](phase-02.md) | pages | Phase 1 (нужен 200 на public-ручке) | ☐ |
| 3 | [Frontend: тема + layout страницы](phase-03.md) | css | Phase 2 | ☐ |
| 4 | [Frontend: рестайл селекторов и минимапы](phase-04.md) | components/FloorViewer | Phase 3 | ☐ |
| 5 | [Frontend: RouteInputs + ZoomControls](phase-05.md) | components/FloorViewer + MeshViewer | Phase 4 | ☐ |
| 6 | [UX-валидация ввода + sanity-скрипт данных ДВФУ](phase-06.md) | hooks + scripts | Phase 5 | ☐ |

---

## File Map

### New Files

**Backend:**
- `backend/tests/api/test_buildings_hierarchy_api.py` — 7 кейсов из [04-testing.md](../04-testing.md)
- `backend/tests/services/test_building_service_published.py` — 3 кейса
- `scripts/check_dvfu_published.py` — sanity-скрипт ДВФУ

**Frontend:**
- `frontend/src/components/FloorViewer/RouteInputs.tsx`
- `frontend/src/components/FloorViewer/RouteInputs.module.css`
- `frontend/src/components/FloorViewer/ZoomControls.tsx`
- `frontend/src/components/FloorViewer/ZoomControls.module.css`

### Modified Files

**Backend:**
- `backend/app/api/buildings_hierarchy.py` — ADR-1: `auto_error=False` + ветвление по `published`

**Frontend:**
- `frontend/src/pages/PublicHomePage.tsx` — ADR-4: `navigate('/map')` → `navigate('/viewer')`
- `frontend/src/pages/FloorViewerPage.tsx` — встроить `RouteInputs`, `ZoomControls`, убрать инлайн route-разметку и старые zoom-кнопки, убрать заголовок минимапы
- `frontend/src/pages/FloorViewerPage.module.css` — переписать под токены §2 из [07-ui-spec.md](../07-ui-spec.md): чёрный хедер, белый фон, ширина 280, sharp corners
- `frontend/src/components/FloorViewer/BuildingFloorSectionSelector.module.css` — чёрные стрелки, sharp pills, обычный регистр лейблов
- `frontend/src/components/FloorViewer/FloorMinimap.module.css` — новые цвета active/highlight, чёрный stroke, sharp
- `frontend/src/components/MeshViewer/MeshViewer.tsx` — белый фон сцены, белый/убранный floorPlane, экспонировать `OrbitControls` через `ref`/`useImperativeHandle` для ZoomControls
- `frontend/src/hooks/useFloorViewer.ts` — добавить regex-валидацию формата комнат + helper text сообщение (ADR-3 фаза 1)

---

## Success Criteria

- [ ] Все 6 фаз завершены и проверены
- [ ] Бэкенд-тесты ([04-testing.md](../04-testing.md)): 10 кейсов проходят (7 API + 3 service)
- [ ] `python -m pytest backend/tests/ -v` — clean
- [ ] `python -m flake8 backend/app/api/buildings_hierarchy.py` — clean
- [ ] Фронт: `npm run build` + `npm run typecheck` (или `tsc --noEmit`) — clean
- [ ] Manual smoke (11 шагов из [04-testing.md §Frontend manual smoke](../04-testing.md)) — все ✓
- [ ] Визуал страницы совпадает со скриншотом: чёрный хедер, оранжевые active-пилюли, sharp corners, swap-кнопка, zoom +/− справа (acceptance из [07-ui-spec.md §6](../07-ui-spec.md))
- [ ] `scripts/check_dvfu_published.py` показывает ≥1 опубликованную секцию у ДВФУ; если нет — описаны шаги ручного посева
- [ ] Все 7 acceptance criteria из [README §Acceptance Criteria](../README.md) выполнены
