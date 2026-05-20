# Architecture: Stitching-Plans

## C4 Level 1 — System Context

WHO interacts with the system and WHAT external systems are involved.

```mermaid
C4Context
title System Context — Stitching-Plans
Person(user, "Администратор", "Загружает планы, размечает, сшивает секции")
System(system, "Diplom3D", "Система оцифровки планов эвакуации")
SystemDb_Ext(storage, "File Storage", "Хранит изображения, маски, 3D-модели")
Rel(user, system, "Выбирает планы, размещает на холсте, сшивает")
Rel(system, storage, "Читает растровые изображения и векторные модели")
```

## C4 Level 2 — Container

WHAT services/containers and HOW they communicate.

```mermaid
C4Container
title Container Diagram — Stitching-Plans
Container(frontend, "React App", "TypeScript + Fabric.js", "UI: выбор планов + canvas-редактор")
Container(backend, "FastAPI", "Python 3.12", "REST API + обработка")
ContainerDb(db, "PostgreSQL", "Database", "Хранит реконструкции, векторные модели")
Container(storage, "File Storage", "Disk/S3", "Изображения + маски")
Rel(frontend, backend, "HTTP/REST", "POST /api/v1/stitching/")
Rel(backend, db, "SQLAlchemy", "Читает vectorization_data")
Rel(backend, storage, "File I/O", "Читает растровые изображения")
```

## C4 Level 3 — Component

WHAT internal modules handle the feature logic.

### 3.1 Backend Components

```mermaid
C4Component
title Stitching-Plans — Backend Components
Component(router, "API Router", "FastAPI", "api/stitching.py — валидация → вызов сервиса")
Component(service, "StitchingService", "Python", "Оркестрация: загрузка → трансформация → merge → сохранение")
Component(processing, "Processing Functions", "OpenCV + Shapely", "Чистые функции: affine, clip, merge, normalize")
Component(repo, "ReconstructionRepository", "SQLAlchemy", "Чтение vectorization_data из БД")
Component(models, "Pydantic Models", "models/stitching.py", "StitchingRequest, StitchingResponse")
Rel(router, service, "Вызывает stitch_plans()")
Rel(service, processing, "Вызывает build_affine_matrix(), clip_walls(), merge_models()")
Rel(service, repo, "Загружает VectorizationResult из БД")
Rel(router, models, "Валидирует запрос/ответ")
```

**Processing modules:**
- `processing/stitching/transform.py` — аффинные трансформации (scale → rotate → translate)
- `processing/stitching/clip.py` — обрезка стен/комнат/дверей (Shapely difference)
- `processing/stitching/merge.py` — объединение моделей + нормализация к [0,1]
- `processing/stitching/image_stitch.py` — сшивание растровых изображений (OpenCV warpAffine)

### 3.2 Frontend Components

```mermaid
C4Component
title Stitching-Plans — Frontend Components
Component(page, "StitchingPage", "React", "Страница-оркестратор: шаг 1 → шаг 2")
Component(step1, "PlanSelectionStep", "React", "Форма выбора: здание, этаж, карточки планов")
Component(canvas, "StitchingCanvas", "Fabric.js", "Холст: загрузка планов, трансформации, экспорт")
Component(sidebar, "StitchingSidebar", "React", "Правая панель: инструменты + слои + свойства")
Component(hook, "useStitching", "Hook", "Состояние: планы, слои, API-вызов")
Component(canvasHook, "useStitchingCanvas", "Hook", "Логика Fabric.js: трансформации, clip")
Component(historyHook, "useStitchingHistory", "Hook", "Undo/redo стек (max 50)")
Rel(page, step1, "Рендерит на шаге 1")
Rel(page, canvas, "Рендерит на шаге 2")
Rel(page, sidebar, "Рендерит на шаге 2")
Rel(page, hook, "Использует состояние")
Rel(canvas, canvasHook, "Использует логику canvas")
Rel(canvas, historyHook, "Использует undo/redo")
```

## Module Dependency Graph

### Backend

```mermaid
flowchart BT
router[api/stitching.py] --> service[services/stitching_service.py]
service --> processing[processing/stitching/]
service --> repo[db/repositories/reconstruction_repo.py]
processing -.->|NEVER| service
processing -.->|NEVER| router
processing -.->|NEVER| repo
```

**Rule:** Dependencies flow inward. `processing/` has ZERO external imports (no DB, no HTTP, no FastAPI).

### Frontend

```mermaid
flowchart BT
page[pages/StitchingPage.tsx] --> hook[hooks/useStitching.ts]
page --> components[components/Stitching/]
components --> canvasHook[hooks/useStitchingCanvas.ts]
components --> historyHook[hooks/useStitchingHistory.ts]
hook --> api[api/apiService.ts]
```

**Rule:** Logic in hooks, components only render. No business logic in components.

## Key Architectural Decisions

### 1. Coordinate System Strategy

**Problem:** Plans have different sizes, rotations, positions on canvas. How to merge?

**Solution:** Three coordinate spaces:
1. **Canvas space (pixels)** — where user positions plans on Fabric.js canvas
2. **Image space (pixels)** — original image dimensions of each plan
3. **Normalized space [0,1]** — stored in DB, used for 3D generation

**Transformation pipeline:**
```
DB [0,1] → denormalize → Image pixels → affine transform → Canvas pixels
                                                          ↓
                                      clip polygons (canvas space)
                                                          ↓
                                      merge all plans → bounding box
                                                          ↓
                                      normalize → DB [0,1]
```

### 2. Pure Processing Functions

**Pattern from existing code:** `processing/pipeline.py` contains pure functions (no DB, no HTTP).

**Applied to stitching:**
- `processing/stitching/transform.py` — pure numpy/math operations
- `processing/stitching/clip.py` — pure Shapely operations
- `processing/stitching/merge.py` — pure list concatenation + normalization

**Service layer** (`services/stitching_service.py`) orchestrates: load from DB → call processing → save to DB.

### 3. Fabric.js Canvas for Positioning

**Why Fabric.js:** Already used in `WallEditorCanvas.tsx` for wall editing. Provides:
- Object transformations (move, rotate, scale)
- clipPath for polygon clipping
- Event handling for tools
- Export to JSON

**Reuse pattern:** Similar structure to `WallEditorCanvas.tsx`:
- Canvas in component, logic in hook (`useStitchingCanvas.ts`)
- Refs for Fabric.js objects (avoid React state for Three.js/Fabric objects)
- Cleanup on unmount (`canvas.dispose()`)

### 4. Two-Step Workflow

**Pattern from existing code:** `WizardPage.tsx` uses multi-step wizard with `WizardShell`.

**Applied to stitching:**
- **Step 1:** Plan selection form (separate page, no canvas yet)
  - Validates ≥2 plans selected
  - Stores selection in state
- **Step 2:** Canvas editor (full-screen)
  - Loads selected plans
  - User positions/crops
  - Exports transformations

**Why separate steps:** Canvas is heavy (Fabric.js + images). Don't load until plans selected.

### 5. Undo/Redo Strategy

**Snapshot-based:** Store full state after each action (not delta-based).

**Why:** Transformations are complex (affine matrix + clip polygons). Easier to snapshot than compute inverse operations.

**Limit:** 50 snapshots (FIFO). Prevents memory issues with large plans.

### 6. Clip Polygon Semantics

**User expectation:** "Remove overlap zones" = subtract (delete inside polygon).

**Fabric.js clipPath:** Shows what's INSIDE (opposite of user expectation).

**Solution:** Use `inverted: true` (Fabric.js 5+) or create outer rect with hole.

### 7. Database Model Extension

**Existing:** `Reconstruction.vectorization_data` (JSON TEXT) stores `VectorizationResult`.

**Extension for stitching:**
- Add `source_reconstruction_ids` (JSON array) — tracks which plans were merged
- Add `is_stitched` (boolean) — flag for filtering

**Why not new table:** Stitched reconstruction IS a reconstruction. Same structure, same 3D pipeline.

### 8. Error Handling for Duplicate Rooms

**Problem:** User didn't fully crop overlap → two rooms with same name (e.g., "A304") close together.

**Solution:** Detect in `check_duplicate_rooms()` (distance threshold 30px). Return warnings, don't block.

**Why warnings not errors:** User might intentionally have two "A304" (different buildings, same floor number). Let them decide.
