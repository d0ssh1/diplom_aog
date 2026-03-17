# Phase 06: Tests

phase: 6
layer: tests
depends_on: phase-05
design: ../04-testing.md

## Goal

Создать полный тестовый suite из 36 тестов. Покрывает все Acceptance Criteria:
AC #1 (структурный тест), AC #7 (5+ тестов для processing/), AC #8 (интеграционный pipeline),
AC #9 (pytest проходит).

## Context

Phase 05 завершила рефакторинг. Все новые файлы:
- `processing/preprocessor.py`, `vectorizer.py`, `mesh_builder.py`, `navigation.py` (pure functions)
- `db/repositories/reconstruction_repo.py` (CRUD)
- `services/mask_service.py`, `reconstruction_service.py` (orchestration)
- `api/deps.py`, рефакторированные `api/reconstruction.py`, `api/upload.py`

## Files to Create

### `backend/tests/conftest.py`

```python
import pytest
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from app.main import app
from app.core.database import Base
from app.api.deps import get_db

# In-memory SQLite для тестов
TEST_DB_URL = "sqlite+aiosqlite:///:memory:"

@pytest.fixture(scope="session")
async def test_engine():
    engine = create_async_engine(TEST_DB_URL, echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield engine
    await engine.dispose()

@pytest.fixture
async def db_session(test_engine):
    async_session = sessionmaker(test_engine, class_=AsyncSession, expire_on_commit=False)
    async with async_session() as session:
        yield session

@pytest.fixture
async def client(db_session):
    async def override_get_db():
        yield db_session
    app.dependency_overrides[get_db] = override_get_db
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c
    app.dependency_overrides.clear()

@pytest.fixture
def auth_headers() -> dict:
    from app.core.security import create_access_token
    token = create_access_token({"sub": "testuser"})
    return {"Authorization": f"Bearer {token}"}
```

---

### `backend/tests/test_architecture.py`

**Tests from 04-testing.md:** 4 структурных теста

```python
import ast
import importlib
from pathlib import Path

FORBIDDEN_IMPORTS = {"app.api", "app.db", "app.core.config", "app.services"}
PROCESSING_MODULES = [
    "app.processing.preprocessor",
    "app.processing.vectorizer",
    "app.processing.mesh_builder",
    "app.processing.navigation",
]

def get_imports(module_name: str) -> set[str]:
    """Возвращает все импортируемые модули через ast.parse."""
    spec = importlib.util.find_spec(module_name)
    source = Path(spec.origin).read_text(encoding="utf-8")
    tree = ast.parse(source)
    imports = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                imports.add(alias.name)
        elif isinstance(node, ast.ImportFrom):
            if node.module:
                imports.add(node.module)
    return imports

def test_preprocessor_has_no_forbidden_imports():
    imports = get_imports("app.processing.preprocessor")
    violations = {i for i in imports if any(i.startswith(f) for f in FORBIDDEN_IMPORTS)}
    assert not violations, f"preprocessor импортирует запрещённое: {violations}"

def test_vectorizer_has_no_forbidden_imports():
    imports = get_imports("app.processing.vectorizer")
    violations = {i for i in imports if any(i.startswith(f) for f in FORBIDDEN_IMPORTS)}
    assert not violations, f"vectorizer импортирует запрещённое: {violations}"

def test_mesh_builder_has_no_forbidden_imports():
    imports = get_imports("app.processing.mesh_builder")
    violations = {i for i in imports if any(i.startswith(f) for f in FORBIDDEN_IMPORTS)}
    assert not violations, f"mesh_builder импортирует запрещённое: {violations}"

def test_navigation_has_no_forbidden_imports():
    imports = get_imports("app.processing.navigation")
    violations = {i for i in imports if any(i.startswith(f) for f in FORBIDDEN_IMPORTS)}
    assert not violations, f"navigation импортирует запрещённое: {violations}"
```

---

### `backend/tests/processing/conftest.py`

```python
import pytest
import numpy as np
import cv2

@pytest.fixture
def blank_white_image() -> np.ndarray:
    """BGR 200x200 белый."""
    return np.ones((200, 200, 3), dtype=np.uint8) * 255

@pytest.fixture
def simple_room_image() -> np.ndarray:
    """BGR с чёрным прямоугольником — симуляция стен."""
    img = np.ones((200, 200, 3), dtype=np.uint8) * 255
    cv2.rectangle(img, (20, 20), (180, 180), (0, 0, 0), thickness=5)
    return img

@pytest.fixture
def binary_rectangle_mask() -> np.ndarray:
    """Бинарная маска 200x200 с белым прямоугольником (стены)."""
    mask = np.zeros((200, 200), dtype=np.uint8)
    cv2.rectangle(mask, (20, 20), (180, 180), 255, thickness=5)
    return mask

@pytest.fixture
def empty_mask() -> np.ndarray:
    """Полностью чёрная маска — нет контуров."""
    return np.zeros((200, 200), dtype=np.uint8)
```

---

### `backend/tests/processing/test_preprocessor.py`

**Tests (4):**

```python
import numpy as np
import pytest
from app.processing.preprocessor import preprocess_image
from app.core.exceptions import ImageProcessingError

def test_preprocess_valid_bgr_returns_binary_uint8(simple_room_image):
    # Act
    result = preprocess_image(simple_room_image)
    # Assert
    assert result.dtype == np.uint8, "Результат должен быть uint8"
    assert set(np.unique(result)).issubset({0, 255}), "Только значения 0 и 255"
    assert result.ndim == 2, "Результат должен быть grayscale (2D)"

def test_preprocess_does_not_mutate_input(simple_room_image):
    original = simple_room_image.copy()
    preprocess_image(simple_room_image)
    assert np.array_equal(simple_room_image, original), "Входной массив не должен мутироваться"

def test_preprocess_empty_image_raises_error():
    empty = np.zeros((0, 0, 3), dtype=np.uint8)
    with pytest.raises(ImageProcessingError):
        preprocess_image(empty)

def test_preprocess_with_crop_returns_smaller_shape(simple_room_image):
    crop = {"x": 0.0, "y": 0.0, "width": 0.5, "height": 0.5}
    result = preprocess_image(simple_room_image, crop=crop)
    assert result.shape[0] <= 100, "Высота после кропа должна быть ≤ 100px"
    assert result.shape[1] <= 100, "Ширина после кропа должна быть ≤ 100px"
```

---

### `backend/tests/processing/test_vectorizer.py`

**Tests (2):**

```python
from app.processing.vectorizer import find_contours
from app.core.exceptions import ImageProcessingError

def test_find_contours_rectangle_returns_contour(binary_rectangle_mask):
    result = find_contours(binary_rectangle_mask)
    assert len(result) >= 1, "Vectorizer должен найти хотя бы один контур прямоугольника"

def test_find_contours_empty_mask_returns_empty_list(empty_mask):
    result = find_contours(empty_mask)
    assert result == [], "На пустой маске контуров быть не должно"
```

---

### `backend/tests/processing/test_mesh_builder.py`

**Tests (2):**

```python
import pytest
from app.processing.vectorizer import find_contours
from app.processing.mesh_builder import build_mesh
from app.core.exceptions import ImageProcessingError

def test_build_mesh_valid_contours_returns_mesh(binary_rectangle_mask):
    contours = find_contours(binary_rectangle_mask)
    h, w = binary_rectangle_mask.shape
    mesh = build_mesh(contours, image_width=w, image_height=h)
    assert mesh is not None
    assert len(mesh.vertices) > 0, "Меш должен содержать вершины"
    assert len(mesh.faces) > 0, "Меш должен содержать грани"

def test_build_mesh_empty_contours_raises_error():
    with pytest.raises(ImageProcessingError):
        build_mesh([], image_width=200, image_height=200)
```

---

### `backend/tests/processing/test_navigation.py`

**Tests (2):**

```python
from app.processing.navigation import a_star

SIMPLE_GRAPH = {
    1: {"neighbors": [(2, 1.0), (3, 5.0)], "pos": (0.0, 0.0)},
    2: {"neighbors": [(1, 1.0), (3, 1.0)], "pos": (1.0, 0.0)},
    3: {"neighbors": [(2, 1.0), (1, 5.0)], "pos": (2.0, 0.0)},
}

def test_a_star_simple_graph_returns_path():
    path = a_star(SIMPLE_GRAPH, start_id=1, end_id=3)
    assert path is not None
    assert path[0] == 1 and path[-1] == 3, "Путь должен начинаться в 1 и заканчиваться в 3"
    assert path == [1, 2, 3], "Оптимальный путь: 1→2→3 (cost=2.0)"

def test_a_star_disconnected_graph_returns_none():
    graph = {
        1: {"neighbors": [], "pos": (0.0, 0.0)},
        2: {"neighbors": [], "pos": (1.0, 0.0)},
    }
    result = a_star(graph, start_id=1, end_id=2)
    assert result is None, "На несвязном графе путь не должен быть найден"
```

---

### `backend/tests/db/test_reconstruction_repo.py`

**Tests (4, integration с in-memory SQLite):**

```python
import pytest
from app.db.repositories.reconstruction_repo import ReconstructionRepository

@pytest.mark.asyncio
async def test_repo_create_reconstruction_returns_with_status_2(db_session):
    repo = ReconstructionRepository(db_session)
    # Нужен существующий uploaded_file. Создать через repo или напрямую в fixture.
    r = await repo.create_reconstruction("plan-id", "mask-id", user_id=1)
    assert r.id is not None
    assert r.status == 2

@pytest.mark.asyncio
async def test_repo_get_by_id_existing_returns_reconstruction(db_session):
    repo = ReconstructionRepository(db_session)
    created = await repo.create_reconstruction("plan-x", "mask-x", user_id=1)
    result = await repo.get_by_id(created.id)
    assert result is not None
    assert result.id == created.id

@pytest.mark.asyncio
async def test_repo_get_by_id_missing_returns_none(db_session):
    repo = ReconstructionRepository(db_session)
    result = await repo.get_by_id(99999)
    assert result is None

@pytest.mark.asyncio
async def test_repo_update_reconstruction_updates_mesh_fields(db_session):
    repo = ReconstructionRepository(db_session)
    created = await repo.create_reconstruction("plan-y", "mask-y", user_id=1)
    updated = await repo.update_mesh(created.id, "path.obj", "path.glb", status=3)
    assert updated.status == 3
    assert updated.mesh_file_id_glb == "path.glb"
```

---

### `backend/tests/services/test_mask_service.py`

**Tests (2, мокаем file system):**

```python
import pytest
import numpy as np
from unittest.mock import patch, MagicMock
from app.services.mask_service import MaskService
from app.core.exceptions import FileStorageError

@pytest.mark.asyncio
async def test_calculate_mask_valid_file_returns_filename(tmp_path):
    # Создать тестовый файл плана
    import cv2
    img = np.ones((100, 100, 3), dtype=np.uint8) * 255
    cv2.rectangle(img, (10, 10), (90, 90), (0, 0, 0), thickness=3)
    (tmp_path / "plans").mkdir()
    (tmp_path / "masks").mkdir()
    cv2.imwrite(str(tmp_path / "plans" / "test-id.jpg"), img)

    svc = MaskService(upload_dir=str(tmp_path))
    result = await svc.calculate_mask("test-id")
    assert result == "test-id.png"
    assert (tmp_path / "masks" / "test-id.png").exists()

@pytest.mark.asyncio
async def test_calculate_mask_missing_file_raises_not_found(tmp_path):
    (tmp_path / "plans").mkdir()
    (tmp_path / "masks").mkdir()
    svc = MaskService(upload_dir=str(tmp_path))
    with pytest.raises(FileStorageError):
        await svc.calculate_mask("nonexistent-id")
```

---

### `backend/tests/services/test_reconstruction_service.py`

**Tests (4, мокаем repo и file system):**

```python
import pytest
import numpy as np
import cv2
from unittest.mock import AsyncMock, MagicMock, patch
from app.services.reconstruction_service import ReconstructionService

@pytest.mark.asyncio
async def test_build_mesh_valid_inputs_returns_done_reconstruction(tmp_path):
    # Arrange — создать реальный файл маски
    (tmp_path / "masks").mkdir()
    (tmp_path / "models").mkdir()
    mask = np.zeros((100, 100), dtype=np.uint8)
    cv2.rectangle(mask, (10, 10), (90, 90), 255, thickness=5)
    cv2.imwrite(str(tmp_path / "masks" / "mask-id.png"), mask)

    repo = AsyncMock()
    repo.create_reconstruction.return_value = MagicMock(id=1)
    repo.update_mesh.return_value = MagicMock(id=1, status=3)

    svc = ReconstructionService(repo=repo, upload_dir=str(tmp_path))
    result = await svc.build_mesh("plan-id", "mask-id", user_id=1)

    # Assert
    assert result.status == 3, "При успешной генерации статус должен быть 3 (Done)"
    repo.update_mesh.assert_called_once()

@pytest.mark.asyncio
async def test_build_mesh_missing_mask_returns_error_status():
    repo = AsyncMock()
    repo.create_reconstruction.return_value = MagicMock(id=1)
    repo.update_mesh.return_value = MagicMock(id=1, status=4)
    svc = ReconstructionService(repo=repo, upload_dir="/nonexistent")
    result = await svc.build_mesh("plan-id", "mask-id", user_id=1)
    assert result.status == 4, "При отсутствии маски статус должен быть 4 (Error)"
    repo.update_mesh.assert_called_once()

@pytest.mark.asyncio
async def test_save_reconstruction_valid_id_updates_name():
    repo = AsyncMock()
    repo.update_name.return_value = MagicMock(id=5, name="My Plan")
    svc = ReconstructionService(repo=repo, upload_dir="/tmp")
    result = await svc.save_reconstruction(5, "My Plan")
    assert result is not None
    assert result.name == "My Plan"

@pytest.mark.asyncio
async def test_save_reconstruction_missing_id_returns_none():
    repo = AsyncMock()
    repo.update_name.return_value = None
    svc = ReconstructionService(repo=repo, upload_dir="/tmp")
    result = await svc.save_reconstruction(99999, "Test")
    assert result is None
```

---

### `backend/tests/api/test_upload.py` и `backend/tests/api/test_reconstruction.py`

**Tests (12 total):** Тесты API endpoints через `AsyncClient`.
Покрытие согласно таблице в `04-testing.md`.
Каждый тест использует фикстуры `client` и `auth_headers` из `conftest.py`.
Для тестов `initial-masks` и `reconstructions` мокировать `MaskService.calculate_mask()`
и `ReconstructionService.build_mesh()` через `app.dependency_overrides`.

## pytest.ini / pyproject.toml

Добавить конфигурацию для `asyncio_mode`:

```ini
# backend/pytest.ini
[pytest]
asyncio_mode = auto
testpaths = tests
```

## Verification

- [ ] `python -m pytest backend/tests/ -v` → все 36 тестов PASSED
  - `test_architecture.py`: 4 (структурные)
  - `processing/`: 4 + 2 + 2 + 2 = 10 (preprocessor + vectorizer + mesh_builder + navigation)
  - `db/`: 4 (repo integration)
  - `services/`: 2 + 4 = 6 (mask_service + reconstruction_service)
  - `api/`: 12
  - **Итого: 4 + 10 + 4 + 6 + 12 = 36** ✓
- [ ] `python -m pytest backend/tests/test_architecture.py -v` → 4 PASSED (AC #1)
- [ ] `python -m pytest backend/tests/processing/ -v` → 10 PASSED (AC #7)
- [ ] `python -m pytest backend/tests/db/ -v` → 4 PASSED
- [ ] `python -m pytest backend/tests/services/ -v` → 6 PASSED
- [ ] `python -m pytest backend/tests/api/ -v` → 12 PASSED
- [ ] `python -m flake8 backend/app/ --max-line-length=100` → 0 ошибок (AC #10)
