# Refactor Core — Design

date: 2026-03-13
status: draft
ticket: ../../tickets/00-refactor-core.md

## Business Context

Кодовая база Diplom3D нарушает все принципы слоёной архитектуры: бизнес-логика, доступ к БД и обработка
изображений перемешаны в одном модуле `processing/`. Это создаёт два критических последствия.

Первое — **невозможность тестирования**: функции обработки изображений невозможно протестировать без
поднятия реальной БД, потому что `processing/reconstruction_service.py` создаёт `async_session_maker`
внутри методов, а `processing/mask_service.py` читает `settings.UPLOAD_DIR` в `__init__`.

Второе — **технический долг при расширении**: каждая следующая фича (floor-editor, pathfinding, etc.)
будет строиться на кривом фундаменте, наследуя неправильные паттерны. Агенты при research находят
паттерны, противоречащие промптам, что снижает качество генерации.

Рефакторинг вводит три новых слоя (`services/`, `db/repositories/`, `core/exceptions.py`) и выделяет
чистые функции из `processing/`. Внешний API-контракт не меняется — только внутреннее устройство.

## Scope

- **Backend only** — фронтенд не трогается
- **No API contract changes** — endpoints и JSON-схемы остаются теми же
- **No algorithm changes** — Otsu, morphology, contour detection, trimesh не переписываются
- **BinarizationService и ContourService** — не подключаются к pipeline (это отдельная фича)

## Acceptance Criteria

1. `processing/` не содержит ни одного импорта из `api/`, `db/`, `core/config.py`
2. `api/` роутеры не содержат бизнес-логику — только validate → service → response
3. Все DB-операции в `db/repositories/`
4. `core/exceptions.py` создан с `ImageProcessingError`, `FloorPlanNotFoundError`
5. `models/domain.py` создан с доменными моделями
6. Все `print()` заменены на `logging.getLogger(__name__)`
7. `backend/tests/` создан с минимум 5 тестами (по одному на каждую чистую функцию в `processing/`)
8. Существующий функционал НЕ сломан — загрузка → маска → 3D всё ещё работает
9. `python -m pytest tests/ -v` проходит
10. `python -m flake8 app/ --max-line-length=100` проходит

## Documents

| File | View | Description |
|------|------|-------------|
| 01-architecture.md | Logical | C4 L1+L2+L3, module dependencies, AS IS vs TO BE |
| 02-behavior.md | Process | Data flow + sequence diagrams для каждого use case |
| 03-decisions.md | Decision | Design decisions, risks, open questions |
| 04-testing.md | Quality | Test strategy + coverage mapping |
| plan/ | Code | Phase-by-phase implementation plan |
