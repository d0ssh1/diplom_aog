# Phase 05: API Layer + Cleanup

phase: 5
layer: api
depends_on: phase-04
design: ../01-architecture.md, ../02-behavior.md

## Goal

Переключить роутеры на новые сервисы через FastAPI `Depends()`.
Убрать всю бизнес-логику из `api/`. Заменить `print()` на `logging`.
Удалить мёртвый код (`processing/reconstruction_service.py`, `processing/mask_service.py`).

**После этой фазы** весь pipeline работает через новую архитектуру.

## Context

Phase 04 создала:
- `app.services.mask_service.MaskService` — оркестрация бинаризации
- `app.services.reconstruction_service.ReconstructionService` — оркестрация 3D pipeline
  с `STATUS_DISPLAY` и `build_mesh_url()`

Phase 03 создала:
- `app.db.repositories.reconstruction_repo.ReconstructionRepository`

## Step 0: Проверить/добавить `get_db()` в `core/database.py`

**Сделать первым делом — до создания `deps.py`.**

Открыть `backend/app/core/database.py` и проверить наличие async-генератора `get_db()`.
Сейчас там есть только `async_session_maker`. Если `get_db()` отсутствует — добавить:

```python
# backend/app/core/database.py — добавить в конец файла
from typing import AsyncGenerator
from sqlalchemy.ext.asyncio import AsyncSession

async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """FastAPI Depends — генератор сессии БД."""
    async with async_session_maker() as session:
        yield session
```

Проверка: `python -c "from app.core.database import get_db; print('OK')"` из `backend/`.

---

## Files to Create

### `backend/app/api/deps.py`

**Purpose:** FastAPI Depends — точка DI для всех сервисов и репозиториев.

**Implementation details:**

```python
from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db           # async generator, уже должен быть в database.py
from app.db.repositories.reconstruction_repo import ReconstructionRepository
from app.services.mask_service import MaskService
from app.services.reconstruction_service import ReconstructionService


async def get_repo(
    session: AsyncSession = Depends(get_db),
) -> ReconstructionRepository:
    return ReconstructionRepository(session)


async def get_mask_service(
    repo: ReconstructionRepository = Depends(get_repo),
) -> MaskService:
    return MaskService(upload_dir=str(settings.UPLOAD_DIR))


async def get_reconstruction_service(
    repo: ReconstructionRepository = Depends(get_repo),
) -> ReconstructionService:
    return ReconstructionService(
        repo=repo,
        upload_dir=str(settings.UPLOAD_DIR),
    )
```

**Важно:** Проверить, есть ли в `app.core.database` генератор `get_db()`.
Если его нет (сейчас есть только `async_session_maker`), добавить:
```python
# В core/database.py добавить:
async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with async_session_maker() as session:
        yield session
```

---

## Files to Modify

### `backend/app/api/reconstruction.py`

**What changes:** Полный рефакторинг — тонкий слой. Файл должен стать ≤120 строк.

**Изменения построчно:**

1. **Убрать** все `from app.processing.reconstruction_service import reconstruction_service`
   и `from app.processing.mask_service import MaskService` (inline imports внутри функций)
2. **Добавить** в начало:
   ```python
   from app.api.deps import get_reconstruction_service, get_mask_service
   from app.services.reconstruction_service import ReconstructionService
   from app.services.mask_service import MaskService
   ```
3. **Каждый роутер** получает сервис через `Depends`:
   ```python
   @router.post("/initial-masks")
   async def calculate_initial_mask(
       request: CalculateMaskRequest,
       credentials: HTTPAuthorizationCredentials = Depends(security),
       svc: MaskService = Depends(get_mask_service),
   ):
       filename = await svc.calculate_mask(request.file_id, ...)
       return CalculateMaskResponse(...)
   ```
4. **Убрать** дублированный `status_map` (в 3 местах) — заменить на:
   ```python
   status_display = svc.get_status_display(reconstruction.status)
   mesh_url = svc.build_mesh_url(reconstruction)
   ```
5. **Убрать** `print(f"[debug] CalculateMesh response: ...")` (строка 149)
6. **Добавить** `import logging` и `logger = logging.getLogger(__name__)`

**Lines affected:** Весь файл (329 строк → ~120 строк)

---

### `backend/app/api/upload.py`

**What changes:** Убрать `save_file_to_db()` с `async_session_maker`, заменить на `repo`.

1. **Убрать** импорты `from app.core.database import async_session_maker` и
   `from app.db.models.reconstruction import UploadedFile as UploadedFileModel`
2. **Убрать** функцию `save_file_to_db()` (строки 70-90)
3. **Добавить** в начало: `from app.api.deps import get_repo`
4. **Каждый upload роутер** получает `repo: ReconstructionRepository = Depends(get_repo)`
   и вызывает `await repo.create_uploaded_file(...)`

**Lines affected:** ~50 строк (удалить + заменить)

---

## Files to Delete

Мёртвый код — вся функциональность перенесена в Phase 02-04:

| Файл | Причина удаления |
|------|-----------------|
| `backend/app/processing/reconstruction_service.py` | Заменён `services/reconstruction_service.py` + `db/repositories/reconstruction_repo.py` |
| `backend/app/processing/mask_service.py` | Заменён `services/mask_service.py` + `processing/preprocessor.py` |

> `processing/mesh_generator.py` — **НЕ удалять**: `mesh_builder.py` делегирует ему алгоритм.
> `processing/binarization.py`, `processing/contours.py` — **НЕ удалять**: они disconnected,
> не наша фича.

## Replace print() with logging

Все `print()` в изменённых/новых файлах заменить на `logging.getLogger(__name__)`.

Файлы к проверке:
- `api/reconstruction.py` — строка 149: `print(f"[debug] ...")` → `logger.debug(...)`
- `processing/mesh_generator.py` — множество `print()` → `logger.debug()`/`logger.info()`
  (файл оставляем, но print() заменяем)

Проверка: `grep -rn "print(" backend/app/` → только в `if __name__ == "__main__"` блоках.

## Verification

- [ ] `python -m py_compile backend/app/api/deps.py`
- [ ] `python -m py_compile backend/app/api/reconstruction.py`
- [ ] `python -m py_compile backend/app/api/upload.py`
- [ ] `grep -n "async_session_maker\|session_maker" backend/app/api/reconstruction.py backend/app/api/upload.py` → пусто
- [ ] `grep -n "from app\.processing\.reconstruction_service\|from app\.processing\.mask_service" backend/app/api/reconstruction.py` → пусто
- [ ] `grep -rn "print(" backend/app/ --include="*.py"` → только `if __name__` блоки
- [ ] Файлы удалены: `ls backend/app/processing/reconstruction_service.py` → "не существует"
- [ ] **Ключевая проверка**: запустить сервер и вручную проверить pipeline:
  - POST `/api/v1/upload/plan-photo/` → 200 с `{id, url}`
  - POST `/api/v1/reconstruction/initial-masks` → 200 с `{id, url}`
  - POST `/api/v1/reconstruction/reconstructions` → 200 с `{id, status: 3}`
  - GET `/api/v1/reconstruction/reconstructions/{id}` → 200
