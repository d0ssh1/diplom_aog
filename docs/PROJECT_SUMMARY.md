# Diplom3D — Project Summary

## Краткое описание

**Diplom3D** — веб-приложение для построения 3D-моделей этажей зданий на основе планов эвакуации. Проект уже содержит рабочие сценарии загрузки, обработки изображений, генерации 3D-модели, просмотра модели, редактирования плана, построения маршрута и stitching нескольких источников.

**Основной сценарий использования:**
1. Пользователь загружает изображение плана эвакуации.
2. Backend обрабатывает план: preprocessing, binary mask, OCR, vectorization.
3. Система формирует 3D-представление и навигационные данные.
4. Пользователь просматривает модель, редактирует план и при необходимости пересобирает nav graph.
5. Для нескольких планов доступен отдельный интерфейс stitching.

---

## Технологический стек

### Backend
```text
Python 3.12
├── FastAPI — веб-фреймворк
├── SQLAlchemy 2.x — ORM
├── SQLite — development
├── PostgreSQL — production
├── OpenCV — обработка изображений
├── NumPy, scikit-image — работа с массивами
├── pytesseract — OCR
├── shapely, trimesh — 2D/3D геометрия
├── NetworkX — графы и навигация
└── JWT (python-jose) — аутентификация
```

### Frontend
```text
React 18 + TypeScript
├── Vite — сборщик
├── React Router — маршрутизация
├── Axios — HTTP-клиент
├── Three.js + @react-three/fiber — 3D-визуализация
├── Fabric.js — 2D-редактор маски/плана
├── Zustand — state management
└── Lucide React — иконки
```

---

## Архитектура

### Backend: текущая реализация

```text
┌─────────────────────────────────────────┐
│         API Layer (FastAPI)             │  ← роутеры и HTTP-контракты
├─────────────────────────────────────────┤
│       Services Layer (Business)         │  ← оркестрация и прикладная логика
├─────────────────────────────────────────┤
│    Processing Layer (OpenCV / Pure)     │  ← CV, 3D, navigation, stitching
├─────────────────────────────────────────┤
│   Repository Layer (Data Access)        │  ← работа с БД
└─────────────────────────────────────────┘
```

**Фактическое состояние кода:**
- `backend/main.py` — точка входа FastAPI.
- `backend/app/api/` — роутеры auth, upload, reconstruction, navigation, stitching.
- `backend/app/services/` — сервисы реконструкции, mask, nav, stitching, storage.
- `backend/app/db/repositories/` — слой доступа к данным.
- `backend/app/processing/` — рабочие модули обработки изображений, mesh, nav, stitching.

### Frontend: текущая реализация

```text
┌─────────────────────────────────────────┐
│         Pages (Assembly)                │  ← пользовательские сценарии
├─────────────────────────────────────────┤
│      Components (UI + editors)          │  ← UI-компоненты и экраны редактирования
├─────────────────────────────────────────┤
│       Hooks (Logic + State)             │  ← логика, состояние и API
├─────────────────────────────────────────┤
│         API Client (Axios)              │  ← HTTP-запросы к backend
└─────────────────────────────────────────┘
```

**Ключевые принципы:**
- TypeScript strict mode, `any` запрещён в идеале, но в коде ещё встречается;
- логика вынесена в `hooks/` настолько, насколько это уже сделано;
- UI-компоненты должны быть визуальными, но часть flow ещё содержит orchestration;
- Three.js-объекты должны освобождаться через `dispose()`.

---

## Пайплайн обработки изображений

```text
Фото плана эвакуации
       ↓
1. Preprocessing / color cleaning / crop suggestion
       ↓
2. OCR + text removal
       ↓
3. Contours / wall vectorization / room and door detection
       ↓
4. FloorPlan / VectorizationResult assembly
       ↓
5. 3D build (OBJ / GLB)
       ↓
6. Nav graph / A* routing
```

### Что реально есть сейчас

- бинаризация и предобработка;
- цветовая фильтрация и удаление зелёных/красных элементов;
- auto-crop suggestion;
- OCR text detection и text removal;
- contour extraction;
- room detection, classification и door detection;
- assignment room numbers;
- coordinate normalization;
- mesh build из маски;
- stitching merge / clip / transform;
- A* navigation.

---

## Структура проекта

```text
diplom_aog/
├── backend/
│   ├── main.py
│   └── app/
│       ├── api/
│       ├── core/
│       ├── db/
│       ├── models/
│       ├── processing/
│       └── services/
├── frontend/
│   └── src/
│       ├── components/
│       ├── hooks/
│       ├── pages/
│       └── types/
├── docs/
├── prompts/
└── CLAUDE.md
```

---

## Доменные сущности

### Building (Здание)
```typescript
interface Building {
  id: number;
  name: string;
  address?: string;
}
```

### Floor (Этаж)
```typescript
interface Floor {
  id: number;
  building_id: number;
  number: number;
  reconstruction_id?: number;
}
```

### Room (Помещение)
```typescript
interface Room {
  id: string;
  name: string;
  center: Point2D;
  polygon: Point2D[];
  room_type: string;
}
```

### VectorizationResult (Векторизация)
```typescript
interface VectorizationResult {
  walls: Wall[];
  rooms: Room[];
  doors: Door[];
  text_blocks: TextBlock[];
  crop_rect?: CropRect | null;
}
```

### NavigationGraph (Навигационный граф)
```typescript
interface NavigationGraph {
  nodes: Node[];
  edges: Edge[];
}
```

### Route (Маршрут)
```typescript
interface Route {
  start: Point3D;
  end: Point3D;
  path: Edge[];
  total_distance: number;
  estimated_time: number;
}
```

---

## Текущее состояние

### ✅ Реализовано и работает
- загрузка изображений планов эвакуации;
- бинаризация и preprocessing;
- удаление текста и цветных элементов;
- выделение контуров и векторизация стен;
- OCR и распознавание room numbers;
- генерация 3D-моделей OBJ/GLB;
- 3D-визуализация в браузере;
- JWT-аутентификация;
- CRUD для реконструкций;
- редактор векторной маски и плана;
- построение навигационного графа на уровне processing;
- построение маршрута между комнатами;
- интерфейс stitching.

### ⚠️ Частично реализовано
- navigation API в HTTP-слое ещё содержит заглушки;
- часть rooms endpoints и PATCH reconstruction не завершены;
- upload/stitching используют placeholder user_id;
- часть frontend flow опирается на fallback shapes и касты;
- `ViewMeshPage` и `useMeshViewer` частично дублируют загрузку данных.

### 🚧 Архитектурный долг
- `processing/` не везде является только чистым слоем;
- `reconstruction_service.py` смешивает несколько обязанностей;
- `stitching_service.py` содержит промежуточные Pydantic-модели;
- в API и frontend ещё встречаются placeholder-участки;
- часть данных хранится как JSON в `vectorization_data`;
- документация раньше описывала более идеальную архитектуру, чем есть на самом деле.

---

## Ограничения и требования

### Изображение плана
- формат: PNG/JPG;
- разрешение: не ниже 1000×1000;
- размер: не более 50 МБ;
- изображение должно быть полным и читаемым.

### Помещение
- название: 4-15 символов, латиница/кириллица/цифры/`-`/`_`;
- координаты: `(X, Y, Z)`, где `Z` — номер этажа.

### Навигационный граф
- вершины только в проходимых зонах;
- вес рёбер положительный;
- маршрут строится по A*.

### Формат ввода маршрута
- `A304` — буква корпуса + номер помещения;
- система ищет точки в БД и строит маршрут.

---

## Важные правила разработки

### Backend
1. `processing/` функции должны быть максимально чистыми.
2. Не мутировать входной `np.ndarray`.
3. После векторизации координаты должны быть нормализованы.
4. Новые processing-функции должны иметь тесты.
5. Новые API endpoints должны иметь request/response модели.
6. Предпочитать `logging` вместо `print()`.

### Frontend
1. TypeScript strict mode.
2. `any` избегать, в коде использовать `unknown` + guards.
3. Three.js объекты должны корректно освобождаться.
4. Логику держать в hooks, UI — в компонентах.

### Git
- не добавлять `Co-authored-by: Claude`;
- не коммитить секреты;
- не делать лишних разрушительных операций.

---

## Backlog фич

1. `refactor-core` — привести код к целевой архитектуре.
2. `vectorization-pipeline` — дальнейшее улучшение пайплайна.
3. `text-removal` — улучшение удаления текста.
4. `3d-builder-upgrade` — улучшение 3D-генерации.
5. `floor-editor` — редактор помещений.
6. `building-assembly` — сборка этажей и здания.
7. `pathfinding-astar` — улучшение A* и многоэтажности.
8. `vector-editor` — ручная правка маски.

---

## Для работы в Claude Chat

### Обязательные файлы
1. `prompts/project_context.md`
2. `prompts/architecture.md`
3. `CLAUDE.md`

### По типу задачи
- Backend: `prompts/python_style.md`
- Frontend: `prompts/frontend_style.md`
- Processing: `prompts/pipeline.md`, `prompts/cv_patterns.md`
- 3D: `prompts/threejs_patterns.md`
- Testing: `prompts/testing.md`

### Для понимания текущего кода
- `backend/app/api/reconstruction.py`
- `backend/app/services/reconstruction_service.py`
- `backend/app/processing/`
- `frontend/src/App.tsx`
- `frontend/src/pages/WizardPage.tsx`
- `frontend/src/pages/EditPlanPage.tsx`
- `frontend/src/pages/StitchingPage.tsx`

---

## Команды для запуска

### Backend
```bash
cd backend
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
pytest
alembic upgrade head
```

### Frontend
```bash
cd frontend
npm install
npm run dev
npm run build
npm run lint
```

---

## Итог

Diplom3D уже решает основной набор задач: загрузку планов, CV-обработку, 3D-построение, маршрут, редактирование и stitching. Но кодовая база всё ещё содержит смешанные ответственности, заглушки и технический долг, поэтому документация должна отражать именно текущее состояние, а не идеальную архитектуру.
