# Architecture: Text & Color Removal

## C4 Level 1 — System Context

```mermaid
C4Context
    title System Context — Text & Color Removal
    Person(admin, "Администратор", "Загружает планы эвакуации")
    System(system, "Diplom3D", "Оцифровка планов → 3D модели")
    Rel(admin, system, "Загружает план, получает маску и 3D модель")
```

Фича не добавляет новых внешних систем. Единственная внешняя зависимость — Tesseract OCR binary (уже установлен, pytesseract — обёртка).

## C4 Level 2 — Container

```mermaid
C4Container
    title Container Diagram — Text & Color Removal
    Container(frontend, "React App", "TypeScript", "UI: загрузка плана, отображение маски")
    Container(backend, "FastAPI", "Python 3.12", "REST API + image processing")
    ContainerDb(db, "SQLite/PostgreSQL", "Database", "Reconstructions, vectorization_data")
    Container(storage, "File Storage", "Disk", "plans/, masks/, masks/*_text.json")
    Rel(frontend, backend, "POST /reconstruction/initial-masks", "HTTP")
    Rel(backend, db, "SQLAlchemy")
    Rel(backend, storage, "cv2.imread / cv2.imwrite / json.dump")
```

Изменения только в backend — frontend не затрагивается (шаги включены по умолчанию, параметры не передаются с фронта).

## C4 Level 3 — Backend Components

### 3.1 Затронутые модули

```mermaid
C4Component
    title Text & Color Removal — Backend Components
    Component(router, "api/reconstruction.py", "FastAPI Router", "POST /initial-masks — без изменений")
    Component(mask_svc, "services/mask_service.py", "MaskService", "Оркестрация: load → color removal → binarize → text removal → save")
    Component(pipeline, "processing/pipeline.py", "Pure Functions", "color_filter_green, color_filter_red, text_detect, remove_text_regions")
    Component(domain, "models/domain.py", "Pydantic Models", "TextBlock (без изменений)")
    Component(exceptions, "core/exceptions.py", "Exceptions", "ImageProcessingError (без изменений)")
    Rel(router, mask_svc, "calculate_mask()")
    Rel(mask_svc, pipeline, "Вызывает pure functions")
    Rel(pipeline, domain, "Возвращает List[TextBlock]")
    Rel(pipeline, exceptions, "Raises ImageProcessingError")
```

### 3.2 Новые и изменяемые компоненты

| Компонент | Файл | Изменение |
|-----------|------|-----------|
| `remove_green_elements()` | `processing/pipeline.py` | **NEW** — HSV фильтрация зелёного + inpaint |
| `remove_red_elements()` | `processing/pipeline.py` | **NEW** — HSV фильтрация красного + морфологическое восстановление стен |
| `remove_colored_elements()` | `processing/pipeline.py` | **NEW** — оркестратор: green → red → wall repair |
| `text_detect()` | `processing/pipeline.py` | Без изменений (уже реализована) |
| `remove_text_regions()` | `processing/pipeline.py` | Без изменений (уже реализована) |
| `MaskService.calculate_mask()` | `services/mask_service.py` | **MODIFY** — добавить шаги color removal + text removal |

### 3.3 Что НЕ меняется

- `api/reconstruction.py` — роутер остаётся тонким, параметры не добавляются
- `models/domain.py` — `TextBlock` уже содержит все нужные поля
- `core/exceptions.py` — `ImageProcessingError` уже подходит
- `services/reconstruction_service.py` — уже загружает `_text.json`, логика не меняется
- Frontend — никаких изменений

## Module Dependency Graph

```mermaid
flowchart BT
    router["api/reconstruction.py"] --> mask_svc["services/mask_service.py"]
    mask_svc --> pipeline["processing/pipeline.py"]
    pipeline --> domain["models/domain.py"]
    pipeline --> exceptions["core/exceptions.py"]
    recon_svc["services/reconstruction_service.py"] --> pipeline
    pipeline -.->|"NEVER"| mask_svc
    pipeline -.->|"NEVER"| router
    pipeline -.->|"NEVER"| recon_svc
```

**Rule:** `processing/pipeline.py` — чистые функции. Нет импортов из `api/`, `services/`, `db/`. Нет файлового I/O, нет HTTP, нет side effects.

Файловый I/O (сохранение `_text.json`) — ответственность `MaskService`, не `pipeline.py`.
