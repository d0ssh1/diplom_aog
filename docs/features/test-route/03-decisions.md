# Design Decisions: test-route

## Decisions

| # | Decision | Choice | Alternatives | Rationale |
|---|----------|--------|--------------|-----------|
| 1 | Где живёт состояние | Один хук `useRouteTest` | Redux/zustand/контекст | Изолированная страница, хук достаточен — соответствует `frontend_style.md` (вся логика в хуках) |
| 2 | Какой mesh показывать | Mesh **этажа "От"** | Все этажи стопкой / переключатель | Минимально жизнеспособно, T-маркеры из `MultifloorNavigationPath` уже несут информацию о переходе |
| 3 | Как загрузить rooms | `reconstructionApi.getReconstructionVectors(id).rooms` | Отдельный endpoint | Этот метод уже существует и используется в wizard — нет дублирования |
| 4 | Как загрузить список этажей | `reconstructionApi.getReconstructionsByBuilding(id)` | `transitionsApi.listBuildings()` (там есть floors) | Первый возвращает полный список с `url`/`preview_url`/`status` — нужно для проверки готовности |
| 5 | Re-use `RouteBottomBar` с `multifloorMode=true` | Да | Свой компонент | Компонент уже поддерживает мультиэтажный режим и автозапуск через эффект |
| 6 | Триггер запроса маршрута | Авто, через эффект в `RouteBottomBar` | Кнопка "Найти" | Уже встроено — используем как есть для консистентности с wizard StepView3D |
| 7 | Имя маршрута | `/admin/route-test` | `/admin/test-route`, `/route-test` | Соответствует существующему namespace `/admin/...` |
| 8 | Защита маршрута | Доступ только в `/admin/*` (как `EditPlanPage`) | Открытый | Использует тот же простой подход — без выделенного `<ProtectedRoute>` (его пока нет в проекте) |
| 9 | Фильтр rooms | Все rooms из vectors независимо от типа | Только classroom | Тестировщику нужны и коридоры, и санузлы для проверки графа |

## Risks

| Risk | Impact | Mitigation |
|------|--------|-----------|
| `getReconstructionVectors` падает 404 если vectors не сохранены | Med | Try/catch с пустым массивом rooms + HUD-предупреждение |
| Race-condition при быстром переключении этажей | Med | `useRef`-токен последнего запроса; игнор устаревших |
| GLB не готов (status≠ready) | Med | Проверка `meshData.url` — placeholder вместо MeshViewer |
| Three.js утечки при unmount | Med | `MeshViewer` уже корректно делает dispose, `MultifloorNavigationPath` тоже |

## Open Questions

- [x] Нужен ли селектор "что показывать" (mesh от-этажа vs обоих)? **Нет** — стартуем с MVP "только от-этаж".
- [x] Нужно ли подсвечивать комнаты на 3D? **Нет** — `MultifloorNavigationPath` уже передаёт `fromRoom3D`/`toRoom3D` и рисует подсветку через `NavigationPath`.
- [x] Нужна ли кнопка "Назад" на странице? **Да** — `RouteBottomBar` требует `onPrev` — навигация в `/admin`.
