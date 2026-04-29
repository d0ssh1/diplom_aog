# test-route — Design

date: 2026-04-29
status: draft (auto-approved by user "continue work")
scope: frontend

## Business Context

После того как пользователь оцифровал несколько этажей здания и расставил межэтажные
переходы (FloorTransition), необходимо отдельная **страница тестирования** —
чтобы быстро проверять корректность мультиэтажной навигации без захода в полный
wizard. Страница позволяет:

- выбрать здание из списка,
- выбрать этаж "От" и этаж "До",
- выбрать комнаты на каждом этаже,
- увидеть в 3D-вьювере путь между ними с золотыми **T-маркерами телепортов**.

Это инструмент валидации разметки переходов и поиска ошибок в графе навигации.

## Acceptance Criteria

1. Доступ по маршруту `/admin/route-test` (защищённая зона `/admin`).
2. На странице есть селектор здания. После выбора подгружаются все этажи здания
   через `GET /reconstruction/buildings/{id}/reconstructions`.
3. `RouteBottomBar` работает в `multifloorMode=true` — два селектора этажей
   ("Этаж от", "Этаж до") + два селектора комнат.
4. Список комнат каждого этажа загружается из
   `GET /reconstruction/reconstructions/{id}/vectors` (поле `rooms`).
5. После выбора всех 4 параметров (этаж от, комната от, этаж до, комната до)
   автоматически вызывается `POST /navigation/multifloor-route` и результат
   отображается в `MeshViewer` через `MultifloorNavigationPath`.
6. T-маркеры переходов рендерятся золотым цветом с подписью имени перехода
   (логика уже реализована в `MultifloorNavigationPath`).
7. В `MeshViewer` показывается GLB/OBJ модель этажа "От" (как опорная сцена).
8. На ошибки `no_path`/`error` показывается HUD-сообщение.
9. TypeScript strict — никаких `any`. Все Three.js ресурсы — с `dispose()`.

## Documents

| File | View | Description |
|------|------|-------------|
| 01-architecture.md | Logical | Component-level structure |
| 02-behavior.md | Process | Sequence diagram + state flow |
| 03-decisions.md | Decision | Trade-offs и open issues |
| 04-testing.md | Quality | Тест-стратегия (manual smoke + tsc) |
| plan/ | Code | Phase plan |

## Scope

Frontend-only. Все нужные backend-эндпойнты уже существуют:
- `GET /buildings`
- `GET /reconstruction/buildings/{id}/reconstructions`
- `GET /reconstruction/reconstructions/{id}` (mesh URL)
- `GET /reconstruction/reconstructions/{id}/vectors` (rooms)
- `POST /navigation/multifloor-route`

Так как новых endpoints нет, файл `05-api-contract.md` не нужен.
Pipeline нет — `06-pipeline-spec.md` тоже не нужен.
