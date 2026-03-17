# 3d-builder-upgrade — Design

date: 2026-03-14
status: draft
research: ../../research/3d-builder-upgrade.md

## Business Context

Текущий 3D-строитель генерирует примитивную модель: все контуры маски вытягиваются
в стены одинаковой высоты, без пола по комнатам, без потолка, без дверных проёмов,
без материалов. Результат — серая монолитная масса, непригодная для демонстрации
в дипломной работе и не отражающая реальную структуру здания.

Апгрейд переводит генерацию на данные `VectorizationResult` (стены, комнаты, двери),
которые уже вычисляются в пайплайне, но игнорируются при построении 3D. Это даёт:
комнатно-ориентированный пол, дверные проёмы в стенах, потолок, цветовую маркировку
комнат по типу. На фронте — улучшенный вьюер с метками комнат и кнопкой экспорта GLB.

## Acceptance Criteria

1. 3D-модель строится из `VectorizationResult.walls` и `VectorizationResult.rooms`,
   а не из сырых контуров маски.
2. Пол генерируется как отдельный меш на каждую комнату (полигон из `room.polygon`).
3. Потолок генерируется как плоский меш на высоте `floor_height`.
4. Дверные проёмы вырезаются из стен (булева операция через Shapely/trimesh).
5. Каждый тип комнаты (`corridor`, `classroom`, `staircase`, `toilet`, `other`)
   получает свой цвет материала в GLB.
6. `DEFAULT_FLOOR_HEIGHT` унифицирован: 3.0 м везде (сейчас 1.5 м в mesh_builder).
7. Функции в `processing/` — чистые (без состояния, без `self`).
8. Фронтенд: `MeshViewer` показывает метки комнат (HTML overlay), кнопку скачать GLB.
9. Все новые функции покрыты тестами (processing + service).

## Documents

| File | View | Description |
|------|------|-------------|
| 01-architecture.md | Logical | C4 L1+L2+L3, module dependencies |
| 02-behavior.md | Process | Data flow + sequence diagrams |
| 03-decisions.md | Decision | Design decisions, risks, open questions |
| 04-testing.md | Quality | Test strategy + coverage mapping |
| 05-api-contract.md | API | HTTP API contract (изменения в ответе) |
| 06-pipeline-spec.md | Pipeline | Processing pipeline details |
| plan/ | Code | Phase-by-phase implementation plan |
