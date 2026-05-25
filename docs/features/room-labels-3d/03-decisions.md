# Design Decisions: Room Labels 3D

## Decisions

| # | Decision | Choice | Alternatives | Rationale |
|---|----------|--------|--------------|-----------|
| 1 | Позиционирование меток | 3D Html из @react-three/drei | 2D CSS overlay (RoomLabels.tsx) | Метки должны двигаться со сценой при вращении камеры; CSS overlay работает только для top-down вида |
| 2 | Источник позиций комнат | Бounding box загруженной модели (client-side) | Новый backend endpoint `/rooms_3d` | Bounding box достаточно точен; бэкенд не нужно менять; маппинг `lerp(box.min.x, box.max.x, cx)` прямой |
| 3 | Управление тогглом | Поднимаем состояние в родителя (StepView3D/EditPlanPage) | useState внутри MeshViewer | ViewerControls рендерится ВНЕ Canvas; нельзя из него напрямую управлять состоянием внутри Canvas; в родителе проще |
| 4 | Backend изменения | Нет изменений в бэкенде | Добавить room_labels в CalculateMeshResponse | Данные уже доступны через `/vectors`; во wizard rooms в state; бэкенд менять не нужно |
| 5 | Opacity блоков | 0.15 (мягкий) | 0.4 (как в route building) | При многих комнатах высокая opacity перекрывает стены, делает сцену нечитаемой |
| 6 | Место монтирования RoomOverlay | Внутри GlbModel/ObjModel | Как children MeshViewer | Нужен доступ к modelRef (для bounding box); children рендерятся за пределами Suspense и не имеют modelRef |
| 7 | Унифицированный тип RoomDisplay | types/roomDisplay.ts | Работать с RoomAnnotation/VectorRoom напрямую | Два разных источника данных (wizard/API); унификация позволяет RoomOverlay не знать об источнике |

## Risks

| Risk | Impact | Mitigation |
|------|--------|-----------|
| modelRef.current может быть null при первом useEffect | Med | Guard: `if (!modelRef.current) return`; bounding box вычисляется после mount |
| Bounding box не точно соответствует нормализованным координатам | Med | Допустимо: label будет в ~правильной зоне; точность ±5-10% визуально незаметна |
| Html из drei + много комнат = производительность | Low | Использовать `occlude` prop в Html для авто-скрытия скрытых объектов; или ограничить до 50 комнат |
| Y-flip/rotation_angle в маске влияет на маппинг | Low | Маппинг через bounding box работает для любого ориентированного GLB: берём min/max из самого Three.js объекта |
| Состояние showRooms не синхронизировано между StepView3D и ViewerControls | Low | ViewerControls получает `showRooms` и `onToggleRooms` как props — однонаправленный поток |

## Open Questions

- [x] Нужны ли изменения бэкенда? → Нет, данные доступны через `/vectors` или wizard state.
- [x] Работает ли паттерн modelRef в R3F? → Да, подтверждено в FloorPlane (MeshViewer.tsx:62-84).
- [x] Как обработать комнаты без имени? → Показывать room_type (уже делается в существующем RoomLabels.tsx:27).
- [ ] Нужны ли Room Labels в FloorViewerPage (публичный просмотр)? → Пока НЕ в scope данной фичи.
- [ ] Нужен ли клик по комнате (highlight on hover)? → Пока НЕ в scope; может быть отдельной фичей.
