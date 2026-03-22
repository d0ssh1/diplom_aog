# TICKET: refactor-core — Привести кодовую базу в соответствие с архитектурными стандартами

## Метаданные

- **Приоритет:** Критический (блокирует дальнейшую разработку)
- **Тип:** Рефакторинг
- **Затрагивает:** Backend + Frontend
- **Ветка:** `refactor-core`

---

## Контекст проблемы

Проект **Diplom3D** — система автоматического построения 3D-моделей зданий из фотографий планов эвакуации. Основной пайплайн работает, но кодовая база накопила критический архитектурный долг, который:

- делает код трудночитаемым и хрупким
- затрудняет написание тестов
- блокирует дальнейшее развитие (новые фичи ложатся на сломанный фундамент)

### Целевая архитектура (к чему стремимся)

```
api/ (роутеры)        → ТОНКИЙ слой: валидация входа → вызов сервиса → формирование ответа
                         Никакой бизнес-логики, никаких запросов к БД.

services/              → ОРКЕСТРАЦИЯ: бизнес-логика, вызов репозиториев и processing-функций.
                         Знает о БД (через репозитории), знает о файлах (через абстракции).

repositories/          → DATA ACCESS: вся работа с SQLAlchemy session.
                         Один репозиторий на агрегат. Возвращает ORM-модели.

processing/            → ЧИСТЫЕ ФУНКЦИИ: вход (np.ndarray / данные) → выход (результат).
                         Нет DB, нет HTTP, нет file I/O, нет side effects, нет state.
                         Никаких классов-сервисов — только модули с функциями.

models/                → Pydantic модели (API contracts): Request/Response для каждого эндпоинта.

db/models/             → SQLAlchemy ORM модели.
```

---

## Конкретные проблемы и задачи

### ФАЗА 1: Backend — Слой репозиториев (repositories)

#### Проблема
Сейчас `services/` и даже `api/` роутеры напрямую используют `SQLAlchemy session` — запросы к БД разбросаны по всему коду. Нет единого места для data access логики.

#### Что сделать

1. **Создать `backend/app/db/repositories/`** — директорию с репозиториями.

2. **Создать `base_repository.py`** — базовый класс:
   ```python
   # backend/app/db/repositories/base_repository.py
   from sqlalchemy.ext.asyncio import AsyncSession

   class BaseRepository:
       def __init__(self, session: AsyncSession):
           self._session = session
   ```

3. **Создать `reconstruction_repository.py`**:
   - Вынести ВСЕ запросы к БД, связанные с реконструкциями, из `reconstruction_service.py` и `api/reconstruction.py`
   - Методы: `get_by_id()`, `get_list()`, `create()`, `update()`, `delete()`, `get_with_floors()` и т.д.
   - Каждый метод принимает простые аргументы (id, dict с данными), возвращает ORM-модель или `None`
   - Метод НЕ должен знать о Pydantic-моделях или HTTP

4. **Создать `navigation_repository.py`** (если есть запросы к БД в navigation_service):
   - Аналогично: вынести запросы к БД для навигационных графов и маршрутов

5. **Создать `user_repository.py`** (если есть запросы к БД в auth):
   - Вынести запросы по пользователям

#### Критерии готовности
- [ ] Ни один файл за пределами `db/repositories/` не импортирует `select`, `insert`, `update`, `delete` из SQLAlchemy
- [ ] Ни один файл за пределами `db/repositories/` не использует `session.execute()`, `session.add()`, `session.commit()`, `session.flush()`
- [ ] Каждый репозиторий наследуется от `BaseRepository`
- [ ] Все методы репозиториев имеют type hints (параметры и возвращаемое значение)

---

### ФАЗА 2: Backend — Рефакторинг `api/reconstruction.py` (329 строк → тонкий роутер)

#### Проблема
Роутер `api/reconstruction.py` содержит 329 строк. В нём перемешаны: валидация, бизнес-логика, прямые запросы к БД, работа с файлами. Роутер должен быть тонким прокси.

#### Что сделать

1. **Проанализировать каждый эндпоинт** в файле и определить:
   - Что относится к валидации входных данных → оставить в роутере (через Pydantic)
   - Что относится к бизнес-логике → перенести в `reconstruction_service.py`
   - Что относится к доступу к данным → перенести в `reconstruction_repository.py`

2. **Каждый эндпоинт должен выглядеть так** (шаблон):
   ```python
   @router.post("/", response_model=ReconstructionResponse, status_code=201)
   async def create_reconstruction(
       data: ReconstructionCreateRequest,
       service: ReconstructionService = Depends(get_reconstruction_service),
       current_user: User = Depends(get_current_user),
   ):
       """Создать новую реконструкцию."""
       result = await service.create(data=data, user_id=current_user.id)
       return result
   ```

3. **Убедиться, что в роутере НЕТ:**
   - Обращений к `session` / репозиториям напрямую
   - Циклов обработки данных
   - Try/except с бизнес-логикой (исключения должны пробрасываться из сервиса и ловиться глобальным обработчиком)
   - Работы с файловой системой (`open()`, `os.path`, `shutil`)
   - Вызовов `processing/` функций напрямую

4. **Добавить Pydantic Request/Response модели** в `models/reconstruction.py`, если их ещё нет для каких-то эндпоинтов. Каждый эндпоинт = своя пара Request + Response.

#### Критерии готовности
- [ ] `api/reconstruction.py` содержит ≤ 120 строк
- [ ] Каждый эндпоинт — максимум 10-15 строк (включая декоратор, сигнатуру, docstring, вызов сервиса, return)
- [ ] Нет импортов из `sqlalchemy` в файле
- [ ] Нет импортов из `processing/` в файле
- [ ] Нет `open()`, `os.path.*`, `shutil.*` в файле
- [ ] Все эндпоинты имеют `response_model` в декораторе

---

### ФАЗА 3: Backend — Рефакторинг `reconstruction_service.py`

#### Проблема
Сервис смешивает три ответственности: работу с БД, бизнес-логику (оркестрация пайплайна) и файловый I/O. Использует singleton-паттерн вместо dependency injection.

#### Что сделать

1. **Убрать singleton-паттерн**. Сервис должен создаваться через DI (FastAPI `Depends`):
   ```python
   class ReconstructionService:
       def __init__(
           self,
           repo: ReconstructionRepository,
           # другие зависимости
       ):
           self._repo = repo

   # Фабрика для FastAPI DI
   async def get_reconstruction_service(
       session: AsyncSession = Depends(get_session),
   ) -> ReconstructionService:
       repo = ReconstructionRepository(session)
       return ReconstructionService(repo=repo)
   ```

2. **Вынести ВСЮ работу с БД** в `ReconstructionRepository` (см. Фазу 1)

3. **Вынести работу с файловой системой** в отдельный модуль/утилиту (например, `services/file_storage.py` или `core/storage.py`):
   - Сохранение загруженных изображений
   - Сохранение результатов обработки (OBJ, GLB)
   - Чтение файлов
   - Удаление файлов при удалении реконструкции

4. **Оставить в сервисе ТОЛЬКО оркестрацию:**
   - Валидация бизнес-правил (не Pydantic-валидация, а доменная: "можно ли удалить эту реконструкцию?")
   - Координация вызовов: репозиторий → processing → сохранение результата
   - Управление транзакциями (если нужно)

5. **Все методы должны быть `async`** (раз используется async SQLAlchemy)

#### Критерии готовности
- [ ] Нет глобальных/singleton инстансов сервиса
- [ ] Сервис получает зависимости через `__init__` (DI)
- [ ] Нет прямого использования `session` — только через `self._repo`
- [ ] Нет `open()`, `os.path.*` — только через `FileStorage` / аналог
- [ ] Нет `print()` — только `logging` (см. Фазу 6)
- [ ] Каждый публичный метод имеет docstring и type hints

---

### ФАЗА 4: Backend — Рефакторинг `processing/` (классы-сервисы → чистые функции)

#### Проблема
В `processing/` находятся классы вроде `BinarizationService`, хотя по архитектуре `processing/` должен содержать **чистые функции** без side effects, без state, без DB, без HTTP.

#### Что сделать

1. **Для каждого модуля в `processing/`** (`binarization/`, `contour/`, `vectorization/`, `text_removal/`, `mesh_builder/`):

   a. Найти класс-сервис (например, `BinarizationService`)

   b. Извлечь из него чистые функции. Пример:
   ```python
   # БЫЛО (плохо):
   class BinarizationService:
       def __init__(self):
           self.some_state = ...
       
       def binarize(self, image: np.ndarray) -> np.ndarray:
           ...

   # СТАЛО (хорошо):
   def binarize(image: np.ndarray, method: str = "otsu") -> np.ndarray:
       """Бинаризация изображения.
       
       Args:
           image: Входное цветное изображение (BGR, np.uint8).
                  НЕ мутируется — создаётся копия внутри.
           method: Метод бинаризации ("otsu", "adaptive").
       
       Returns:
           Бинарное изображение (np.uint8): стены=255, фон=0.
       """
       img = image.copy()  # ОБЯЗАТЕЛЬНО: не мутировать вход
       ...
   ```

   c. Убедиться, что функция:
   - Принимает данные как аргументы (не читает из файлов / БД)
   - Возвращает результат (не записывает в файлы / БД)
   - Не мутирует входные данные (`.copy()` для `np.ndarray`)
   - Не имеет побочных эффектов
   - Не хранит состояние между вызовами

2. **Обновить `__init__.py`** каждого модуля — экспортировать функции:
   ```python
   # backend/app/processing/binarization/__init__.py
   from .binarization import binarize
   
   __all__ = ["binarize"]
   ```

3. **Обновить вызовы** в `reconstruction_service.py` — заменить `BinarizationService().binarize(img)` на `binarize(img)`

#### Критерии готовности
- [ ] В `processing/` нет классов (только функции и dataclass/TypedDict для параметров, если нужно)
- [ ] Каждая функция — чистая: нет DB, нет HTTP, нет file I/O, нет глобального state
- [ ] Каждая функция делает `.copy()` для входных `np.ndarray`
- [ ] Каждая функция имеет docstring с описанием Args, Returns, формата данных
- [ ] `__init__.py` каждого модуля экспортирует публичный API

---

### ФАЗА 5: Backend — Dependency Injection (убрать singleton)

#### Проблема
Сервисы создаются как singleton (глобальный инстанс). Это затрудняет тестирование, создаёт неявные зависимости и проблемы при работе с async.

#### Что сделать

1. **Создать `backend/app/core/dependencies.py`** — файл с фабриками зависимостей для FastAPI DI:
   ```python
   from fastapi import Depends
   from sqlalchemy.ext.asyncio import AsyncSession
   from app.core.database import get_session
   from app.db.repositories.reconstruction_repository import ReconstructionRepository
   from app.services.reconstruction_service import ReconstructionService

   async def get_reconstruction_repository(
       session: AsyncSession = Depends(get_session),
   ) -> ReconstructionRepository:
       return ReconstructionRepository(session)

   async def get_reconstruction_service(
       repo: ReconstructionRepository = Depends(get_reconstruction_repository),
   ) -> ReconstructionService:
       return ReconstructionService(repo=repo)
   ```

2. **Удалить все глобальные инстансы** сервисов (поиск по паттернам):
   ```python
   # Удалить все подобные строки:
   reconstruction_service = ReconstructionService()
   binarization_service = BinarizationService()
   navigation_service = NavigationService()
   ```

3. **Во всех роутерах заменить** прямое использование на `Depends()`:
   ```python
   # БЫЛО:
   from app.services.reconstruction_service import reconstruction_service
   
   @router.get("/")
   async def list_reconstructions():
       return await reconstruction_service.get_all()

   # СТАЛО:
   from app.core.dependencies import get_reconstruction_service

   @router.get("/")
   async def list_reconstructions(
       service: ReconstructionService = Depends(get_reconstruction_service),
   ):
       return await service.get_all()
   ```

4. **Аналогично для `NavigationService`** и любых других сервисов.

#### Критерии готовности
- [ ] Нет глобальных инстансов сервисов (grep по `= ReconstructionService()`, `= NavigationService()` и т.д.)
- [ ] Все сервисы инжектируются через `Depends()`
- [ ] `core/dependencies.py` содержит все фабрики
- [ ] Все зависимости сервисов (репозитории, storage и т.д.) передаются через `__init__`

---

### ФАЗА 6: Backend — Логирование (print → logging)

#### Проблема
Повсюду используется `print()` вместо `logging`. Нет структурированного логирования, невозможно управлять уровнями, нет контекста (какой запрос, какой пользователь).

#### Что сделать

1. **Настроить базовый logging** в `core/config.py` или отдельном `core/logging_config.py`:
   ```python
   import logging

   def setup_logging(log_level: str = "INFO") -> None:
       logging.basicConfig(
           level=getattr(logging, log_level),
           format="%(asctime)s | %(name)s | %(levelname)s | %(message)s",
           datefmt="%Y-%m-%d %H:%M:%S",
       )
   ```

2. **В каждом модуле** заменить `print()` на `logger`:
   ```python
   import logging

   logger = logging.getLogger(__name__)

   # БЫЛО:
   print(f"Processing image {filename}")
   print(f"Error: {e}")

   # СТАЛО:
   logger.info("Обработка изображения: %s", filename)
   logger.error("Ошибка при обработке: %s", e, exc_info=True)
   ```

3. **Уровни логирования:**
   - `logger.debug()` — детали для отладки (промежуточные значения, размеры массивов)
   - `logger.info()` — значимые события (начало/конец обработки, создание записи)
   - `logger.warning()` — нештатные, но не критичные ситуации
   - `logger.error()` — ошибки с `exc_info=True`

4. **Поиск и замена**: найти все `print(` в `backend/app/` и заменить на соответствующий уровень логирования.

#### Критерии готовности
- [ ] Нет ни одного `print()` в `backend/app/` (кроме, возможно, `main.py` для стартового сообщения)
- [ ] Каждый файл с логированием использует `logger = logging.getLogger(__name__)`
- [ ] `exc_info=True` используется в `logger.error()` где есть except-блоки
- [ ] Настройка логирования вызывается при старте приложения

---

### ФАЗА 7: Frontend — Декомпозиция `AddReconstructionPage.tsx` (400 строк)

#### Проблема
`AddReconstructionPage.tsx` — 400 строк, смешивает логику (API-вызовы, state management, валидацию) с рендерингом (JSX). На фронте нет чёткого разделения `hooks/` и `components/`.

#### Что сделать

1. **Вынести логику в custom hook** `hooks/useAddReconstruction.ts`:
   ```typescript
   // hooks/useAddReconstruction.ts
   export function useAddReconstruction() {
     const [step, setStep] = useState<Step>("upload");
     const [file, setFile] = useState<File | null>(null);
     const [isProcessing, setIsProcessing] = useState(false);
     const [error, setError] = useState<string | null>(null);
     // ... вся логика

     const uploadFile = async (file: File) => { ... };
     const startProcessing = async () => { ... };
     const reset = () => { ... };

     return {
       step, file, isProcessing, error,
       uploadFile, startProcessing, reset,
     };
   }
   ```

2. **Разбить JSX на компоненты** (каждый шаг — отдельный компонент):
   - `components/Reconstruction/UploadStep.tsx` — загрузка файла
   - `components/Reconstruction/CropStep.tsx` — обрезка изображения (если есть)
   - `components/Reconstruction/ProcessingStep.tsx` — индикатор обработки
   - `components/Reconstruction/ResultStep.tsx` — показ результата
   - Каждый компонент получает данные и callbacks через props

3. **Страница становится компоновщиком:**
   ```tsx
   // pages/AddReconstructionPage.tsx
   export default function AddReconstructionPage() {
     const {
       step, file, isProcessing, error,
       uploadFile, startProcessing, reset,
     } = useAddReconstruction();

     return (
       <div>
         {step === "upload" && <UploadStep onUpload={uploadFile} />}
         {step === "crop" && <CropStep file={file!} onConfirm={...} />}
         {step === "processing" && <ProcessingStep />}
         {step === "result" && <ResultStep onReset={reset} />}
         {error && <ErrorMessage message={error} />}
       </div>
     );
   }
   ```

4. **Типизация:**
   - Все props компонентов — через `interface` (не `any`, не `Record<string, unknown>` без нужды)
   - Все useState — с явным generic: `useState<Step>("upload")`
   - Нет `any` нигде

#### Критерии готовности
- [ ] `AddReconstructionPage.tsx` ≤ 80 строк
- [ ] Логика вынесена в `useAddReconstruction.ts`
- [ ] Каждый шаг — отдельный компонент в `components/Reconstruction/`
- [ ] Компоненты не делают API-вызовов напрямую — только через callbacks из хука
- [ ] Нет `any` в новом коде
- [ ] Three.js объекты (если есть) имеют `dispose()` при unmount

---

## Порядок выполнения

Выполняй фазы **строго последовательно**. Каждая фаза зависит от предыдущей.

```
ФАЗА 1 (repositories) → ФАЗА 2 (тонкий роутер) → ФАЗА 3 (сервис)
    → ФАЗА 4 (чистые функции) → ФАЗА 5 (DI) → ФАЗА 6 (logging)
    → ФАЗА 7 (frontend)
```

**Для каждой фазы:**

1. **СНАЧАЛА прочитай** все затрагиваемые файлы целиком. Составь себе карту: что откуда импортируется, где какие зависимости.
2. **Составь план** конкретных изменений (какие файлы создать, какие изменить, что куда перенести).
3. **Выполни изменения.**
4. **После каждой фазы — проверь:**
   - `cd backend && python -m py_compile app/main.py` (или аналог — убедиться, что нет синтаксических ошибок)
   - `cd backend && python -c "from app.main import app"` — приложение импортируется без ошибок
   - Если есть тесты: `cd backend && pytest` (не должны упасть после рефакторинга)
   - На фронте: `cd frontend && npx tsc --noEmit` — проверка типов
5. **Сделай коммит** после каждой фазы:
   - `git add -A && git commit -m "refactor: <описание фазы на русском>"`
   - Коммиты на русском. **НЕ добавлять `Co-authored-by: Claude`.**

---

## Общие правила (соблюдать ВЕЗДЕ)

### Python
- **Type hints** на всех функциях и методах (аргументы + return)
- **Docstrings** на всех публичных функциях/методах/классах
- **`logging`** вместо `print()`
- **`image.copy()`** перед мутацией `np.ndarray`
- **`async/await`** для всех DB-операций
- **Pydantic v2** модели для API (не dict, не TypedDict для Request/Response)
- Названия переменных — осмысленные, на английском

### TypeScript
- **strict mode**, `any` запрещён
- **Interface** для props всех компонентов
- **Явная типизация** useState, параметров, возвратов
- **`dispose()`** cleanup для Three.js при unmount (`useEffect` → return cleanup)
- **Логика в hooks**, компоненты — только рендеринг

### Что НЕ делать
- Не менять бизнес-логику, API-контракты, базу данных — только перемещать код
- Не добавлять новые зависимости без крайней необходимости
- Не переименовывать API-эндпоинты (URL должны остаться прежними)
- Не менять Pydantic-модели ответов (фронтенд не должен сломаться)
- Не менять структуру БД / миграции
- Не трогать `.env`, `config.py` (кроме добавления настройки логирования)

---

## Валидация результата (финальный чеклист)

После завершения ВСЕХ фаз проверь:

### Структура
- [ ] `backend/app/db/repositories/` существует и содержит репозитории
- [ ] `backend/app/core/dependencies.py` существует и содержит DI-фабрики
- [ ] `frontend/src/hooks/useAddReconstruction.ts` существует
- [ ] `frontend/src/components/Reconstruction/` существует и содержит step-компоненты

### Чистота архитектуры
- [ ] `api/` — нет импортов из `sqlalchemy`, `processing/`, нет `open()`/`os.path`
- [ ] `services/` — нет прямого использования `session`, нет `print()`
- [ ] `processing/` — нет классов (только функции), нет DB, нет HTTP, нет file I/O
- [ ] `repositories/` — единственное место, где используется `session`

### Работоспособность
- [ ] Backend запускается без ошибок: `python -c "from app.main import app"`
- [ ] Frontend компилируется: `npx tsc --noEmit`
- [ ] Существующие тесты проходят: `pytest`
- [ ] API-эндпоинты возвращают те же URL и форматы ответов, что и до рефакторинга

### Code quality
- [ ] Нет ни одного `print()` в `backend/app/`
- [ ] Нет ни одного `any` в новом TypeScript-коде
- [ ] Нет singleton-инстансов сервисов
- [ ] Все новые файлы имеют docstring / комментарий в шапке