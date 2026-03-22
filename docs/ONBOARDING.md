# Diplom3D — Onboarding Guide for Claude Chat

## Краткое описание проекта

**Diplom3D** — система для автоматического построения 3D-моделей этажей зданий на основе фотографий планов эвакуации.

**Основной флоу:**
```
Фото плана эвакуации → Обработка изображения (OpenCV) → Векторизация стен/комнат
→ Построение 3D-модели → Редактирование → Навигация по A*
```

**Цель:** Администратор загружает план эвакуации, система автоматически распознаёт стены, комнаты, двери → строит интерактивную 3D-модель → пользователь может построить маршрут между двумя точками (например, "A304" → "B201").

---

## Технологический стек

### Backend
- **Python 3.12**
- **FastAPI** — веб-фреймворк
- **SQLAlchemy 2.0** (async) — ORM
- **PostgreSQL** (prod) / **SQLite** (dev) — база данных
- **OpenCV 4.9** — обработка изображений
- **NumPy, scikit-image** — работа с массивами и изображениями
- **pytesseract** — OCR для распознавания текста на планах
- **trimesh, numpy-stl** — генерация 3D-моделей (OBJ, GLB)
- **NetworkX** — построение навигационного графа
- **Shapely** — геометрические операции
- **JWT (python-jose)** — аутентификация

### Frontend
- **React 18** + **TypeScript 5.3**
- **Vite** — сборщик
- **React Router** — маршрутизация
- **Axios** — HTTP-клиент
- **Three.js** + **@react-three/fiber** + **@react-three/drei** — 3D-визуализация
- **Fabric.js** — 2D-редактор векторной маски
- **Zustand** — state management
- **Lucide React** — иконки

### Инфраструктура
- **Alembic** — миграции БД
- **Git** — версионирование
- **pytest** — тестирование (backend)
- **ESLint** — линтинг (frontend)

---

## Архитектура проекта

### Backend: `backend/app/`

```
backend/app/
├── api/                    ← FastAPI роутеры (тонкий слой)
│   ├── auth.py            ← JWT аутентификация
│   ├── reconstruction.py  ← CRUD для реконструкций
│   ├── navigation.py      ← построение маршрутов
│   └── upload.py          ← загрузка изображений
├── core/                   ← конфигурация, исключения, логирование
│   ├── config.py          ← настройки через pydantic-settings
│   ├── database.py        ← async SQLAlchemy engine
│   ├── exceptions.py      ← кастомные исключения
│   └── img_logging.py     ← логирование обработки изображений
├── db/
│   ├── models/            ← SQLAlchemy ORM модели
│   └── repositories/      ← (планируется) data access layer
├── models/                 ← Pydantic модели (API contracts)
│   ├── reconstruction.py  ← Request/Response для реконструкций
│   ├── navigation.py      ← модели для навигации
│   └── user.py            ← модели пользователей
├── processing/             ← ЧИСТЫЕ функции обработки изображений (OpenCV)
│   ├── binarization/      ← бинаризация (метод Оцу)
│   ├── contour/           ← выделение контуров стен
│   ├── vectorization/     ← векторизация (Douglas-Peucker)
│   ├── text_removal/      ← удаление текста с планов (OCR)
│   └── mesh_builder/      ← генерация 3D-моделей (OBJ, GLB)
└── services/               ← бизнес-логика, оркестрация пайплайна
    ├── reconstruction_service.py  ← управление реконструкциями
    ├── navigation_service.py      ← A* навигация
    └── floor_plan_service.py      ← (планируется) работа с планами этажей
```

**Принципы:**
- `processing/` — **ЧИСТЫЕ функции**, нет DB, нет HTTP, нет side effects
- `api/` — **тонкий слой**: валидация → вызов сервиса → возврат ответа
- `services/` — **бизнес-логика**: оркестрация, работа с БД через репозитории
- Все новые эндпоинты имеют Pydantic Request/Response модели

### Frontend: `frontend/src/`

```
frontend/src/
├── api/                    ← HTTP-клиент (axios)
│   └── apiService.ts      ← базовая конфигурация + методы API
├── components/             ← React компоненты (UI)
│   ├── Layout/            ← AppLayout, Header, Sidebar
│   ├── Editor/            ← WallEditorCanvas, ToolPanel, RoomPopup
│   ├── MeshViewer/        ← 3D-визуализация, NavigationPath, RoomLabels
│   ├── CropSelector.tsx   ← обрезка изображения
│   └── MaskEditor.tsx     ← редактор векторной маски (Fabric.js)
├── hooks/                  ← custom hooks (логика + state)
│   ├── useAuth.ts         ← аутентификация
│   ├── useReconstruction.ts  ← работа с реконструкциями
│   └── useNavigation.ts   ← навигация
├── pages/                  ← страницы (сборка компонентов)
│   ├── LoginPage.tsx
│   ├── AddReconstructionPage.tsx
│   ├── ReconstructionListPage.tsx
│   ├── EditReconstructionPage.tsx
│   └── ViewReconstructionPage.tsx
├── types/                  ← TypeScript интерфейсы
│   ├── reconstruction.ts
│   ├── navigation.ts
│   └── user.ts
└── App.tsx                 ← роутинг (React Router)
```

**Принципы:**
- TypeScript strict mode, `any` **запрещён** (использовать `unknown` + type guard)
- Логика в `hooks/`, компоненты только UI
- Three.js объекты должны иметь `dispose()` cleanup при unmount

---

## Доменные сущности

### Building (Здание)
- `id`: UUID
- `name`: название ("Корпус А")
- `floors`: список этажей

### Floor (Этаж)
- `id`: UUID
- `building_id`: ссылка на здание
- `floor_number`: номер этажа (уникален в пределах здания)
- `vector_model_id`: ссылка на векторную модель
- `navigation_graph_id`: ссылка на навигационный граф

### Room (Помещение)
- `location`: координаты центра (x, y)
- `name`: строка 4-15 символов (латиница, кириллица, цифры, "-", "_")
- `room_type`: {помещение, лестница, лифт, эвакуационный_выход, коридор}

### VectorModel / FloorPlan (Векторная модель)
- `id`: UUID
- `floor_id`: ссылка на этаж
- `walls`: набор контуров стен (замкнутые полилинии)
- `rooms`: набор помещений с полигонами

### NavigationGraph (Навигационный граф)
- `id`: UUID
- `floor_id`: ссылка на этаж
- `nodes`: вершины (id, координаты x/y, тип)
- `edges`: рёбра (from_id, to_id, weight=евклидово расстояние)

### Route (Маршрут)
- `start`: (x, y, z) где z = номер этажа
- `end`: (x, y, z)
- `path`: упорядоченная последовательность рёбер графа
- `total_distance`: длина маршрута
- `estimated_time`: примерное время прохождения

---

## Пайплайн обработки изображений

### 1. Бинаризация (CM_001.1)
- **Вход:** цветное изображение плана
- **Метод:** Оцу (автоматический порог)
- **Выход:** бинарное чёрно-белое изображение (стены=255, фон=0)
- **Код:** `backend/app/processing/binarization/`

### 2. Распознавание текста (CM_001.2)
- **Вход:** бинарное изображение
- **Метод:** pytesseract OCR
- **Выход:** изображение без текста + данные текстовых блоков
- **Код:** `backend/app/processing/text_removal/`

### 3. Выделение структурных объектов (CM_001.3)
- **Вход:** бинарное изображение без текста
- **Метод:** `cv2.findContours` + Douglas-Peucker аппроксимация
- **Классификация:** стены (крупные внешние контуры), двери (разрывы в стенах)
- **Выход:** распознанные объекты с 2D-координатами
- **Код:** `backend/app/processing/contour/`, `backend/app/processing/vectorization/`

### 4. Построение 3D-модели (CM_001.4)
- **Вход:** 2D-контуры объектов
- **Метод:** экструзия стен на высоту этажа, формирование проёмов
- **Выход:** 3D-модель (OBJ, GLB, JSON)
- **Код:** `backend/app/processing/mesh_builder/`

### 5. Построение навигационного графа (RM_001)
- **Вход:** векторная модель (стены, комнаты, двери)
- **Метод:** создание вершин в центрах комнат, дверных проёмах, вдоль коридоров
- **Выход:** граф (nodes + edges) для A*
- **Код:** `backend/app/services/navigation_service.py`

### 6. Поиск пути — A* (RM_002)
- **Вход:** граф + start + end
- **Метод:** A* с манхэттенской эвристикой
- **Выход:** кратчайший путь (последовательность рёбер)
- **Код:** `backend/app/services/navigation_service.py`

---

## Текущее состояние кодовой базы

### ✅ Что работает:
- Загрузка изображений + бинаризация
- Выделение контуров и векторизация стен
- Генерация 3D-моделей (OBJ, GLB)
- Базовая навигация с A* (прототип)
- JWT аутентификация
- CRUD для реконструкций
- 3D-визуализация (Three.js)
- Редактор векторной маски (Fabric.js)

### ⚠️ Архитектурный долг (НЕ соответствует стандартам):
- `processing/` содержит service-классы (BinarizationService), а не чистые функции
- `reconstruction_service.py` смешивает DB, бизнес-логику и file I/O
- Нет полноценного слоя `repositories/` — прямое использование SQLAlchemy session
- `api/reconstruction.py` содержит бизнес-логику (329 строк)
- Используется `print()` вместо `logging`
- Singleton pattern вместо DI
- На фронте нет чёткого разделения `hooks/` и `components/` — логика в page-компонентах
- `AddReconstructionPage.tsx` — 400 строк, смешивает логику и рендеринг

---

## Ограничения и требования

### Изображение плана
- Формат: PNG или JPG
- Разрешение: ≥ 1000×1000 пикселей
- Размер: ≤ 50 МБ
- Должно быть полным, не обрезанным, не размытым

### Помещение
- Название: 4-15 символов, латиница/кириллица/цифры/"-"/"_"
- Координата: (X, Y, Z), где X,Y ∈ ℝ, Z ∈ ℤ ∩ [0, 12]

### Навигационный граф
- Вершины только в проходимых зонах (коридоры, помещения), НЕ внутри стен
- Вес рёбер > 0

### Формат ввода маршрута
- "A304" → буква корпуса + номер помещения
- Система находит помещения в БД → загружает графы → ближайшие вершины → A*

---

## Важные правила разработки

### Backend
1. `processing/` функции — **ЧИСТЫЕ**: нет DB, нет HTTP, нет side effects, нет state
2. Никогда не мутировать входной `np.ndarray` — всегда `.copy()` сначала
3. Все координаты после векторизации нормализованы к [0, 1]
4. Каждая новая функция в `processing/` должна иметь тесты в `backend/tests/`
5. Все новые API эндпоинты имеют Pydantic Request/Response модели
6. Использовать `logging` вместо `print()`

### Frontend
1. TypeScript strict mode, `any` **запрещён** — использовать `unknown` + type guard
2. Three.js объекты должны иметь `dispose()` cleanup при unmount
3. Логика в `hooks/`, компоненты только UI
4. Все типы явно типизированы

### Git
- Никогда не добавлять `Co-authored-by: Claude` в коммиты
- Коммиты на русском языке (проект на русском)

---

## Backlog фич (в порядке приоритета)

1. **refactor-core** — привести код в соответствие со стандартами (services, repositories, pure functions)
2. **vectorization-pipeline** — подключить ContourService + BinarizationService к пайплайну
3. **text-removal** — автоудаление текста с планов (OCR)
4. **3d-builder-upgrade** — улучшение 3D-генерации (текстуры, освещение)
5. **floor-editor** — расстановка кабинетов, редактирование комнат
6. **building-assembly** — склейка секций в этаж, сборка этажей в здание
7. **pathfinding-astar** — улучшение A* навигации (многоэтажность, лестницы)
8. **vector-editor** — ручная правка векторной маски на фронте

---

## Файлы, которые нужно приложить для контекста

### Обязательные (всегда читать перед задачей):
1. **`prompts/project_context.md`** — доменные знания из ВКР (сущности, требования, пайплайн)
2. **`prompts/architecture.md`** — архитектурные принципы
3. **`CLAUDE.md`** — инструкции для Claude Code (workflow, команды, правила)

### По типу задачи:
- **Backend задачи:** `prompts/python_style.md`
- **Frontend задачи:** `prompts/frontend_style.md`
- **Обработка изображений:** `prompts/pipeline.md`, `prompts/cv_patterns.md`
- **3D-рендеринг:** `prompts/threejs_patterns.md`
- **Тестирование:** `prompts/testing.md`

### Для понимания текущего кода:
- `backend/app/core/config.py` — настройки приложения
- `backend/app/api/reconstruction.py` — основной API
- `backend/app/services/reconstruction_service.py` — бизнес-логика
- `backend/app/processing/` — модули обработки изображений
- `frontend/src/App.tsx` — роутинг
- `frontend/src/pages/AddReconstructionPage.tsx` — основной флоу загрузки плана

---

## Как начать работу

### Для исследования кодовой базы:
```
Прочитай prompts/project_context.md и prompts/architecture.md,
затем изучи структуру backend/app/ и frontend/src/
```

### Для новой фичи:
```
1. Прочитай prompts/project_context.md
2. Прочитай prompts/architecture.md
3. Прочитай соответствующий style guide (python_style.md или frontend_style.md)
4. Изучи существующий код в релевантной области
5. Предложи план реализации
```

### Для багфикса:
```
1. Опиши проблему
2. Укажи, где проявляется (backend/frontend/оба)
3. Приложи логи/скриншоты если есть
```

---

## Полезные команды

### Backend
```bash
# Запуск dev-сервера
cd backend
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# Миграции
alembic upgrade head
alembic revision --autogenerate -m "description"

# Тесты
pytest
pytest -v tests/processing/  # только обработка изображений
```

### Frontend
```bash
# Запуск dev-сервера
cd frontend
npm run dev

# Сборка
npm run build

# Линтинг
npm run lint
```

---

## Контакты и ресурсы

- **Репозиторий:** (укажи URL если есть)
- **Документация:** `docs/` директория
- **Стандарты:** `prompts/` директория
- **Память Claude Code:** `.claude/projects/.../memory/MEMORY.md`

---

## Быстрый старт для Claude Chat

**Минимальный контекст для начала работы:**

1. Прочитай этот файл (`docs/ONBOARDING.md`)
2. Прочитай `prompts/project_context.md` (доменные знания)
3. Прочитай `prompts/architecture.md` (архитектурные принципы)
4. Спроси: "Какую задачу нужно решить?"

**Если задача связана с кодом:**
- Backend → прочитай `prompts/python_style.md`
- Frontend → прочитай `prompts/frontend_style.md`
- Обработка изображений → прочитай `prompts/pipeline.md` + `prompts/cv_patterns.md`

**Если нужно понять текущий код:**
- Используй `Glob` для поиска файлов по паттерну
- Используй `Grep` для поиска по содержимому
- Используй `Read` для чтения конкретных файлов

---

**Версия документа:** 1.0
**Дата:** 2026-03-22
**Автор:** Claude Sonnet 4.6
