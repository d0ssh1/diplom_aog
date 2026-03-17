# Phase 04: Services

phase: 4
layer: services
depends_on: phase-02, phase-03
design: ../01-architecture.md, ../02-behavior.md

## Goal

Создать сервисный слой — оркестрация без HTTP-зависимостей.
`services/mask_service.py` заменяет `processing/mask_service.py`.
`services/reconstruction_service.py` заменяет `processing/reconstruction_service.py`.
Старые файлы НЕ удаляются ещё (удаление в Phase 05 после обновления роутеров).

## Context

Phase 02 создала:
- `app.processing.preprocessor.preprocess_image()` — чистая функция бинаризации
- `app.processing.vectorizer.find_contours()` — чистая функция контуров
- `app.processing.mesh_builder.build_mesh()` — чистая функция 3D-меша

Phase 03 создала:
- `app.db.repositories.reconstruction_repo.ReconstructionRepository` — CRUD

## Files to Create

### `backend/app/services/__init__.py`

```python
# services package
```

---

### `backend/app/services/mask_service.py`

**Purpose:** Оркестрирует обработку изображения: file I/O + `preprocess_image()`.
Не знает о HTTP. Принимает `upload_dir` через конструктор.

**Implementation details:**

```python
import glob
import logging
import os
import cv2
from app.core.exceptions import FileStorageError, ImageProcessingError
from app.processing.preprocessor import preprocess_image

logger = logging.getLogger(__name__)


class MaskService:
    def __init__(self, upload_dir: str) -> None:
        self._upload_dir = upload_dir
        self._plans_dir = os.path.join(upload_dir, "plans")
        self._masks_dir = os.path.join(upload_dir, "masks")
        os.makedirs(self._masks_dir, exist_ok=True)

    def _find_file(self, file_id: str, subfolder: str) -> str:
        """Ищет файл с любым расширением. Raises FileStorageError если не найден."""
        pattern = os.path.join(self._upload_dir, subfolder, f"{file_id}.*")
        files = glob.glob(pattern)
        if not files:
            raise FileStorageError(file_id, pattern)
        return files[0]

    async def calculate_mask(
        self,
        file_id: str,
        crop: dict | None = None,
        rotation: int = 0,
    ) -> str:
        """
        Загружает план, бинаризует, сохраняет маску.

        Returns:
            filename маски (напр. "uuid.png")

        Raises:
            FileStorageError: файл плана не найден на диске
            ImageProcessingError: ошибка бинаризации
        """
```

- `calculate_mask()` — логика из `processing/mask_service.py:24-117`, НО:
  - file-поиск → `self._find_file(file_id, "plans")`
  - чистая обработка → `preprocess_image(img, crop, rotation)` (делегирует в processing/)
  - save маски → `cv2.imwrite(output_path, mask)`
- Вся работа с `cv2.imread` и `cv2.imwrite` остаётся здесь — это file I/O, не processing/
- `print()` НЕТ — только `logger.info()` / `logger.error()`
- Метод `async` (как в оригинале) — консистентность с роутером

---

### `backend/app/services/reconstruction_service.py`

**Purpose:** Оркестрирует полный 3D pipeline: load mask → vectorize → build mesh → export → save to DB.
Принимает `repo` и `output_dir` через конструктор (DI).

**Implementation details:**

```python
import logging
import os
import cv2
from typing import Optional
from app.core.exceptions import FileStorageError, ImageProcessingError, FloorPlanNotFoundError
from app.db.models.reconstruction import Reconstruction
from app.db.repositories.reconstruction_repo import ReconstructionRepository
from app.processing.vectorizer import find_contours
from app.processing.mesh_builder import build_mesh

logger = logging.getLogger(__name__)

# Маппинг статусов — единственное место в коде (убирает дублирование из api/)
STATUS_DISPLAY: dict[int, str] = {
    1: "Создано",
    2: "Построение 3D модели...",
    3: "Готово",
    4: "Ошибка",
}


class ReconstructionService:
    def __init__(
        self,
        repo: ReconstructionRepository,
        upload_dir: str,
    ) -> None:
        self._repo = repo
        self._upload_dir = upload_dir
        self._models_dir = os.path.join(upload_dir, "models")
        os.makedirs(self._models_dir, exist_ok=True)

    async def build_mesh(
        self,
        plan_file_id: str,
        mask_file_id: str,
        user_id: int,
    ) -> Reconstruction:
        """Полный pipeline: создать запись → загрузить маску → векторизовать →
        построить меш → экспортировать → обновить статус в БД."""

    async def get_reconstruction(self, reconstruction_id: int) -> Optional[Reconstruction]:
        """Получить по ID. Возвращает None если не найден."""

    async def get_saved_reconstructions(self) -> list[Reconstruction]:
        """Список сохранённых (name IS NOT NULL)."""

    async def save_reconstruction(
        self, reconstruction_id: int, name: str
    ) -> Optional[Reconstruction]:
        """Сохранить имя. Возвращает None если не найден."""

    async def delete_reconstruction(self, reconstruction_id: int) -> bool:
        """Удалить. Возвращает False если не найден."""

    @staticmethod
    def get_status_display(status: int) -> str:
        """Возвращает человекочитаемый статус из STATUS_DISPLAY."""

    def build_mesh_url(self, reconstruction: Reconstruction) -> Optional[str]:
        """Формирует URL на GLB-файл."""
```

**Ключевые детали `build_mesh()`:**
1. `await self._repo.create_reconstruction(plan_file_id, mask_file_id, user_id, status=2)`
2. Найти маску на диске (glob pattern аналогично `_generate_mesh_sync` из старого кода)
3. `cv2.imread(mask_path, cv2.IMREAD_GRAYSCALE)` — file I/O остаётся в сервисе
4. `contours = find_contours(mask_array)` — чистая функция
5. `mesh = build_mesh(contours, w, h, floor_height, pixels_per_meter)` — чистая функция
6. `mesh.export(obj_path)` + `mesh.export(glb_path)` — file I/O в сервисе
7. `await self._repo.update_mesh(id, obj_path, glb_path, status=3)`
8. В блоке `except`: `await self._repo.update_mesh(id, None, None, status=4, error_message=str(e))`

**Источники:**
- Логика из `processing/reconstruction_service.py:34-98`
- `STATUS_DISPLAY` — вместо дублированного `status_map` в `api/reconstruction.py:136,214,255`
- `build_mesh_url()` — вместо дублированной строки `f"/api/v1/uploads/models/reconstruction_{id}.glb"`

## Verification

- [ ] `python -m py_compile backend/app/services/mask_service.py`
- [ ] `python -m py_compile backend/app/services/reconstruction_service.py`
- [ ] `grep -n "async_session_maker\|session_maker\|from app\.api\|from app\.core\.config" backend/app/services/*.py` → пусто
- [ ] `python -c "from app.services.mask_service import MaskService; print('OK')"` из `backend/`
- [ ] `python -c "from app.services.reconstruction_service import ReconstructionService; print('OK')"` из `backend/`
- [ ] Существующий pipeline НЕ сломан (роутеры ещё используют старые processing/ классы)
