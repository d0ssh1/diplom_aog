# Architecture: Diplom3D — Floor Plan Digitizer

## System Overview
Система принимает фотографию аварийного плана эвакуации и строит интерактивную
3D-модель здания с возможностью редактирования и навигации по кратчайшему маршруту.

## Core Pipeline
```
Image Upload → Preprocessing → Wall Vectorization → Text Removal
    → FloorPlan Model → 3D Build → Editor → Pathfinding (A*)
```
Каждый шаг — отдельный модуль с чётко определёнными входом и выходом.
Модули НЕ должны вызывать друг друга напрямую — только через сервисный слой.

---

## Backend Structure: `backend/app/`

### `processing/` — Обработка изображений (OpenCV)
- **Ответственность**: всё, что связано с пикселями и компьютерным зрением
- **Вход**: raw image (bytes / file path)
- **Выход**: обработанное изображение, векторные данные (JSON/SVG)
- Подмодули: preprocessing, vectorization, text_removal
- **Принцип**: чистые функции, нет зависимостей от FastAPI, нет БД

### `services/` — Бизнес-логика
- **Ответственность**: оркестрация пайплайна, работа с моделями
- Вызывает `processing/` и `db/`, не знает о HTTP
- Один сервис = одна доменная область (FloorPlanService, BuildingService, PathfindingService)
- **Принцип**: сервисы зависят от репозиториев через интерфейсы (dependency injection через FastAPI Depends)

### `models/` — Pydantic модели
- **Request/Response модели**: только для API слоя (суффикс `Request`, `Response`)
- **Domain модели**: внутренние сущности (FloorPlan, Wall, Room, Building)
- Pydantic v2, все поля с аннотациями типов
- **Принцип**: API модели ≠ domain модели, маппинг явный

### `api/` — FastAPI роутеры
- Тонкий слой: валидация входа → вызов сервиса → возврат ответа
- Один файл = один роутер (floor_plans.py, buildings.py, navigation.py)
- Prefix: `/api/v1/`
- **Принцип**: никакой бизнес-логики в роутерах

### `db/` — База данных
- SQLAlchemy ORM модели (суффикс `Model`, напр. `FloorPlanModel`)
- Репозитории как классы с методами CRUD
- Migrations через Alembic
- **Принцип**: ORM модели ≠ domain модели, маппинг через репозитории

### `core/` — Конфигурация
- Settings через pydantic-settings
- Security (JWT если есть)
- Logging, exceptions

---

## Frontend Structure: `frontend/src/`

### `api/` — HTTP клиент
- Axios instance с base URL и interceptors
- Один файл = один ресурс (floorPlansApi.ts, buildingsApi.ts)
- Все типы запросов/ответов явно типизированы

### `components/` — React компоненты
- Атомарные компоненты без бизнес-логики
- Редакторы: VectorEditor, FloorEditor, BuildingEditor
- 3D: ThreeViewer (Three.js обёртка)
- Навигация: PathOverlay

### `pages/` — Страницы
- Сборка компонентов + вызов хуков
- Маршрутизация через React Router

### `hooks/` — Custom hooks
- Вся логика работы с состоянием и API
- useFloorPlan, useVectorEditor, usePathfinding, use3DBuilder

---

## Доменные сущности

```
FloorPlan
  ├── id: UUID
  ├── image_url: str
  ├── walls: List[Wall]
  ├── rooms: List[Room]
  └── metadata: FloorPlanMeta

Wall
  ├── id: UUID
  ├── points: List[Point2D]   ← полилиния
  └── thickness: float

Room
  ├── id: UUID
  ├── name: str               ← "Аудитория 301"
  ├── polygon: List[Point2D]
  └── room_type: RoomType

Building
  ├── id: UUID
  ├── name: str
  └── floors: List[Floor]     ← упорядоченные этажи

Floor
  ├── floor_number: int
  └── sections: List[FloorPlan]  ← склеенные секции

NavigationGraph
  ├── nodes: List[Node]
  └── edges: List[Edge]       ← для A*
```

---

## Принципы, которым должен следовать каждый агент

1. `processing/` никогда не импортирует из `api/` или `db/`
2. `api/` роутеры никогда не содержат бизнес-логику
3. Все функции в `processing/` — чистые (нет side effects)
4. Каждая новая фича добавляет тесты в `backend/tests/`
5. TypeScript strict mode, `any` запрещён
6. Новые API эндпоинты всегда имеют Pydantic схемы запроса и ответа
