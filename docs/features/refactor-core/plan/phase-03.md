# Phase 03: Repository

phase: 3
layer: db/repositories
depends_on: phase-01
design: ../01-architecture.md, ../02-behavior.md

## Goal

Создать репозиторий — единственный слой с доступом к БД. Все `async_session_maker`
вызовы из `processing/reconstruction_service.py` и `api/upload.py` переезжают сюда.

## Context

Phase 01 создала:
- `app.core.exceptions.FloorPlanNotFoundError` — поднимается если запись не найдена

## Files to Create

### `backend/app/db/repositories/__init__.py`

**Purpose:** Пустой `__init__.py` для пакета.

```python
# db/repositories package
```

---

### `backend/app/db/repositories/reconstruction_repo.py`

**Purpose:** Все CRUD-операции для `Reconstruction` и `UploadedFile`.
Принимает `AsyncSession` через конструктор — никакого `async_session_maker` внутри.

**Implementation details:**

```python
import logging
from datetime import datetime
from typing import Optional
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models.reconstruction import Reconstruction, UploadedFile

logger = logging.getLogger(__name__)


class ReconstructionRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    # --- UploadedFile ---

    async def create_uploaded_file(
        self,
        file_id: str,
        filename: str,
        file_path: str,
        url: str,
        file_type: int,
        user_id: int,
    ) -> UploadedFile:
        """INSERT в uploaded_files."""

    # --- Reconstruction ---

    async def create_reconstruction(
        self,
        plan_file_id: str,
        mask_file_id: str,
        user_id: int,
        status: int = 2,
    ) -> Reconstruction:
        """INSERT в reconstructions, status=2 (processing)."""

    async def get_by_id(self, reconstruction_id: int) -> Optional[Reconstruction]:
        """SELECT by PK. Возвращает None если не найден."""

    async def update_mesh(
        self,
        reconstruction_id: int,
        obj_path: Optional[str],
        glb_path: Optional[str],
        status: int,
        error_message: Optional[str] = None,
    ) -> Reconstruction:
        """UPDATE mesh_file_id_obj, mesh_file_id_glb, status, error_message."""

    async def update_name(
        self,
        reconstruction_id: int,
        name: str,
    ) -> Optional[Reconstruction]:
        """UPDATE name. Возвращает None если запись не найдена."""

    async def get_saved(
        self,
        user_id: Optional[int] = None,
    ) -> list[Reconstruction]:
        """SELECT WHERE name IS NOT NULL ORDER BY created_at DESC."""

    async def delete(self, reconstruction_id: int) -> bool:
        """DELETE. Возвращает True если удалён, False если не найден."""
```

**Ключевые правила:**
- Никакой бизнес-логики — только SQLAlchemy-операции
- `session.add()` + `await session.commit()` + `await session.refresh()` в каждом write-методе
- `select(Reconstruction).where(...)` — явный запрос, не `session.execute(text(...))`
- Методы `get_by_id` и `update_name` возвращают `None` (не поднимают `FloorPlanNotFoundError` —
  это задача сервисного слоя)
- Логирование через `logger.debug()` для каждой операции

**Источники кода для копирования:**
- `create_uploaded_file` → из `api/upload.py:70-90`
- `create_reconstruction` → из `processing/reconstruction_service.py:56-68`
- `get_by_id` → из `processing/reconstruction_service.py:166-172`
- `update_mesh` → из `processing/reconstruction_service.py:76-98`
- `update_name` → из `processing/reconstruction_service.py:150-164`
- `get_saved` → из `processing/reconstruction_service.py:174-186`
- `delete` → из `processing/reconstruction_service.py:188-197`

## Verification

- [ ] `python -m py_compile backend/app/db/repositories/reconstruction_repo.py`
- [ ] `grep -n "async_session_maker\|session_maker" backend/app/db/repositories/reconstruction_repo.py` → пусто
- [ ] `grep -n "from app\.api\|from app\.services\|from app\.processing" backend/app/db/repositories/reconstruction_repo.py` → пусто
- [ ] `python -c "from app.db.repositories.reconstruction_repo import ReconstructionRepository; print('OK')"` из `backend/`
- [ ] Существующий pipeline НЕ сломан (репозиторий ещё никем не импортируется)
