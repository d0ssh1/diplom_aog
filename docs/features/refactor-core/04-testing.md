# Testing Strategy: Refactor Core

## Test Rules (per prompts/testing.md)

- Паттерн AAA: Arrange → Act → Assert
- Именование: `test_{что}_{условие}_{ожидаемый результат}`
- Processing тесты **не используют БД** — только numpy/cv2
- Service тесты **мокают репозитории** — тестируем логику, не DB
- API тесты используют `AsyncClient(app=app, base_url="http://test")`
- Каждая новая функция в `processing/` → минимум 2 теста (happy path + error)
- `assert` с сообщением для неочевидных проверок

## Test Structure

```
backend/
└── tests/
    ├── conftest.py                    ← AsyncClient, in-memory DB, auth fixtures
    ├── assets/
    │   └── simple_floor_plan.jpg      ← тестовый план (можно синтетический)
    ├── test_architecture.py           ← структурный тест: processing/ не импортирует из api/db/
    ├── processing/
    │   ├── conftest.py                ← numpy image fixtures
    │   ├── test_preprocessor.py       ← тесты preprocess_image()
    │   ├── test_vectorizer.py         ← тесты find_contours()
    │   ├── test_mesh_builder.py       ← тесты build_mesh()
    │   └── test_navigation.py         ← тесты a_star()
    ├── services/
    │   ├── test_mask_service.py       ← тесты MaskService (мок FS)
    │   └── test_reconstruction_service.py ← тесты ReconstructionService (мок repo)
    ├── db/
    │   └── test_reconstruction_repo.py ← интеграционный тест репозитория (in-memory SQLite)
    └── api/
        ├── test_upload.py             ← тесты upload endpoints
        └── test_reconstruction.py     ← тесты reconstruction endpoints
```

---

## Coverage Mapping

### Processing Function Coverage

| Функция | Правило | Test Name |
|---------|---------|-----------|
| `preprocess_image(image, crop=None, rotation=0)` | Возвращает бинарный ndarray (uint8, values 0/255) | `test_preprocess_valid_bgr_returns_binary_uint8` |
| `preprocess_image(image, crop=None, rotation=0)` | Поднимает `ImageProcessingError` на пустом ndarray | `test_preprocess_empty_image_raises_error` |
| `preprocess_image(image, crop={...}, rotation=0)` | Корректно кропает по normalized rect | `test_preprocess_with_crop_returns_cropped_shape` |
| `preprocess_image(image, crop=None, rotation=90)` | Корректно вращает на 90° | `test_preprocess_rotation_90_transposes_shape` |
| `find_contours(mask)` | На простом прямоугольнике возвращает ≥1 контур | `test_find_contours_rectangle_returns_contour` |
| `find_contours(mask)` | На пустой маске (все нули) возвращает пустой список | `test_find_contours_empty_mask_returns_empty` |
| `build_mesh(contours, image_height, floor_height, pixels_per_meter)` | Возвращает non-empty trimesh.Trimesh | `test_build_mesh_valid_contours_returns_mesh` |
| `build_mesh(contours, ...)` | На пустом списке контуров поднимает `ImageProcessingError` | `test_build_mesh_empty_contours_raises_error` |
| `a_star(graph, start_id, end_id)` | На простом графе из 3 узлов возвращает путь | `test_a_star_simple_graph_returns_path` |
| `a_star(graph, start_id, end_id)` | На несвязном графе возвращает None / поднимает ошибку | `test_a_star_disconnected_graph_returns_none` |

### Structural / Architecture Coverage

| Что проверяется | Правило | Test Name |
|-----------------|---------|-----------|
| Импорты `processing/preprocessor.py` | Нет импортов из `app.api`, `app.db`, `app.core.config` | `test_preprocessor_has_no_forbidden_imports` |
| Импорты `processing/vectorizer.py` | Нет импортов из `app.api`, `app.db`, `app.core.config` | `test_vectorizer_has_no_forbidden_imports` |
| Импорты `processing/mesh_builder.py` | Нет импортов из `app.api`, `app.db`, `app.core.config` | `test_mesh_builder_has_no_forbidden_imports` |
| Импорты `processing/navigation.py` | Нет импортов из `app.api`, `app.db`, `app.core.config` | `test_navigation_has_no_forbidden_imports` |

> Реализация: `ast.parse` + обход дерева импортов, или `importlib` + проверка `sys.modules`.

### Repository Coverage (интеграционный, in-memory SQLite)

| Метод | Сценарий | Test Name |
|-------|----------|-----------|
| `repo.create_reconstruction(...)` | Создаёт запись со status=2 | `test_repo_create_reconstruction_returns_with_status_2` |
| `repo.get_by_id(id)` | Существующий id → Reconstruction | `test_repo_get_by_id_existing_returns_reconstruction` |
| `repo.get_by_id(id)` | Несуществующий id → None | `test_repo_get_by_id_missing_returns_none` |
| `repo.update_reconstruction(id, ...)` | Обновляет поля mesh + status | `test_repo_update_reconstruction_updates_mesh_fields` |

### Service Coverage

| Метод | Сценарий | Test Name |
|-------|----------|-----------|
| `MaskService.calculate_mask(file_id, crop, rotation)` | Happy path: файл существует → возвращает filename | `test_calculate_mask_valid_file_returns_filename` |
| `MaskService.calculate_mask(file_id, ...)` | Файл не найден → FileNotFoundError | `test_calculate_mask_missing_file_raises_not_found` |
| `ReconstructionService.build_mesh(plan_id, mask_id, user_id)` | Happy path → возвращает Reconstruction со status=3 | `test_build_mesh_valid_inputs_returns_done_reconstruction` |
| `ReconstructionService.build_mesh(...)` | Маска не найдена → Reconstruction со status=4 | `test_build_mesh_missing_mask_returns_error_status` |
| `ReconstructionService.save_reconstruction(id, name)` | Существующий id → Reconstruction с именем | `test_save_reconstruction_valid_id_updates_name` |
| `ReconstructionService.save_reconstruction(id, name)` | Несуществующий id → None | `test_save_reconstruction_missing_id_returns_none` |

### API Endpoint Coverage

| Endpoint | Status | Test Name |
|----------|--------|-----------|
| `POST /api/v1/upload/plan-photo/` | 200 | `test_upload_plan_valid_jpg_returns_200` |
| `POST /api/v1/upload/plan-photo/` | 400 | `test_upload_plan_invalid_format_returns_400` |
| `POST /api/v1/upload/plan-photo/` | 401 | `test_upload_plan_no_token_returns_401` |
| `POST /api/v1/reconstruction/initial-masks` | 200 | `test_calculate_mask_valid_request_returns_200` |
| `POST /api/v1/reconstruction/initial-masks` | 500 | `test_calculate_mask_missing_file_returns_500` |
| `POST /api/v1/reconstruction/reconstructions` | 200 | `test_build_mesh_valid_request_returns_200` |
| `POST /api/v1/reconstruction/reconstructions` | 401 | `test_build_mesh_no_token_returns_401` |
| `GET /api/v1/reconstruction/reconstructions` | 200 | `test_get_reconstructions_returns_list` |
| `GET /api/v1/reconstruction/reconstructions/{id}` | 200 | `test_get_reconstruction_valid_id_returns_200` |
| `GET /api/v1/reconstruction/reconstructions/{id}` | 404 | `test_get_reconstruction_missing_id_returns_404` |
| `PUT /api/v1/reconstruction/reconstructions/{id}/save` | 200 | `test_save_reconstruction_valid_request_returns_200` |
| `PUT /api/v1/reconstruction/reconstructions/{id}/save` | 404 | `test_save_reconstruction_missing_id_returns_404` |

---

## Key Fixtures

### `tests/processing/conftest.py`

```python
import pytest
import numpy as np
import cv2

@pytest.fixture
def blank_white_image() -> np.ndarray:
    """Чистое белое BGR изображение 200x200."""
    return np.ones((200, 200, 3), dtype=np.uint8) * 255

@pytest.fixture
def simple_room_image() -> np.ndarray:
    """BGR изображение с чёрным прямоугольником (симуляция стен на белом фоне)."""
    img = np.ones((200, 200, 3), dtype=np.uint8) * 255
    cv2.rectangle(img, (20, 20), (180, 180), (0, 0, 0), thickness=5)
    return img

@pytest.fixture
def binary_rectangle_mask() -> np.ndarray:
    """Бинарная маска 200x200 с белым прямоугольником (для vectorizer, mesh_builder)."""
    mask = np.zeros((200, 200), dtype=np.uint8)
    cv2.rectangle(mask, (20, 20), (180, 180), 255, thickness=5)
    return mask
```

### `tests/conftest.py`

```python
import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app

@pytest.fixture
async def client() -> AsyncClient:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c

@pytest.fixture
def auth_headers() -> dict:
    """Тестовый JWT токен для авторизованных запросов."""
    # Генерируем тестовый токен через core/security.py
    from app.core.security import create_access_token
    token = create_access_token({"sub": "testuser"})
    return {"Authorization": f"Bearer {token}"}
```

---

## Test Count Summary

| Layer | Tests |
|-------|-------|
| Structural (architecture checks) | 4 |
| Processing (`preprocessor`, `vectorizer`, `mesh_builder`, `navigation`) | 10 |
| Repository (`reconstruction_repo` — integration) | 4 |
| Services (`mask_service`, `reconstruction_service`) | 6 |
| API (`upload`, `reconstruction`) | 12 |
| **TOTAL** | **36** |

**Минимум по AC:** 5 тестов (по одному на каждую чистую функцию в `processing/`).
**Цель:** 28 тестов для полного покрытия бизнес-логики.

> Приоритет: сначала processing/ (10 тестов) — они быстрые и проверяют AC #1 (чистота processing/).
> Затем services/ и api/ — они покрывают AC #2, #3, #8.
