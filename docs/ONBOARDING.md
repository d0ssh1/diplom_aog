# Diplom3D — Onboarding Guide

## Что это за проект

**Diplom3D** — веб-приложение для построения 3D-моделей этажей зданий на основе планов эвакуации. На текущий момент в проекте уже есть рабочие сценарии:

- загрузка планов и вспомогательных файлов;
- обработка изображения плана;
- построение маски и векторного представления;
- генерация 3D-модели;
- просмотр модели в браузере;
- редактирование плана и повторная сборка графа;
- stitching нескольких планов в один;
- построение маршрутов между помещениями;
- иерархия корпус → этаж → отсек с 5-шаговым wizard-редактором отсеков;
- управление переходами между этажами (лестницы, лифты, телепорты);
- тестирование маршрутов между помещениями разных этажей.

Проект развивается не как "чистый target architecture", а как работающая кодовая база с заметным техническим долгом и частично незавершёнными ручками.

---

## Текущий пользовательский сценарий

### Основной flow

```text
Загрузка плана → preprocessing → mask → editor → nav graph → 3D build → save
```

### Административный flow (Редактор отсеков)

```text
Выбор этажа → Загрузка плана → Кадрирование → Обработка (стены/маска) → Разметка отсеков → Привязка к планам
```

### Дополнительные сценарии

- просмотр сохранённой реконструкции в 3D;
- редактирование существующего плана;
- stitching нескольких реконструкций;
- просмотр списка реконструкций в админской панели;
- управление корпусами и этажами;
- настройка переходов между этажами (лестницы, лифты);
- тестирование маршрутов между помещениями (RouteTestPage);
- публичный просмотр этажей здания (FloorViewerPage).

---

## Стек

### Backend
- Python 3.12
- FastAPI
- SQLAlchemy
- SQLite в разработке / PostgreSQL в production
- OpenCV, NumPy, scikit-image
- pytesseract
- trimesh, shapely
- NetworkX
- JWT

### Frontend
- React 18
- TypeScript
- Vite
- React Router
- Axios
- Three.js / @react-three/fiber
- Fabric.js
- CSS Modules (vanilla CSS)

### Инфраструктура
- Alembic
- pytest
- ESLint
- Git

---

## Как устроен backend сейчас

### `backend/main.py`

- создаёт FastAPI-приложение;
- включает CORS;
- монтирует директорию uploads как статику;
- подключает все API-роутеры;
- имеет `/` и `/health`.

### `backend/app/api/`

Фактически подключены роутеры:
- `auth` — авторизация и JWT;
- `upload` — загрузка файлов;
- `reconstruction` — работа с реконструкциями;
- `navigation` — навигация и маршруты;
- `stitching` — объединение планов;
- `buildings` — CRUD корпусов;
- `buildings_hierarchy` — иерархия корпусов и этажей;
- `floors` — CRUD этажей;
- `floor_schema` — управление схемой этажа (загрузка, кроп, извлечение стен);
- `sections` — CRUD отсеков этажа;
- `transitions` — переходы между помещениями (двери, лестницы);
- `floor_transitions` — межэтажные переходы;
- `deps` — зависимости для dependency injection.

Что важно знать:
- часть эндпоинтов уже работает полноценно;
- часть всё ещё является заглушкой или неполностью реализована;
- в отдельных местах HTTP-слой содержит не только валидацию, но и прикладную логику.

### `backend/app/services/`

Здесь находится оркестрация прикладных сценариев:
- `reconstruction_service` — реконструкция планов;
- `mask_service` — генерация и обработка масок;
- `nav_service` — навигационные графы и маршруты;
- `file_storage` — хранение файлов;
- `stitching_service` — объединение планов;
- `building_service` — CRUD корпусов;
- `floor_service` — CRUD этажей;
- `floor_schema_service` — управление схемой этажа;
- `section_service` — управление отсеками;
- `transition_service` — переходы между помещениями;
- `floor_transition_service` — межэтажные переходы.

Сервисы уже реально используются роутерами и являются основным связующим слоем между API, БД и processing.

### `backend/app/processing/`

Это слой компьютерного зрения и геометрической обработки. Здесь уже есть реальные функции для:
- бинаризации;
- фильтрации цвета;
- авто-кропа;
- OCR и удаления текста;
- поиска и классификации комнат;
- поиска дверей;
- расчёта масштаба;
- нормализации координат;
- построения 3D mesh;
- A* навигации;
- stitching/merge/clip/transform;
- построения мультиэтажного графа навигации (`multi_plan_graph`).

### `backend/app/db/`

Хранение данных уже разделено на:
- ORM-модели;
- репозитории;
- миграции Alembic.

Основные сущности сейчас:
- `user` — пользователи;
- `building` — корпуса и этажи (иерархия);
- `reconstruction` — реконструкции и загруженные файлы;
- `section` — отсеки этажей;
- `transition` — переходы между помещениями;
- `floor_transition` — межэтажные переходы.

---

## Как устроен frontend сейчас

### `frontend/src/App.tsx`

Роуты:
- `/` — public home;
- `/viewer` — публичный просмотр этажей;
- `/login`, `/register`, `/forgot-password`;
- `/admin` — layout с dashboard;
- `/admin/pending-users`;
- `/admin/stitching`;
- `/admin/buildings` — управление корпусами и этажами;
- `/admin/floor-editor` — 5-шаговый wizard-редактор отсеков;
- `/admin/transitions` — управление переходами;
- `/admin/transitions/:buildingId`;
- `/admin/route-test` — тестирование маршрутов;
- `/admin/edit/:id` — редактирование плана;
- `/upload` — мастер загрузки;
- fallback на `/`.

### Страницы

- `DashboardPage` — список реконструкций и удаление;
- `WizardPage` — основной 6-шаговый flow загрузки/обработки;
- `EditPlanPage` — редактирование существующего плана;
- `ViewMeshPage` — отдельный просмотр 3D;
- `StitchingPage` — workspace для stitching;
- `AdminBuildingsPage` — CRUD корпусов и этажей;
- `FloorEditorPage` — 5-шаговый wizard-редактор отсеков (загрузка → кадрирование → стены → разметка отсеков → привязка планов);
- `FloorViewerPage` — публичный просмотр этажей здания;
- `TransitionsPage` — управление переходами между этажами;
- `RouteTestPage` — тестирование маршрутов;
- `LoginPage`, `RegisterPage`, `ForgotPasswordPage`, `PublicHomePage`, `PendingUsersPage`.

### Хуки

Основная логика вынесена в hooks:
- `useFileUpload` — загрузка файлов;
- `useWizard` — wizard-процесс;
- `useMeshViewer` — просмотр 3D;
- `useStitching` — логика stitching;
- `useStitchingCanvas` — canvas-логика stitching;
- `useStitchingHistory` — history/undo для stitching;
- `useFloorEditorWizard` — 5-шаговый wizard-редактор отсеков;
- `useBuildings` — CRUD корпусов;
- `useFloors` — CRUD этажей;
- `useFloorSections` — управление отсеками;
- `useFloorViewer` — публичный просмотр этажей;
- `useTransitions` — переходы между этажами;
- `useRouteTest` — тестирование маршрутов;
- `useToast` — система уведомлений.

### Компоненты

Есть отдельные зоны UI:
- `Layout/` — общий layout (AppLayout);
- `Upload/` — upload-компоненты;
- `Wizard/` — wizard steps (основной flow);
- `Editor/` — 2D-редактор масок и стен (WallEditorCanvas);
- `FloorEditor/` — компоненты 5-шагового wizard-редактора отсеков (Step1Upload, Step2CropRotate, Step3WallExtraction, Step4MarkSections, Step5BindPlans, NewSectionDialog, PlanGalleryPicker, FloorOverview, FloorSectionsTable, CanvasControls);
- `FloorViewer/` — публичный просмотр этажей (BuildingFloorSectionSelector, FloorMinimap);
- `MeshViewer/` — просмотр 3D-модели;
- `Stitching/` — stitching panels;
- `Transitions/` — UI для переходов между этажами (TeleportParamsModal, TransitionPlanCanvas, TransitionPlanList);
- `Toast/` — система тост-уведомлений;
- `UI/` — базовые UI-примитивы;
- `CropSelector` — компонент выделения области;
- `MaskEditor` — редактор маски.

### API-клиент

Клиентские API-модули:
- `apiService.ts` — основной HTTP-клиент (upload, reconstruction, navigation, stitching, mask-preview);
- `buildingsApi.ts` — CRUD корпусов, этажей, отсеков;
- `floorSchemaApi.ts` — управление схемой этажа;
- `transitionsApi.ts` — переходы и маршруты.

### Типы

TypeScript-типы вынесены в `types/`:
- `hierarchy.ts` — Building, Floor, Section, CropBbox, SectionGeometry;
- `transitions.ts` — типы переходов;
- `dashboard.ts` — типы для dashboard;
- `reconstruction.ts` — типы реконструкций;
- `reconstructionVectors.ts` — векторные данные;
- `stitching.ts` — типы для stitching;
- `wizard.ts` — типы для wizard.

---

## Что уже работает

### 1. Загрузка и хранение файлов

- загрузка plan photo;
- загрузка user mask;
- загрузка environment photo;
- сохранение файлов в uploads;
- запись metadata в БД.

### 2. Обработка изображения

- предварительная обработка;
- бинаризация;
- поиск контуров;
- OCR и удаление текста;
- выделение комнат и дверей;
- нормализация координат;
- оценка масштаба.

### 3. 3D

- построение mesh из маски;
- экспорт OBJ/GLB;
- просмотр модели во frontend.

### 4. Навигация

- построение навигационных данных на уровне processing;
- поиск пути A* на уровне processing;
- мультиэтажный граф навигации;
- UI для построения маршрута между комнатами;
- тестирование маршрутов (RouteTestPage).

### 5. Stitching

- выбор нескольких реконструкций;
- transform/crop/clip;
- merge;
- сохранение stitched reconstruction;
- отдельный editor workspace.

### 6. Admin / auth

- JWT auth;
- pending users page;
- admin layout;
- список реконструкций;
- удаление реконструкций.

### 7. Иерархия зданий

- CRUD корпусов (создание, редактирование, удаление);
- CRUD этажей внутри корпусов;
- 5-шаговый wizard-редактор отсеков:
  - Шаг 1: загрузка плана этажа;
  - Шаг 2: кадрирование и поворот;
  - Шаг 3: обработка стен (маска с настраиваемыми параметрами, ручное редактирование);
  - Шаг 4: разметка отсеков (прямоугольник/полигон, удаление кликом, всплывающее окно с номером и цветом);
  - Шаг 5: привязка планов к реконструкциям;
- обзор этажа (FloorOverview) и табличное представление (FloorSectionsTable);
- публичный просмотр этажей (FloorViewerPage с минимапой).

### 8. Переходы

- управление переходами между помещениями (двери, лестницы, лифты, телепорты);
- межэтажные переходы;
- визуализация на canvas;
- тестирование маршрутов между помещениями разных этажей.

---

## Что реализовано частично

- backend navigation API пока возвращает заглушки, хотя алгоритмы в processing уже есть;
- часть rooms endpoints в reconstruction API не завершена;
- patch reconstruction endpoint пока пустой;
- upload/stitching используют placeholder user_id;
- некоторые ответы frontend приводятся через касты и fallback shapes;
- часть данных редактирования хранится и синхронизируется через JSON vectorization_data.

---

## Технический долг

### Backend
- бизнес-логика местами живёт в API-роутерах;
- reconstruction service слишком большой и отвечает за несколько задач сразу;
- stitching service содержит внутренние промежуточные Pydantic-модели;
- часть HTTP-ручек stubbed;
- user id resolution для отдельных flow пока placeholder;
- vectorization data хранится как JSON/Text, а не полностью нормализованно.

### Frontend
- есть `any` и `unknown` casts в API/хуках;
- часть данных загружается дублирующими путями;
- `restoreCanvasFromSnapshot()` пока пустой;
- некоторые flow опираются на fallback shapes вместо строгих контрактов.

### Документация
- документы должны регулярно сверяться с кодом и актуализироваться.

---

## Важные файлы для старта

### Backend
- `backend/main.py`
- `backend/app/api/__init__.py`
- `backend/app/api/upload.py`
- `backend/app/api/reconstruction.py`
- `backend/app/api/navigation.py`
- `backend/app/api/stitching.py`
- `backend/app/api/buildings.py`
- `backend/app/api/buildings_hierarchy.py`
- `backend/app/api/floors.py`
- `backend/app/api/floor_schema.py`
- `backend/app/api/sections.py`
- `backend/app/api/transitions.py`
- `backend/app/api/floor_transitions.py`
- `backend/app/services/reconstruction_service.py`
- `backend/app/services/building_service.py`
- `backend/app/services/floor_service.py`
- `backend/app/services/floor_schema_service.py`
- `backend/app/services/section_service.py`
- `backend/app/services/transition_service.py`
- `backend/app/services/stitching_service.py`
- `backend/app/processing/pipeline.py`
- `backend/app/processing/vectorizer.py`
- `backend/app/processing/mesh_builder.py`
- `backend/app/processing/navigation.py`
- `backend/app/processing/multi_plan_graph.py`
- `backend/app/db/models/building.py`
- `backend/app/db/models/section.py`
- `backend/app/db/models/transition.py`
- `backend/app/db/models/floor_transition.py`
- `backend/app/db/models/reconstruction.py`

### Frontend
- `frontend/src/App.tsx`
- `frontend/src/pages/FloorEditorPage.tsx`
- `frontend/src/pages/AdminBuildingsPage.tsx`
- `frontend/src/pages/FloorViewerPage.tsx`
- `frontend/src/pages/TransitionsPage.tsx`
- `frontend/src/pages/RouteTestPage.tsx`
- `frontend/src/pages/WizardPage.tsx`
- `frontend/src/pages/EditPlanPage.tsx`
- `frontend/src/pages/StitchingPage.tsx`
- `frontend/src/hooks/useFloorEditorWizard.ts`
- `frontend/src/hooks/useBuildings.ts`
- `frontend/src/hooks/useFloors.ts`
- `frontend/src/hooks/useFloorViewer.ts`
- `frontend/src/hooks/useTransitions.ts`
- `frontend/src/hooks/useRouteTest.ts`
- `frontend/src/hooks/useWizard.ts`
- `frontend/src/hooks/useStitching.ts`
- `frontend/src/api/apiService.ts`
- `frontend/src/api/buildingsApi.ts`
- `frontend/src/api/floorSchemaApi.ts`
- `frontend/src/api/transitionsApi.ts`
- `frontend/src/components/FloorEditor/*`
- `frontend/src/components/FloorViewer/*`
- `frontend/src/components/Transitions/*`
- `frontend/src/components/MeshViewer/*`
- `frontend/src/components/Stitching/*`

---

## Как начинать работу с кодом

1. Сначала читать `prompts/project_context.md` и `prompts/architecture.md`.
2. Затем смотреть конкретную область кода.
3. Для backend-полного контекста проверять `backend/app/api`, `services`, `processing`, `db`, `models`.
4. Для frontend смотреть `App.tsx`, pages, hooks и соответствующие component folders.
5. Всегда сверять документацию с текущим кодом, а не только со стандартами.

---

## Коротко

Проект уже умеет всё основное, что нужно для сценария ВКР: загрузка, обработка, 3D, маршрут, редактирование, stitching. Поверх этого реализована полноценная иерархия корпус → этаж → отсек с визуальным 5-шаговым wizard-редактором, межэтажные переходы и тестирование маршрутов. Но архитектура ещё не полностью вычищена, несколько endpoint'ов stubbed, а документы должны регулярно актуализироваться.
