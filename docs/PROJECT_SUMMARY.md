# Diplom3D — Project Summary

## Краткое описание

**Diplom3D** — веб-приложение для автоматического построения 3D-моделей этажей зданий на основе фотографий планов эвакуации с возможностью навигации по кратчайшему маршруту.

**Основной сценарий использования:**
1. Администратор загружает фото плана эвакуации
2. Система автоматически распознаёт стены, комнаты, двери (OpenCV)
3. Строится векторная модель и 3D-визуализация (Three.js)
4. Пользователь может построить маршрут между двумя точками (A*)

---

## Технологический стек

### Backend
```
Python 3.12
├── FastAPI — веб-фреймворк
├── SQLAlchemy 2.0 (async) — ORM
├── PostgreSQL / SQLite — база данных
├── OpenCV 4.9 — обработка изображений
├── NumPy, scikit-image — работа с массивами
├── pytesseract — OCR
├── trimesh, numpy-stl — 3D-модели
├── NetworkX — графы для навигации
└── JWT (python-jose) — аутентификация
```

### Frontend
```
React 18 + TypeScript 5.3
├── Vite — сборщик
├── React Router — маршрутизация
├── Axios — HTTP-клиент
├── Three.js + @react-three/fiber — 3D-визуализация
├── Fabric.js — 2D-редактор векторной маски
├── Zustand — state management
└── Lucide React — иконки
```

---

## Архитектура

### Backend: Layered Architecture

```
┌─────────────────────────────────────────┐
│         API Layer (FastAPI)             │  ← Тонкий слой: валидация + маршрутизация
├─────────────────────────────────────────┤
│       Services Layer (Business)         │  ← Бизнес-логика, оркестрация
├─────────────────────────────────────────┤
│    Processing Layer (OpenCV/Pure)       │  ← Чистые функции обработки изображений
├─────────────────────────────────────────┤
│   Repository Layer (Data Access)        │  ← Работа с БД (SQLAlchemy)
└─────────────────────────────────────────┘
```

**Ключевые принципы:**
- `processing/` — **чистые функции**, нет DB, нет HTTP, нет side effects
- `api/` — **тонкий слой**: валидация → вызов сервиса → возврат ответа
- `services/` — **бизнес-логика**: оркестрация пайплайна, работа с репозиториями
- Все эндпоинты имеют Pydantic Request/Response модели

### Frontend: Component-Based Architecture

```
┌─────────────────────────────────────────┐
│         Pages (Assembly)                │  ← Сборка компонентов + роутинг
├─────────────────────────────────────────┤
│      Components (UI Only)               │  ← Переиспользуемые UI-компоненты
├─────────────────────────────────────────┤
│       Hooks (Logic + State)             │  ← Вся логика и работа с API
├─────────────────────────────────────────┤
│         API Client (Axios)              │  ← HTTP-запросы к backend
└─────────────────────────────────────────┘
```

**Ключевые принципы:**
- TypeScript strict mode, `any` запрещён
- Логика в `hooks/`, компоненты только UI
- Three.js объекты должны иметь `dispose()` cleanup

---

## Пайплайн обработки изображений

```
┌──────────────┐
│ Фото плана   │
│ эвакуации    │
└──────┬───────┘
       │
       ▼
┌──────────────────────────────────────────────────────┐
│ 1. Бинаризация (Метод Оцу)                           │
│    Вход: цветное изображение                         │
│    Выход: бинарное (стены=белый, фон=чёрный)        │
└──────┬───────────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────────────┐
│ 2. Распознавание текста (OCR)                        │
│    Метод: pytesseract                                │
│    Выход: изображение без текста + координаты текста│
└──────┬───────────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────────────┐
│ 3. Выделение контуров (findContours)                │
│    Метод: cv2.findContours + Douglas-Peucker         │
│    Выход: контуры стен, дверей, комнат               │
└──────┬───────────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────────────┐
│ 4. Векторизация                                      │
│    Метод: аппроксимация полилиниями                  │
│    Выход: векторная модель (JSON)                    │
└──────┬───────────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────────────┐
│ 5. Построение 3D-модели                              │
│    Метод: экструзия стен, формирование проёмов       │
│    Выход: OBJ, GLB, JSON                             │
└──────┬───────────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────────────┐
│ 6. Построение навигационного графа                   │
│    Метод: вершины в центрах комнат + дверях          │
│    Выход: граф (nodes + edges)                       │
└──────┬───────────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────────────┐
│ 7. Поиск пути (A*)                                   │
│    Вход: start + end (формат "A304")                 │
│    Выход: кратчайший путь                            │
└──────────────────────────────────────────────────────┘
```

---

## Структура проекта

```
diplom_aog/
├── backend/
│   ├── app/
│   │   ├── api/              # FastAPI роутеры
│   │   │   ├── auth.py
│   │   │   ├── reconstruction.py
│   │   │   ├── navigation.py
│   │   │   └── upload.py
│   │   ├── core/             # Конфигурация, исключения
│   │   │   ├── config.py
│   │   │   ├── database.py
│   │   │   └── exceptions.py
│   │   ├── db/
│   │   │   └── models/       # SQLAlchemy ORM
│   │   │       ├── user.py
│   │   │       ├── reconstruction.py
│   │   │       └── building.py
│   │   ├── models/           # Pydantic модели (API)
│   │   │   ├── reconstruction.py
│   │   │   ├── navigation.py
│   │   │   └── user.py
│   │   ├── processing/       # OpenCV (чистые функции)
│   │   │   ├── binarization.py
│   │   │   ├── contours.py
│   │   │   ├── vectorizer.py
│   │   │   ├── mesh_builder.py
│   │   │   └── nav_graph.py
│   │   └── services/         # Бизнес-логика
│   │       ├── reconstruction_service.py
│   │       ├── nav_service.py
│   │       └── mask_service.py
│   ├── tests/                # Тесты (pytest)
│   ├── alembic/              # Миграции БД
│   └── requirements.txt
│
├── frontend/
│   ├── src/
│   │   ├── api/              # HTTP-клиент (axios)
│   │   │   └── apiService.ts
│   │   ├── components/       # React компоненты
│   │   │   ├── Layout/
│   │   │   ├── Editor/
│   │   │   └── MeshViewer/
│   │   ├── hooks/            # Custom hooks (логика)
│   │   │   ├── useAuth.ts
│   │   │   ├── useReconstruction.ts
│   │   │   └── useNavigation.ts
│   │   ├── pages/            # Страницы
│   │   │   ├── LoginPage.tsx
│   │   │   ├── AddReconstructionPage.tsx
│   │   │   └── ViewReconstructionPage.tsx
│   │   ├── types/            # TypeScript типы
│   │   └── App.tsx
│   └── package.json
│
├── docs/                     # Документация
│   ├── ONBOARDING.md         # Главный вводный документ
│   ├── CHAT_CONTEXT_FILES.md # Список файлов для Claude Chat
│   └── PROJECT_SUMMARY.md    # Этот файл
│
├── prompts/                  # Стандарты разработки
│   ├── project_context.md    # Доменные знания из ВКР
│   ├── architecture.md       # Архитектурные принципы
│   ├── python_style.md       # Стандарты Python
│   ├── frontend_style.md     # Стандарты TypeScript/React
│   ├── pipeline.md           # Описание пайплайна обработки
│   ├── cv_patterns.md        # Паттерны OpenCV
│   ├── threejs_patterns.md   # Паттерны Three.js
│   └── testing.md            # Стандарты тестирования
│
└── CLAUDE.md                 # Инструкции для Claude Code
```

---

## Доменные сущности

### Building (Здание)
```typescript
interface Building {
  id: UUID;
  name: string;              // "Корпус А"
  floors: Floor[];
}
```

### Floor (Этаж)
```typescript
interface Floor {
  id: UUID;
  building_id: UUID;
  floor_number: number;      // 1, 2, 3...
  vector_model_id: UUID;
  navigation_graph_id: UUID;
}
```

### Room (Помещение)
```typescript
interface Room {
  id: UUID;
  name: string;              // "A304" (4-15 символов)
  location: Point2D;         // координаты центра
  polygon: Point2D[];        // контур комнаты
  room_type: RoomType;       // помещение | лестница | лифт | выход | коридор
}
```

### VectorModel (Векторная модель)
```typescript
interface VectorModel {
  id: UUID;
  floor_id: UUID;
  walls: Wall[];             // контуры стен (полилинии)
  rooms: Room[];             // помещения с полигонами
}
```

### NavigationGraph (Навигационный граф)
```typescript
interface NavigationGraph {
  id: UUID;
  floor_id: UUID;
  nodes: Node[];             // вершины (id, x, y, type)
  edges: Edge[];             // рёбра (from, to, weight)
}
```

### Route (Маршрут)
```typescript
interface Route {
  start: Point3D;            // (x, y, z) где z = номер этажа
  end: Point3D;
  path: Edge[];              // последовательность рёбер
  total_distance: number;    // длина маршрута
  estimated_time: number;    // примерное время
}
```

---

## Текущее состояние

### ✅ Реализовано и работает
- Загрузка изображений планов эвакуации
- Бинаризация (метод Оцу)
- Выделение контуров и векторизация стен
- Генерация 3D-моделей (OBJ, GLB)
- 3D-визуализация в браузере (Three.js)
- Базовая навигация с A* (прототип)
- JWT аутентификация
- CRUD для реконструкций
- Редактор векторной маски (Fabric.js)
- Расстановка маркеров комнат
- Визуализация навигационного графа
- Построение маршрута между комнатами

### ⚠️ Архитектурный долг
- `processing/` содержит service-классы вместо чистых функций
- `reconstruction_service.py` смешивает DB, бизнес-логику и file I/O
- Нет полноценного слоя `repositories/`
- `api/reconstruction.py` содержит бизнес-логику (329 строк)
- Используется `print()` вместо `logging`
- Singleton pattern вместо DI
- На фронте логика смешана с UI в page-компонентах

### 🚧 В разработке / Backlog
1. **refactor-core** — привести код в соответствие со стандартами
2. **vectorization-pipeline** — улучшение пайплайна векторизации
3. **text-removal** — автоудаление текста с планов (OCR)
4. **3d-builder-upgrade** — улучшение 3D-генерации (текстуры, освещение)
5. **floor-editor** — расстановка кабинетов, редактирование комнат
6. **building-assembly** — склейка секций в этаж, сборка этажей в здание
7. **pathfinding-astar** — улучшение A* (многоэтажность, лестницы)
8. **vector-editor** — ручная правка векторной маски

---

## Ключевые метрики

### Backend
- **Языки:** Python 3.12
- **Строк кода:** ~5000 (app/)
- **Тестов:** ~30 (pytest)
- **API эндпоинтов:** ~15
- **Зависимостей:** 25 (requirements.txt)

### Frontend
- **Языки:** TypeScript 5.3
- **Компонентов:** 31 (.tsx файлов)
- **Страниц:** 6
- **Зависимостей:** 12 (package.json)

### База данных
- **Таблицы:** 4 (users, uploaded_files, reconstructions, rooms)
- **Миграций:** 4 (Alembic)

---

## Требования и ограничения

### Изображение плана
- Формат: PNG или JPG
- Разрешение: ≥ 1000×1000 пикселей
- Размер: ≤ 50 МБ
- Качество: не размытое, не обрезанное

### Помещение
- Название: 4-15 символов (латиница/кириллица/цифры/"-"/"_")
- Координаты: (X, Y, Z), где Z ∈ [0, 12] (номер этажа)

### Навигационный граф
- Вершины только в проходимых зонах (не внутри стен)
- Вес рёбер > 0 (евклидово расстояние)

### Формат ввода маршрута
- "A304" → буква корпуса + номер помещения
- Система находит помещения в БД → строит маршрут

---

## Команды для запуска

### Backend
```bash
cd backend
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# Миграции
alembic upgrade head

# Тесты
pytest
```

### Frontend
```bash
cd frontend
npm run dev        # http://localhost:5173
npm run build
npm run lint
```

---

## Для работы в Claude Chat

**Минимальный набор файлов для контекста:**
1. `docs/ONBOARDING.md` — главный вводный документ (содержит 80% информации)
2. `prompts/project_context.md` — доменные знания из ВКР
3. `prompts/architecture.md` — архитектурные принципы

**Дополнительно по типу задачи:**
- Backend → `prompts/python_style.md`
- Frontend → `prompts/frontend_style.md`
- Обработка изображений → `prompts/pipeline.md`, `prompts/cv_patterns.md`
- 3D-рендеринг → `prompts/threejs_patterns.md`

**Полный список файлов:** см. `docs/CHAT_CONTEXT_FILES.md`

---

## Контакты

- **Проект:** Diplom3D — Floor Plan Digitizer
- **Технологии:** Python 3.12, FastAPI, OpenCV, React, TypeScript, Three.js
- **Документация:** `docs/` директория
- **Стандарты:** `prompts/` директория

---

**Версия:** 1.0
**Дата:** 2026-03-22
**Автор:** Claude Sonnet 4.6
