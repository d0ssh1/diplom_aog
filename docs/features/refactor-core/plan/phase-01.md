# Phase 01: Core Foundation

phase: 1
layer: core, models
depends_on: none
design: ../README.md

## Goal

Создать фундаментальные типы — кастомные исключения и доменные модели — на которые
будут ссылаться все остальные слои. Никакого кода до этой фазы писать нельзя.

## Files to Create

### `backend/app/core/exceptions.py`

**Purpose:** Типизированные исключения для всех слоёв приложения.

**Implementation details:**

```python
class ImageProcessingError(Exception):
    """Ошибка на этапе обработки изображения (processing/).

    Args:
        step: название шага, напр. "preprocess_image", "find_contours"
        message: детальное сообщение
    """
    def __init__(self, step: str, message: str) -> None:
        self.step = step
        super().__init__(f"[{step}] {message}")


class FloorPlanNotFoundError(Exception):
    """Реконструкция/план не найден в БД."""
    def __init__(self, reconstruction_id: int) -> None:
        self.reconstruction_id = reconstruction_id
        super().__init__(f"Reconstruction {reconstruction_id} not found")


class FileStorageError(Exception):
    """Файл не найден на диске или не читается."""
    def __init__(self, file_id: str, path: str) -> None:
        self.file_id = file_id
        super().__init__(f"File {file_id} not found at {path}")
```

- Все три класса наследуются от `Exception` напрямую
- Никаких импортов из других модулей приложения
- `step` в `ImageProcessingError` позволяет отладить в каком шаге упало

---

### `backend/app/models/domain.py`

**Purpose:** Доменные модели (Pydantic v2) — внутренние типы данных pipeline.
Не смешиваются с API request/response моделями (`models/reconstruction.py`).

**Implementation details:**

```python
from pydantic import BaseModel, Field
from typing import List

class Point2D(BaseModel):
    """Точка в нормализованных координатах [0, 1]."""
    x: float = Field(..., ge=0.0, le=1.0)
    y: float = Field(..., ge=0.0, le=1.0)

class Wall(BaseModel):
    """Стена как полилиния точек."""
    id: str  # UUID строка
    points: List[Point2D]
    thickness: float = 0.2  # метры

class FloorPlan(BaseModel):
    """Доменная модель плана этажа (не ORM, не API response)."""
    id: str  # UUID строка = file_id загруженного плана
    walls: List[Wall] = []
    image_width: int
    image_height: int

class VectorizationResult(BaseModel):
    """Результат векторизации маски — выход processing/vectorizer.py."""
    contours_count: int
    wall_pixel_area: int  # суммарная площадь всех контуров в пикселях
```

- Pydantic v2, все поля с аннотациями типов
- `FloorPlan` — domain model, НЕ ORM (ORM в `db/models/reconstruction.py`)
- `VectorizationResult` — выходной тип `find_contours()`, несёт метрики для логирования
- `Point2D` — нормализованные координаты [0,1] как требует `prompts/architecture.md:81-113`

## Verification

- [ ] `python -m py_compile backend/app/core/exceptions.py`
- [ ] `python -m py_compile backend/app/models/domain.py`
- [ ] `python -c "from app.core.exceptions import ImageProcessingError, FloorPlanNotFoundError, FileStorageError; print('OK')"` — выполнять из `backend/`
- [ ] `python -c "from app.models.domain import Point2D, Wall, FloorPlan, VectorizationResult; print('OK')"` — из `backend/`
- [ ] `grep -r "from app.api\|from app.db\|from app.core.config\|from app.services" backend/app/core/exceptions.py backend/app/models/domain.py` → пусто
