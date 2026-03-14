# Python Style: Diplom3D Backend

## Версия и инструменты
- Python 3.12
- FastAPI (последняя стабильная)
- Pydantic v2
- SQLAlchemy 2.x (async)
- Type hints ВЕЗДЕ — без исключений

---

## Именование

```python
# Файлы и модули — snake_case
floor_plan_service.py
wall_vectorizer.py

# Классы — PascalCase
class FloorPlanService: ...
class WallVectorizerProcessor: ...

# Функции и переменные — snake_case
def process_image(image_path: str) -> np.ndarray: ...
floor_plan_id: UUID

# Константы — UPPER_SNAKE_CASE
MAX_IMAGE_SIZE_MB = 10
SUPPORTED_FORMATS = ["jpg", "jpeg", "png"]

# Pydantic модели API — суффикс Request/Response
class UploadImageRequest(BaseModel): ...
class FloorPlanResponse(BaseModel): ...

# SQLAlchemy ORM — суффикс Model
class FloorPlanModel(Base): ...

# Domain сущности — без суффикса
class FloorPlan: ...
class Wall: ...
```

---

## Структура файла сервиса

```python
from uuid import UUID
from typing import Optional
from app.models.floor_plan import FloorPlan
from app.db.repositories.floor_plan_repo import FloorPlanRepository
from app.processing.vectorization import WallVectorizer


class FloorPlanService:
    def __init__(
        self,
        repo: FloorPlanRepository,
        vectorizer: WallVectorizer,
    ) -> None:
        self._repo = repo
        self._vectorizer = vectorizer

    async def process_uploaded_image(
        self,
        image_bytes: bytes,
        user_id: UUID,
    ) -> FloorPlan:
        """Запускает полный пайплайн обработки изображения."""
        # 1. Preprocessing
        # 2. Vectorization
        # 3. Сохранение
        ...
```

---

## Структура роутера

```python
from fastapi import APIRouter, Depends, UploadFile, HTTPException, status
from app.models.requests import UploadImageRequest
from app.models.responses import FloorPlanResponse
from app.services.floor_plan_service import FloorPlanService
from app.api.deps import get_floor_plan_service

router = APIRouter(prefix="/floor-plans", tags=["floor-plans"])


@router.post("/", response_model=FloorPlanResponse, status_code=status.HTTP_201_CREATED)
async def upload_floor_plan(
    file: UploadFile,
    service: FloorPlanService = Depends(get_floor_plan_service),
) -> FloorPlanResponse:
    """Загрузка и обработка плана этажа."""
    try:
        result = await service.process_uploaded_image(await file.read())
        return FloorPlanResponse.model_validate(result)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
```

---

## Обработка ошибок

```python
# Кастомные исключения в core/exceptions.py
class FloorPlanNotFoundError(Exception):
    def __init__(self, floor_plan_id: UUID) -> None:
        self.floor_plan_id = floor_plan_id
        super().__init__(f"FloorPlan {floor_plan_id} not found")

class ImageProcessingError(Exception): ...
class InvalidImageFormatError(Exception): ...
```

---

## Функции обработки изображений (processing/)

```python
import cv2
import numpy as np
from pathlib import Path


def preprocess_image(image: np.ndarray) -> np.ndarray:
    """
    Preprocessing: grayscale, denoise, threshold.
    
    Args:
        image: BGR image array (H, W, 3)
    
    Returns:
        Binary image array (H, W) — стены белые, фон чёрный
    """
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    # ...
    return binary

# Принципы:
# - Чистые функции (нет side effects)
# - Явные типы np.ndarray с комментарием формата
# - Один шаг пайплайна = одна функция
# - Никаких вызовов БД или HTTP внутри
```

---

## Импорты

```python
# Порядок: stdlib → third-party → local
from uuid import UUID
from typing import Optional, List

import cv2
import numpy as np
from fastapi import APIRouter
from pydantic import BaseModel, Field

from app.models.floor_plan import FloorPlan
from app.services.floor_plan_service import FloorPlanService
```

---

## Запрещено

- `any` тип без явного комментария почему
- Бизнес-логика в роутерах
- Прямые SQL запросы вне репозиториев
- `print()` вместо `logging`
- Игнорирование исключений через голый `except:`
- Мутация входных параметров в функциях `processing/`
