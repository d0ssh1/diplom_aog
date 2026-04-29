# Testing Strategy: test-route

Frontend-only feature. В проекте нет настроенного React unit-test runner
(jest/vitest нет в зависимостях). Тестовая стратегия — **TypeScript strict
build + ручной smoke-test**.

## Automated Gates

| Gate | Command | Pass Criterion |
|------|---------|----------------|
| TypeScript | `tsc --noEmit` | 0 errors |
| Lint | `eslint frontend/src` | 0 errors |
| Production build | `npm run build` (vite) | Bundle создан |

## Manual Smoke Test (запускается человеком)

| # | Шаг | Ожидание |
|---|-----|----------|
| 1 | Открыть `/admin/route-test` | Страница рендерится, селектор зданий заполнен |
| 2 | Выбрать здание с >=2 этажами | Селекторы "Этаж от"/"Этаж до" заполнены, MeshViewer показывает 3D от-этажа |
| 3 | Выбрать `from_room` и `to_room` на разных этажах | Авто-запрос, появляются золотые T-маркеры на месте телепорта |
| 4 | Выбрать комнаты на одном этаже (от==до по этажам) | Один сегмент пути, без T-маркеров |
| 5 | Выбрать здание без этажей | Селекторы пустые, MeshViewer не падает |
| 6 | Backend возвращает `no_path` | HUD "Маршрут не найден" |
| 7 | Резко переключать здания | Нет flicker старых маршрутов; нет ошибок в консоли |
| 8 | Свернуть/развернуть окно | OrbitControls / canvas не падают |
| 9 | Размонтировать страницу (уйти на /admin) | В DevTools Performance — нет утечек GPU геометрий (геометрии освобождены) |

## Test Count

| Layer | Tests |
|-------|-------|
| Unit (auto) | 0 (нет runner) |
| TypeScript strict | 1 gate |
| Lint | 1 gate |
| Manual smoke | 9 шагов |
