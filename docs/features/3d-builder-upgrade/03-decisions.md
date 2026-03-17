# Design Decisions: 3d-builder-upgrade

## Decisions

| # | Decision | Choice | Alternatives | Rationale |
|---|----------|--------|--------------|-----------|
| 1 | Источник геометрии для 3D | `VectorizationResult` (walls/rooms/doors) | Сырые контуры маски (текущий подход) | `VectorizationResult` уже вычислен и сохранён в DB (`vectorization_data`). Использование его даёт комнатно-ориентированную геометрию без повторной обработки маски. |
| 2 | Рефакторинг `MeshGeneratorService` | Заменить класс на чистые функции в `processing/mesh_generator.py` | Оставить класс, добавить новые методы | Нарушает правило `processing/` (pure functions, no state). Класс держит `_mesh_id` и `output_dir` — это сервисная ответственность. |
| 3 | Дверные проёмы | Булева разность Shapely: `wall_polygon.difference(door_box)` | Не вырезать (упростить), вырезать через trimesh boolean | Shapely 2D boolean надёжнее и быстрее trimesh 3D boolean. Дверной проём = прямоугольник по `door.position` + `door.width`. |
| 4 | Материалы/цвета | Vertex colors в trimesh (`mesh.visual.vertex_colors`) | Отдельные материалы PBR, текстуры | Vertex colors экспортируются в GLB без внешних файлов. PBR-материалы избыточны для дипломной работы. |
| 5 | Высота этажа | Унифицировать на `settings.DEFAULT_FLOOR_HEIGHT = 3.0` | Оставить 1.5 м в mesh_builder | Несоответствие между `config.py:34` (3.0) и `mesh_builder.py:17` (1.5) — явный баг. Единый источник истины — `settings`. |
| 6 | Фронтенд: метки комнат | HTML overlay поверх Canvas (абсолютное позиционирование) | Three.js `Sprite` с текстурой, CSS2DRenderer | HTML overlay проще, не требует дополнительных Three.js модулей, легко стилизуется. Координаты проецируются через `camera.project()`. |
| 7 | Экспорт GLB с фронта | Прямая ссылка на уже сгенерированный GLB файл | Генерировать на лету через three.js GLTFExporter | GLB уже есть на сервере. Прямая ссылка — нулевая сложность. |
| 8 | Новый API endpoint | Не добавлять новых эндпоинтов | Добавить `GET /reconstructions/{id}/mesh-metadata` | Метаданные (комнаты с цветами) можно вернуть в существующем `GET /reconstructions/{id}` расширив `CalculateMeshResponse`. Меньше поверхности API. |

## Risks

| Risk | Impact | Mitigation |
|------|--------|-----------|
| `VectorizationResult` может быть `None` для старых реконструкций | High | Fallback на сырые контуры маски (текущий путь) если `vectorization_data` пуст |
| Shapely boolean difference может давать невалидные полигоны | Med | `.buffer(0)` после операции + проверка `is_valid`; при ошибке — стена без проёма |
| Vertex colors не поддерживаются всеми GLB-вьюерами | Low | Протестировать в React Three Fiber; fallback — face colors |
| Большие планы (>500 контуров) — медленная генерация | Med | Ограничение `min_area` уже есть в `vectorizer.py:find_contours`; добавить таймаут в сервисе |
| Координаты комнат в `VectorizationResult` нормализованы [0,1], а `mesh_generator` работает в пикселях | High | Денормализация в сервисе перед передачей в processing: `x * image_width` |

## Open Questions

- [x] Нужен ли отдельный эндпоинт для метаданных комнат? — Нет, расширяем существующий ответ.
- [x] Какая высота этажа правильная? — 3.0 м (из `config.py:34`, архитектурный стандарт).
- [ ] Нужна ли поддержка многоэтажных моделей в этом апгрейде? — Нет, это `building-assembly` фича.
- [ ] Вырезать ли дверные проёмы если `doors` список пуст? — Нет, просто пропустить шаг.
