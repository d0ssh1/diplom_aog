# Тикет: refactor-core — Рефакторинг архитектуры

## Описание

Привести существующую кодовую базу в соответствие со стандартами проекта (prompts/architecture.md). Сейчас бизнес-логика, работа с БД и обработка изображений перемешаны. Нужно разделить по слоям.

## Почему это нужно

Без чистой архитектуры каждая следующая фича будет строиться на кривом фундаменте. Агенты при research будут находить паттерны, противоречащие промптам, что создаёт шум в контексте и снижает качество генерации.

## Что сейчас (AS IS)

```
backend/app/
├── api/
│   ├── reconstruction.py    ← 329 строк, содержит бизнес-логику
│   ├── upload.py             ← прямые вызовы processing/
│   └── navigation.py
├── processing/
│   ├── reconstruction_service.py  ← СОЗДАЁТ DB-сессии, Singleton
│   ├── mask_service.py            ← класс с settings, file I/O
│   ├── binarization.py            ← класс BinarizationService (не подключён)
│   ├── contours.py                ← класс ContourService (не подключён)
│   ├── mesh_generator.py          ← класс MeshGeneratorService
│   └── navigation.py              ← A* алгоритм
├── core/
│   ├── config.py
│   ├── database.py
│   ├── security.py
│   └── img_logging.py       ← свой logger вместо стандартного logging
├── models/                   ← Pydantic модели (request/response)
└── db/
    └── models/               ← ORM модели
```

### Конкретные нарушения:

1. `processing/reconstruction_service.py` — импортирует `async_session_maker`, создаёт DB-сессии, содержит CRUD-операции. Singleton `reconstruction_service = ReconstructionService()` на уровне модуля.
2. `processing/mask_service.py` — класс `MaskService` с `self.upload_dir = settings.UPLOAD_DIR`. Должна быть чистая функция.
3. `api/reconstruction.py` — `from app.processing.mask_service import MaskService` внутри функции. Ручная трансформация данных (crop_dict).
4. Нет `services/` — бизнес-логика в processing/ и api/
5. Нет `db/repositories/` — прямые session-вызовы в processing/
6. Нет `core/exceptions.py` — ошибки не типизированы
7. Нет `backend/tests/` — ноль тестов
8. `print()` вместо `logging` в reconstruction_service.py, mesh_generator.py

## Что должно стать (TO BE)

```
backend/app/
├── api/
│   ├── reconstruction.py    ← ТОНКИЙ: validate → service.method() → response
│   ├── upload.py             ← ТОНКИЙ
│   ├── navigation.py
│   └── deps.py               ← НОВЫЙ: FastAPI Depends для DI
├── services/                  ← НОВЫЙ
│   ├── reconstruction_service.py  ← оркестрация: repo + processing
│   └── mask_service.py            ← оркестрация: file I/O + processing
├── processing/
│   ├── preprocessor.py       ← ЧИСТАЯ ФУНКЦИЯ: preprocess_image(ndarray) → ndarray
│   ├── vectorizer.py         ← ЧИСТАЯ ФУНКЦИЯ: find_contours(ndarray) → list
│   ├── mesh_builder.py       ← ЧИСТАЯ ФУНКЦИЯ: build_mesh(contours) → trimesh
│   └── navigation.py         ← ЧИСТАЯ ФУНКЦИЯ: a_star(graph, start, end) → path
├── core/
│   ├── config.py
│   ├── database.py
│   ├── security.py
│   ├── logging_config.py     ← стандартный logging
│   └── exceptions.py         ← НОВЫЙ: ImageProcessingError, FloorPlanNotFoundError
├── models/
│   ├── requests.py           ← Pydantic request модели
│   ├── responses.py          ← Pydantic response модели
│   └── domain.py             ← НОВЫЙ: FloorPlan, Wall, Room, Point2D, VectorizationResult
└── db/
    ├── models/               ← ORM модели (без изменений)
    └── repositories/         ← НОВЫЙ
        └── reconstruction_repo.py  ← CRUD через async session
```

## Acceptance Criteria

1. ✅ `processing/` не содержит ни одного импорта из `api/`, `db/`, `core/config.py`
2. ✅ `api/` роутеры не содержат бизнес-логику — только validate → service → response
3. ✅ Все DB-операции в `db/repositories/`
4. ✅ `core/exceptions.py` создан с `ImageProcessingError`, `FloorPlanNotFoundError`
5. ✅ `models/domain.py` создан с `FloorPlan`, `Wall`, `Point2D`, `VectorizationResult`
6. ✅ Все `print()` заменены на `logging.getLogger(__name__)`
7. ✅ `backend/tests/` создан с минимум 5 тестами (по одному на каждую чистую функцию в processing/)
8. ✅ Существующий функционал НЕ сломан — загрузка → маска → 3D всё ещё работает
9. ✅ `python -m pytest tests/ -v` проходит
10. ✅ `python -m flake8 app/ --max-line-length=100` проходит

## Чего НЕ нужно делать

- НЕ переписывать алгоритмы (Otsu, morphology, contour detection остаются как есть)
- НЕ менять API контракты (фронтенд не должен ломаться)
- НЕ менять ORM модели и миграции
- НЕ трогать фронтенд (это отдельная фича)
- НЕ подключать BinarizationService и ContourService к пайплайну (это vectorization-pipeline)

## Приоритет: КРИТИЧЕСКИЙ

Все остальные фичи зависят от этого рефакторинга.
