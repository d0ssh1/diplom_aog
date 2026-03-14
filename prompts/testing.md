# Testing: Diplom3D

## Инструменты
- `pytest` + `pytest-asyncio` для async тестов
- `httpx` для тестирования FastAPI (TestClient / AsyncClient)
- `pytest-mock` для моков
- Фикстуры в `conftest.py` каждого уровня

## Структура тестов

```
backend/
└── tests/
    ├── conftest.py              ← глобальные фикстуры (db, client)
    ├── processing/
    │   ├── conftest.py          ← тестовые изображения
    │   ├── test_preprocessor.py
    │   ├── test_text_remover.py
    │   └── test_vectorizer.py
    ├── services/
    │   ├── test_floor_plan_service.py
    │   ├── test_builder_3d.py
    │   └── test_pathfinding.py
    └── api/
        ├── test_floor_plans.py
        └── test_buildings.py
```

---

## Именование тестов

```python
# Паттерн: test_{что}_{условие}_{ожидаемый результат}
def test_preprocess_valid_image_returns_binary():
def test_preprocess_empty_image_raises_error():
def test_vectorize_simple_rectangle_returns_four_walls():
def test_upload_floor_plan_invalid_format_returns_400():
```

---

## Паттерн теста (AAA)

```python
def test_vectorize_simple_rectangle_returns_four_walls():
    # Arrange
    image = create_test_image_with_rectangle(size=(100, 100))
    vectorizer = WallVectorizer()

    # Act
    result = vectorizer.vectorize(image)

    # Assert
    assert len(result.walls) == 4
    assert all(len(wall.points) >= 2 for wall in result.walls)
```

---

## Фикстуры для изображений

```python
# tests/processing/conftest.py
import pytest
import numpy as np

@pytest.fixture
def blank_image() -> np.ndarray:
    """Чистое белое изображение 200x200."""
    return np.ones((200, 200, 3), dtype=np.uint8) * 255

@pytest.fixture
def simple_room_image() -> np.ndarray:
    """Изображение с простым прямоугольным контуром (комната)."""
    img = np.ones((200, 200, 3), dtype=np.uint8) * 255
    cv2.rectangle(img, (20, 20), (180, 180), (0, 0, 0), thickness=3)
    return img

@pytest.fixture
def sample_floor_plan_image() -> np.ndarray:
    """Реальный тестовый план (из assets/test_plans/)."""
    path = Path("tests/assets/simple_floor_plan.jpg")
    return cv2.imread(str(path))
```

---

## Фикстуры для API

```python
# tests/conftest.py
import pytest
from httpx import AsyncClient
from app.main import app

@pytest.fixture
async def client() -> AsyncClient:
    async with AsyncClient(app=app, base_url="http://test") as c:
        yield c

@pytest.fixture
def sample_floor_plan() -> FloorPlan:
    return FloorPlan(
        id=UUID("00000000-0000-0000-0000-000000000001"),
        walls=[Wall(id=..., points=[Point2D(x=0, y=0), Point2D(x=1, y=0)])],
        rooms=[],
    )
```

---

## Правила

1. **Processing тесты не используют БД** — только numpy/cv2
2. **Service тесты мокают репозитории** — тестируем логику, не БД
3. **API тесты используют TestClient** — полный стек, in-memory БД
4. Каждая новая функция в `processing/` → минимум 2 теста (happy path + error)
5. Каждый новый API эндпоинт → тест на 200, 400, 404 (где применимо)
6. Тестовые изображения хранятся в `tests/assets/` (не генерируются на лету если сложные)
7. `assert` с сообщением для не очевидных проверок:
   ```python
   assert len(walls) > 0, "Vectorizer должен найти хотя бы одну стену"
   ```
