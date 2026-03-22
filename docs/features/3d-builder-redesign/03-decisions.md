# Design Decisions: 3D Builder Redesign

## Decisions

| # | Decision | Choice | Alternatives | Rationale |
|---|----------|--------|--------------|-----------|
| 1 | Где хранить цветовые константы | `mesh_generator.py` (рядом с `WALL_COLOR`) | Отдельный `colors.py`, в `mesh_builder.py` | `mesh_generator.py:43` уже содержит `WALL_COLOR` и `ROOM_COLORS` — логично расширить там же |
| 2 | Как создавать wall caps | `trimesh.creation.extrude_polygon(poly, height=0.01)` + сдвиг на `floor_height` | earcut вручную, `mapbox_earcut` | Trimesh уже используется, гарантирует корректную триангуляцию, нет новых зависимостей |
| 3 | Пол в GLB или в Three.js сцене | Пол в GLB (часть меша) | Оставить `FloorPlane` компонент | Единый источник правды — всё в GLB. Vertex colors пола совпадают с остальными. Тени работают корректно |
| 4 | Что делать с `FloorPlane` компонентом | Оставить для OBJ fallback, убрать из GLB-пути | Удалить полностью | OBJ формат не поддерживает vertex colors — `FloorPlane` нужен как fallback |
| 5 | Vertex colors vs uniform material | Использовать vertex colors из GLB | Оставить `deleteAttribute('color')` + uniform | Vertex colors дают разные цвета для стен/крышек/пола в одном меше без нескольких материалов |
| 6 | SSAO постобработка | Не добавлять в этом тикете | `@react-three/postprocessing` | Требует новой зависимости, замедляет рендеринг. Тикет фокусируется на цветах и освещении |
| 7 | Освещение | Снизить ambient до 0.5, directional до 1.0 | Оставить текущее | Текущий ambient 0.7 + directional 1.2 = пересвет при тёмных стенах #4A4A4A |

## Risks

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Старые GLB файлы (без пола/крышек) | Med — пол не виден до перегенерации | Старые GLB нужно перегенерировать через UI. `FloorPlane` убран из GLB-пути — fallback не работает для старых файлов |
| `extrude_polygon` с `height=0.01` может давать z-fighting с боковыми стенами | Low — крышки на `floor_height`, стены от 0 до `floor_height` | Крышки сдвинуты на `floor_height + 0.001` чтобы избежать z-fighting |
| Vertex colors в OBJ формате не поддерживаются Three.js OBJLoader | Med — OBJ модели будут без цветов | OBJ путь оставляет `applyMapMaterials` с uniform цветом как fallback |
| Увеличение размера GLB (добавляем пол + крышки) | Low — ~10-15% больше вершин | Приемлемо для indoor-карты |

## Open Questions

- [x] Нужен ли SSAO? — Нет, в этом тикете. Отдельный тикет если понадобится.
- [x] Удалять ли `FloorPlane` компонент? — Нет, оставить для OBJ fallback.
- [ ] Нужно ли перегенерировать существующие GLB файлы после изменений бэкенда? — Да, вручную через UI или скрипт миграции (вне scope этого тикета).
