# Текущее устройство проекта Diplom3D

Документ описывает, как проект организован **на текущий момент**: какие части уже есть, как они связаны между собой, что делает backend и frontend, как устроены загрузка и обработка планов, построение 3D, навигация, хранение данных, stitching и иерархия зданий.

---

## 1. Что делает система

**Diplom3D** — это веб-приложение для работы с планами эвакуации зданий. Основные сценарии:

1. Пользователь или администратор загружает изображение плана эвакуации.
2. Backend обрабатывает изображение: подготавливает его, выделяет контуры, убирает текст, строит векторное представление.
3. На основе результата строится 3D-модель этажа.
4. Пользователь может просматривать модель, редактировать план и строить маршрут между помещениями.
5. Для нескольких изображений или секций существует отдельный режим объединения планов — **stitching**.
6. Администратор может управлять иерархией **корпус → этаж → отсек** через 5-шаговый визуальный wizard-редактор.
7. Между этажами настраиваются **переходы** (лестницы, лифты, телепорты) для мультиэтажной навигации.

Проект объединяет:
- обработку изображений;
- векторизацию плана;
- построение 3D;
- навигацию по зданию (в том числе мультиэтажную);
- хранение данных и авторизацию;
- редактор для объединения изображений;
- иерархию зданий с визуальной разметкой отсеков.

---

## 2. Общая архитектура

Проект разделён на два основных слоя:

- **backend/** — FastAPI-приложение, которое принимает запросы, хранит данные, обрабатывает планы и выдаёт результаты;
- **frontend/** — React + TypeScript интерфейс, который показывает формы, редакторы, 3D-визуализацию и административные экраны.

### Основной технический стек

**Backend:**
- Python 3.12
- FastAPI
- SQLAlchemy
- SQLite в разработке, PostgreSQL для production
- OpenCV, NumPy, scikit-image
- pytesseract для OCR
- trimesh / numpy-stl для 3D-экспорта
- NetworkX для графов
- JWT-аутентификация

**Frontend:**
- React 18
- TypeScript
- Vite
- React Router
- Axios
- Three.js / @react-three/fiber
- Fabric.js для 2D-редактирования
- CSS Modules (vanilla CSS, без Tailwind)

---

## 3. Как устроен backend

Текущий backend находится в `backend/app/` и поделен на несколько областей.

### 3.1 `api/` — HTTP-слой

Папка `backend/app/api/` содержит FastAPI-роутеры:

- `auth.py` — авторизация и JWT;
- `upload.py` — загрузка файлов;
- `reconstruction.py` — работа с реконструкциями;
- `navigation.py` — навигация и маршруты;
- `stitching.py` — объединение планов;
- `buildings.py` — CRUD корпусов;
- `buildings_hierarchy.py` — иерархия корпусов и этажей;
- `floors.py` — CRUD этажей;
- `floor_schema.py` — управление схемой этажа (загрузка, кроп, извлечение стен);
- `sections.py` — CRUD отсеков этажа;
- `transitions.py` — переходы между помещениями;
- `floor_transitions.py` — межэтажные переходы;
- `deps.py` — зависимости для DI.

Главный агрегатор роутеров в `backend/app/api/__init__.py`.

---

### 3.2 `services/` — бизнес-логика

В `backend/app/services/`:

- `reconstruction_service.py` — реконструкция планов;
- `mask_service.py` — генерация и обработка масок;
- `nav_service.py` — навигационные графы и маршруты;
- `file_storage.py` — хранение файлов;
- `stitching_service.py` — объединение планов;
- `building_service.py` — CRUD корпусов;
- `floor_service.py` — CRUD этажей;
- `floor_schema_service.py` — управление схемой этажа;
- `section_service.py` — управление отсеками;
- `transition_service.py` — переходы между помещениями;
- `floor_transition_service.py` — межэтажные переходы.

---

### 3.3 `processing/` — обработка изображений и алгоритмы

В `backend/app/processing/`:

- `binarization.py` — бинаризация;
- `contours.py` — выделение контуров;
- `vectorizer.py` — преобразование в векторное представление;
- `preprocessor.py` — предварительная подготовка;
- `navigation.py` и `nav_graph.py` — логика навигации и графа;
- `mesh_generator.py`, `mesh_builder.py` — построение 3D-модели;
- `pipeline.py` — полный pipeline обработки;
- `multi_plan_graph.py` — мультиэтажный граф навигации;
- `stitching/` — модули для объединения изображений.

---

### 3.4 `db/` — хранение данных

ORM-модели:
- `user.py` — пользователи;
- `building.py` — корпуса и этажи;
- `reconstruction.py` — реконструкции и загруженные файлы;
- `section.py` — отсеки этажей;
- `transition.py` — переходы между помещениями;
- `floor_transition.py` — межэтажные переходы.

Миграции Alembic в `backend/alembic/versions/`.

---

### 3.5 `models/` — Pydantic и доменные модели

Модели для описания входных/выходных данных API и передачи между слоями.

### 3.6 `core/` — инфраструктура

Конфиг, БД-подключение, JWT, логирование, исключения.

---

## 4. Как работает обработка планов

Pipeline:

1. загрузка изображения плана;
2. предварительная обработка;
3. бинаризация;
4. выделение контуров;
5. OCR / удаление текста;
6. векторизация;
7. генерация 3D-модели;
8. построение навигационного графа;
9. поиск маршрута.

---

## 5. Как устроена навигация и маршруты

- визуализация навигационного графа;
- построение маршрута между комнатами;
- мультиэтажная навигация через `multi_plan_graph.py`;
- межэтажные переходы (лестницы, лифты, телепорты);
- тестирование маршрутов (`RouteTestPage`).

---

## 6. Как устроено построение 3D

- генерация геометрии из 2D-контуров;
- экструзия стен;
- экспорт OBJ/GLB;
- визуализация через Three.js.

---

## 7. Как устроен frontend

### 7.1 `pages/`

- `PublicHomePage` — главная;
- `LoginPage`, `RegisterPage`, `ForgotPasswordPage` — авторизация;
- `DashboardPage` — панель администратора;
- `WizardPage` — wizard загрузки;
- `EditPlanPage` — редактирование плана;
- `StitchingPage` — stitching;
- `AdminBuildingsPage` — управление корпусами и этажами;
- `FloorEditorPage` — 5-шаговый wizard-редактор отсеков;
- `FloorViewerPage` — публичный просмотр этажей;
- `TransitionsPage` — управление переходами;
- `RouteTestPage` — тестирование маршрутов;
- `PendingUsersPage` — модерация пользователей.

### 7.2 `components/`

- `Layout/` — AppLayout;
- `Upload/` — upload-компоненты;
- `Wizard/` — wizard steps;
- `Editor/` — WallEditorCanvas (2D-редактор масок);
- `FloorEditor/` — Step1Upload, Step2CropRotate, Step3WallExtraction, Step4MarkSections, Step5BindPlans, NewSectionDialog, PlanGalleryPicker, FloorOverview, FloorSectionsTable, CanvasControls;
- `FloorViewer/` — BuildingFloorSectionSelector, FloorMinimap;
- `MeshViewer/` — просмотр 3D;
- `Stitching/` — stitching panels;
- `Transitions/` — TeleportParamsModal, TransitionPlanCanvas, TransitionPlanList;
- `Toast/` — уведомления;
- `UI/` — базовые примитивы.

### 7.3 `hooks/`

- `useFileUpload`, `useWizard`, `useMeshViewer` — основной flow;
- `useStitching`, `useStitchingCanvas`, `useStitchingHistory` — stitching;
- `useFloorEditorWizard` — 5-шаговый wizard-редактор отсеков;
- `useBuildings`, `useFloors`, `useFloorSections` — иерархия зданий;
- `useFloorViewer` — публичный просмотр;
- `useTransitions` — переходы;
- `useRouteTest` — тестирование маршрутов;
- `useToast` — уведомления.

### 7.4 `api/`

- `apiService.ts` — основной HTTP-клиент;
- `buildingsApi.ts` — CRUD корпусов, этажей, отсеков;
- `floorSchemaApi.ts` — схема этажа;
- `transitionsApi.ts` — переходы и маршруты.

### 7.5 `types/`

- `hierarchy.ts` — Building, Floor, Section, CropBbox, SectionGeometry;
- `transitions.ts` — типы переходов;
- `dashboard.ts`, `reconstruction.ts`, `reconstructionVectors.ts`, `stitching.ts`, `wizard.ts`.

---

## 8. Маршрутизация frontend

### Публичные страницы
- `/` — главная;
- `/viewer` — просмотр этажей;
- `/login`, `/register`, `/forgot-password`.

### Админская часть
- `/admin` — dashboard;
- `/admin/pending-users`;
- `/admin/stitching`;
- `/admin/buildings` — корпуса и этажи;
- `/admin/floor-editor` — wizard-редактор отсеков (`?floor_id=N`);
- `/admin/transitions`, `/admin/transitions/:buildingId`;
- `/admin/route-test`;
- `/admin/edit/:id`.

### Загрузка
- `/upload` — мастер загрузки.

---

## 9. Wizard-редактор отсеков (FloorEditor)

5-шаговый процесс:

1. **Загрузка плана** — drag-and-drop или выбор файла (JPG, PNG, PDF);
2. **Кадрирование и поворот** — выделение области интереса;
3. **Обработка стен** — адаптивная бинаризация с настройкой чувствительности/контраста, ручное рисование и стирание стен (Fabric.js);
4. **Разметка отсеков** — инструменты «Прямоугольник» и «Полигон» для рисования, «Удалить отсек» для удаления кликом (ray-casting), всплывающее окно для номера и цвета;
5. **Привязка к планам** — сопоставление отсеков с реконструкциями, превью маски на canvas.

---

## 10. Stitching

Отдельный сценарий для объединения нескольких планов:
- backend: `processing/stitching/`, `services/stitching_service.py`, `api/stitching.py`;
- frontend: `StitchingPage.tsx` и компоненты в `Stitching/`.

---

## 11. Хранение данных

### База данных
SQLAlchemy ORM: пользователи, корпуса, этажи, отсеки, реконструкции, переходы, межэтажные переходы.

### Файлы
Отдельный слой `file_storage` для изображений, масок, 3D-моделей.

---

## 12. Авторизация

JWT-аутентификация. Роли: обычный пользователь и администратор. Экраны: логин, регистрация, восстановление пароля, модерация.

---

## 13. Что уже реализовано

- загрузка планов эвакуации;
- бинаризация, контуры, OCR, векторизация;
- генерация 3D-модели и просмотр;
- построение навигационного графа и маршрутов (включая мультиэтажные);
- авторизация и CRUD реконструкций;
- редактор масок;
- stitching;
- CRUD корпусов и этажей;
- 5-шаговый wizard-редактор отсеков;
- межэтажные переходы и тестирование маршрутов;
- публичный просмотр этажей.

---

## 14. Технический долг

- часть `processing/` содержит более сложную логику, чем чистые функции;
- местами бизнес-логика близка к HTTP-слою;
- reconstruction service слишком большой;
- часть HTTP-ручек stubbed;
- на frontend есть `any`/`unknown` casts;
- документы должны регулярно сверяться с кодом.

---

## 15. Краткая карта проекта

### Backend
- `api/` — HTTP-роутеры (auth, upload, reconstruction, navigation, stitching, buildings, floors, sections, transitions, floor_transitions, floor_schema)
- `services/` — бизнес-логика
- `processing/` — CV, 3D, навигация, stitching
- `db/` — ORM, репозитории, миграции
- `models/` — Pydantic-модели
- `core/` — конфигурация

### Frontend
- `pages/` — экраны (12 страниц)
- `components/` — UI (FloorEditor, FloorViewer, Transitions, Editor, Wizard, Stitching, MeshViewer, Layout, Toast, UI)
- `hooks/` — состояние и логика (17 хуков)
- `api/` — HTTP-клиент (4 модуля)
- `types/` — TypeScript-типы (7 файлов)

---

## 16. Итог

Diplom3D — связанная система, в которой backend обрабатывает планы и хранит результаты, frontend даёт интерфейс для загрузки, редактирования и просмотра, 3D-модель строится из векторизованного плана, навигация работает мультиэтажно, а иерархия корпус → этаж → отсек управляется через визуальный wizard-редактор. Проект находится в состоянии **работающего продукта**, где все основные сценарии реализованы.
