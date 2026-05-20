# Design Decisions: user-floor-viewer

## Decisions

| # | Decision | Choice | Alternatives | Rationale |
|---|---|---|---|---|
| ADR-1 | Как снять auth с публичной ветки `GET /buildings?published=true` | Заменить обязательную `Depends(security)` на необязательную `Optional[HTTPAuthorizationCredentials] = Depends(HTTPBearer(auto_error=False))`. Если `published=true` — auth не требуется; если `published=false` — требуется, иначе 401. | (a) Завести отдельный публичный роутер `/api/v1/public/buildings`; (b) Удалить `Depends(security)` полностью и валидировать только в ветке `published=false`. | Вариант с `auto_error=False` минимально инвазивен ([buildings_hierarchy.py:42-55](backend/app/api/buildings_hierarchy.py:42) — одна функция, одна правка), сохраняет URL для фронта (`buildingsApi.listPublished()` менять не нужно), не плодит дубликаты. Отдельный публичный роутер был бы чище, но удвоит код. |
| ADR-2 | Что делать с 401-редиректом на `/login` для публичных страниц | Оставить редирект как есть, но публичные эндпоинты не должны возвращать 401 — это исключает кейс. Дополнительно: в `apiService.ts` interceptor добавить whitelist URL, для которых 401 не редиректит (но это OUT OF SCOPE, делаем только если выяснится регресс). | (a) Завести отдельный axios-instance без auth-интерсептора для public-вызовов; (b) Проверять `window.location.pathname` в интерсепторе. | После ADR-1 публичные ручки 401 не вернут. Если хром-кэш отдал старую `auth_token` после её протухания, interceptor подставит её — бэк проигнорирует (`auto_error=False`). Минимизируем правки. |
| ADR-3 | UX полей «Начальная точка / Конечная точка» | **Фаза 1 (MVP):** оставить text-input, но добавить под полем helper text «Например: D304» и валидацию формата (regex `^[A-Z]+\d+$`) с инлайн-сообщением об ошибке. **Фаза 2 (опционально):** заменить на combobox с автокомплитом из реестра комнат текущего здания (источник — `reconstructionApi.getReconstructionById(id)` → vectors.rooms, собираем по всем секциям здания). | (a) Сразу делать combobox (больше работы, нужен реестр всех комнат здания); (b) Оставить как есть. | Главная цель тикета — починить публичный доступ. UX-улучшение для ввода комнат — приятный бонус. Фаза 1 решает проблему «пользователь не знает формат» за минимум работы. Фаза 2 выносится отдельным под-планом, реализуется, если позволяет время. |
| ADR-4 | Что делать с `navigate('/map')` ↔ `/viewer` | Поправить **PublicHomePage**: `navigate('/map')` → `navigate('/viewer')`. Регистрировать `/map` как alias **не** будем. | Зарегистрировать `/map` в [App.tsx](frontend/src/App.tsx) как алиас на `FloorViewerPage`. | Один источник правды для URL. `/viewer` уже зарегистрирован и используется. `/map` — артефакт неконсистентности, не должен оставаться. |
| ADR-5 | Как проверять наличие данных ДВФУ | На этапе implementation: написать одноразовый sanity-скрипт (`scripts/check_dvfu_published.py`) который читает БД, печатает список опубликованных зданий с количеством готовых секций. Если ДВФУ нет — задокументировать в README шаги ручного посева через admin-UI (`/admin/buildings`). | Автоматический seed-fixture. | Seed для прод-данных — отдельная большая задача (нужны реальные планы, OCR, реконструкции). Sanity-check + ручной посев — реалистичный путь для ВКР-демо. |
| ADR-6 | Тесты в публичной ручке | Pytest-кейсы для (a) `published=true` без `Authorization` → 200, (b) `published=true` с битым токеном → 200 (игнор), (c) `published=false` без `Authorization` → 401. | Только manual smoke. | Дешёвый регресс-набор; защищает от случайного повторного добавления `Depends(security)`. |

## Risks

| Risk | Impact | Mitigation |
|---|---|---|
| В БД нет опубликованного ДВФУ с готовой секцией → главная подсказка ведёт в пустую страницу | High | Sanity-скрипт перед демо; задокументированные шаги посева (ADR-5). |
| Снятие auth с `published=true` может раскрыть приватные данные | Med | `list_published()` уже фильтрует по `reconstruction.status==Done` и отдаёт только публичные поля (`code`, `mesh_url_glb`). Не отдаёт `address`, `user_id`, internal id'ы reconstruction-ов помимо нужных для маршрута. Дополнительно: review [building_service.py:90](backend/app/services/building_service.py:90) в Phase 1. |
| Сценарий маршрута зависит от наличия `FloorTransition` в БД — без них cross-floor routing вернёт `no_path` | Med | Документируем в README; в админке `/admin/transitions` уже есть UI. |
| GLB-файлы крупные, на медленном канале «открыть ДВФУ» подвисает | Low | Существующий Suspense в [MeshViewer](frontend/src/components/MeshViewer/MeshViewer.tsx) показывает заглушку. OUT OF SCOPE: оптимизация мэшей. |
| `useFloorViewer.planRoute` парсит код корпуса из строки — после ADR-3 фазы 1 (валидация regex) формат остаётся, фаза 2 (combobox) поменяет контракт | Low | Фаза 2 — отдельный план; контракт `planRoute(fromRef, toRef)` остаётся, меняется только тип `fromRef`. |
| Misaligned `Building.code` — на скриншоте «Корпус D», но в БД код может быть длиннее (5-char unique) | Low | UI уже рендерит `code` как есть. Если коды длинные — карусель сжимает текст. Доработка размеров — OUT OF SCOPE. |

## Open Questions

- [x] Делать ли публичный роутер `/api/v1/public/*` отдельно? — Нет, ADR-1.
- [x] Регистрировать ли `/map` как alias? — Нет, ADR-4.
- [x] Combobox или text-input для комнат в MVP? — text-input + валидация, ADR-3 фаза 1.
- [ ] Нужен ли rate-limit на публичные ручки? — Открыто. Защита от ботов вне scope; обсудить отдельно, если деплоится в открытый интернет.
- [ ] Кэшировать ли `list_published()` (TTL 30s)? — Открыто. Если данных мало, не критично; можно отложить.
