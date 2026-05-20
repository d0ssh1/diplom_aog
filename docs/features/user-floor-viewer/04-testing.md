# Testing Strategy: user-floor-viewer

## Test Rules

Следуем [prompts/testing.md](prompts/testing.md): AAA-структура (Arrange / Act / Assert), один логический assert на тест, имена `test_{unit}_{condition}_{expected}`. Бэкенд — pytest + httpx AsyncClient. Фронт — vitest + RTL (если в проекте настроен; иначе ограничиваемся manual smoke).

## Test Structure

```
backend/tests/
└── api/
    └── test_buildings_hierarchy_api.py   (новый или дополнить существующий)

frontend/src/
├── hooks/__tests__/useFloorViewer.test.ts   (опционально, если RTL/vitest есть)
└── (manual smoke перечислен ниже)
```

## Coverage Mapping

### Backend — API

| Endpoint | Сценарий | Тест |
|---|---|---|
| `GET /api/v1/buildings?published=true` | без `Authorization` → 200, тело — список с полями `code`, `floors[].sections[].mesh_url_glb` | `test_list_buildings_published_no_auth_returns_200` |
| `GET /api/v1/buildings?published=true` | с битым `Authorization: Bearer xxx` → 200 (игнор) | `test_list_buildings_published_invalid_token_returns_200` |
| `GET /api/v1/buildings?published=true` | с валидным токеном → 200, тот же ответ что и без токена | `test_list_buildings_published_valid_token_returns_200_same_body` |
| `GET /api/v1/buildings?published=false` | без `Authorization` → 401 | `test_list_buildings_admin_no_auth_returns_401` |
| `GET /api/v1/buildings` (default) | без `Authorization` → 401 | `test_list_buildings_default_no_auth_returns_401` |
| `GET /api/v1/buildings?published=false` | с валидным токеном → 200 | `test_list_buildings_admin_valid_token_returns_200` |
| `POST /api/v1/navigation/multifloor-route` | без `Authorization`, валидный body → 200 (регресс) | `test_multifloor_route_no_auth_returns_200` |

### Backend — Service (регрессия фильтра публикации)

| Метод | Сценарий | Тест |
|---|---|---|
| `BuildingService.list_published()` | здание без секций с готовой реконструкцией → не попадает в выдачу | `test_list_published_excludes_building_without_done_reconstruction` |
| `BuildingService.list_published()` | здание с одной секцией Done → попадает, в `floors[].sections[]` только эта секция | `test_list_published_returns_building_with_done_section` |
| `BuildingService.list_published()` | в ответе нет приватных полей (`address`, etc — если они когда-либо там были) | `test_list_published_response_omits_private_fields` |

### Frontend — Hook (если vitest сконфигурирован; иначе manual)

| Метод | Сценарий | Тест |
|---|---|---|
| `useFloorViewer` mount | вызывает `buildingsApi.listPublished()`, auto-select first building/floor/section | `test_useFloorViewer_mount_loads_catalog_and_selects_first` |
| `useFloorViewer.selectBuilding` | при смене корпуса auto-сохраняет номер этажа, если такой есть | `test_useFloorViewer_selectBuilding_preserves_floor_number` |
| `useFloorViewer.planRoute` | разные корпуса → setRouteError, без HTTP-вызова | `test_planRoute_different_buildings_sets_error` |
| `useFloorViewer.planRoute` | валидные коды → POST вызван, `highlightedSectionIds` обновлён | `test_planRoute_valid_calls_api_and_sets_highlights` |
| `useFloorViewer.planRoute` | сервер вернул `status='no_path'` → setRouteError, маршрут не рисуется | `test_planRoute_no_path_sets_error` |

### Frontend — Component / Page (manual smoke)

Минимальный sheet ручного прогона (если automated UI-тестов нет):

| Шаг | Ожидание |
|---|---|
| Открыть `/` в incognito | Видна главная, сетка-фон, поле поиска |
| Кликнуть в поле поиска, увидеть выпадашку с «ДВФУ», кликнуть | URL = `/viewer`, без редиректа на `/login` |
| Через секунду | Видны селекторы Корпус/Этаж/Отсек, минимапа, 3D-сцена грузится |
| Клик стрелка «>» на «Корпус» | Активный код корпуса меняется, 3D-сцена меняется на новый GLB |
| Клик по другому отсеку в минимапе | Подсветка переключается, 3D-сцена меняется |
| Ввести «D304» и «D712» (валидные коды демо-БД) в маршрут, клик «Построить маршрут» | Поверх 3D рисуется оранжевый путь, в минимапе подсвечиваются отсеки маршрута |
| Ввести «X999» (несуществующая) → клик | Toast «Не удалось построить маршрут» |
| Ввести «D304» и «X999» (разные корпуса) → клик | Toast «Маршрут только в пределах одного здания» |
| Кликнуть «← ДВФУ» в header | Возврат на `/` |
| Открыть DevTools → Network → главная и `/viewer` запросы | На `GET /buildings?published=true` нет `Authorization`, статус 200 |
| Залогиниться админом → открыть `/viewer` | Тот же контент, `Authorization` есть в запросе, статус 200 |

### Manual sanity (после посева данных)

| Команда | Ожидание |
|---|---|
| `python scripts/check_dvfu_published.py` | Печатает «Building ДВФУ (code=...) — floors: N, published sections: M», `M >= 1` |

## Test Count Summary

| Layer | Tests |
|---|---|
| Backend API | 7 |
| Backend Service | 3 |
| Frontend Hook (если есть vitest) | 5 |
| Frontend manual smoke | 11 (чек-лист) |
| **TOTAL automated** | **15** (или **10** если vitest нет) |
