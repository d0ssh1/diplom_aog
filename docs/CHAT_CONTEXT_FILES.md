# Файлы для загрузки в Claude Chat

Этот документ содержит список файлов, которые нужно приложить к чату с Claude для полноценного контекста проекта.

---

## Обязательные файлы (всегда прикладывать)

### 1. Основная документация
- **`docs/ONBOARDING.md`** — главный вводный документ (этот файл содержит всё самое важное)
- **`prompts/project_context.md`** — доменные знания из ВКР (сущности, требования, пайплайн, ограничения)
- **`prompts/architecture.md`** — архитектурные принципы и структура проекта
- **`CLAUDE.md`** — инструкции для Claude Code (workflow, команды, правила)

### 2. Конфигурация проекта
- **`backend/requirements.txt`** — зависимости Python
- **`frontend/package.json`** — зависимости Node.js
- **`backend/app/core/config.py`** — настройки приложения

---

## Файлы по типу задачи

### Backend разработка
- **`prompts/python_style.md`** — стандарты кода Python
- **`backend/app/api/reconstruction.py`** — основной API роутер
- **`backend/app/services/reconstruction_service.py`** — бизнес-логика
- **`backend/app/db/models/reconstruction.py`** — ORM модели
- **`backend/app/models/reconstruction.py`** — Pydantic модели

### Frontend разработка
- **`prompts/frontend_style.md`** — стандарты кода TypeScript/React
- **`frontend/src/App.tsx`** — роутинг приложения
- **`frontend/src/pages/AddReconstructionPage.tsx`** — основной флоу загрузки
- **`frontend/src/api/apiService.ts`** — HTTP-клиент
- **`frontend/src/types/reconstruction.ts`** — TypeScript типы

### Обработка изображений (OpenCV)
- **`prompts/pipeline.md`** — описание пайплайна обработки
- **`prompts/cv_patterns.md`** — паттерны работы с OpenCV/NumPy
- **`backend/app/processing/binarization/`** — модуль бинаризации
- **`backend/app/processing/contour/`** — модуль выделения контуров
- **`backend/app/processing/vectorization/`** — модуль векторизации

### 3D-рендеринг (Three.js)
- **`prompts/threejs_patterns.md`** — паттерны работы с Three.js
- **`frontend/src/components/MeshViewer/`** — компоненты 3D-визуализации
- **`backend/app/processing/mesh_builder/`** — генерация 3D-моделей

### Навигация (A*)
- **`backend/app/services/navigation_service.py`** — сервис навигации
- **`backend/app/api/navigation.py`** — API навигации
- **`frontend/src/components/MeshViewer/NavigationPath.tsx`** — визуализация маршрута

### Тестирование
- **`prompts/testing.md`** — стандарты тестирования
- **`backend/tests/`** — директория с тестами

---

## Минимальный набор для быстрого старта

Если нужно быстро начать работу и нет времени загружать все файлы:

1. **`docs/ONBOARDING.md`** — содержит 80% необходимой информации
2. **`prompts/project_context.md`** — доменные знания
3. **`prompts/architecture.md`** — архитектура

Этих трёх файлов достаточно для понимания проекта и начала работы.

---

## Как использовать в Claude Chat

### Вариант 1: Полный контекст (рекомендуется для сложных задач)
```
Привет! Я работаю над проектом Diplom3D.

Прикладываю файлы:
- docs/ONBOARDING.md
- prompts/project_context.md
- prompts/architecture.md
- prompts/python_style.md (если backend задача)
- prompts/frontend_style.md (если frontend задача)

Задача: [описание задачи]
```

### Вариант 2: Минимальный контекст (для простых вопросов)
```
Привет! Я работаю над проектом Diplom3D.

Прикладываю docs/ONBOARDING.md для контекста.

Вопрос: [вопрос]
```

### Вариант 3: Специфичный контекст (для узких задач)
```
Привет! Я работаю над проектом Diplom3D.

Прикладываю:
- docs/ONBOARDING.md
- prompts/pipeline.md
- prompts/cv_patterns.md
- backend/app/processing/binarization/binarization_service.py

Задача: улучшить алгоритм бинаризации для планов с низкой контрастностью
```

---

## Структура запроса к Claude

Рекомендуемая структура для максимальной эффективности:

```markdown
# Контекст проекта
[Приложить docs/ONBOARDING.md + релевантные файлы]

# Текущая ситуация
[Описать, что уже сделано, что работает, что не работает]

# Задача
[Чёткое описание того, что нужно сделать]

# Ограничения
[Если есть специфичные ограничения — указать]

# Ожидаемый результат
[Что должно получиться в итоге]
```

---

## Примеры запросов

### Пример 1: Новая фича (backend)
```
Контекст: Diplom3D — система для построения 3D-моделей из планов эвакуации.
Файлы: ONBOARDING.md, project_context.md, architecture.md, python_style.md

Задача: Добавить API эндпоинт для экспорта векторной модели в формате SVG.

Требования:
- Эндпоинт: GET /api/v1/floor-plans/{id}/export/svg
- Должен возвращать SVG-файл с контурами стен и комнат
- Следовать архитектурным принципам (тонкий роутер, логика в сервисе)
- Добавить Pydantic модели для запроса/ответа
```

### Пример 2: Багфикс (frontend)
```
Контекст: Diplom3D — система для построения 3D-моделей из планов эвакуации.
Файлы: ONBOARDING.md, frontend_style.md, AddReconstructionPage.tsx

Проблема: При загрузке большого изображения (>10MB) фронтенд зависает.

Текущее поведение:
- Пользователь выбирает файл
- Начинается загрузка
- UI замораживается на 5-10 секунд
- Затем появляется результат

Ожидаемое поведение:
- Показывать прогресс-бар во время загрузки
- UI должен оставаться отзывчивым
```

### Пример 3: Рефакторинг
```
Контекст: Diplom3D — система для построения 3D-моделей из планов эвакуации.
Файлы: ONBOARDING.md, architecture.md, python_style.md, reconstruction_service.py

Задача: Рефакторинг reconstruction_service.py в соответствии с архитектурными принципами.

Текущие проблемы:
- Сервис смешивает DB, бизнес-логику и file I/O
- 329 строк в одном файле
- Нет разделения на слои (repositories, services)
- Используется print() вместо logging

Цель:
- Выделить repository layer для работы с БД
- Чистый service layer с бизнес-логикой
- Использовать DI вместо singleton
- Добавить логирование
```

---

## Дополнительные ресурсы

### Если Claude спрашивает про структуру проекта:
```bash
# Backend структура
backend/app/
├── api/          # FastAPI роутеры
├── core/         # config, security, exceptions
├── db/models/    # SQLAlchemy ORM
├── models/       # Pydantic модели
├── processing/   # OpenCV функции (чистые)
└── services/     # бизнес-логика

# Frontend структура
frontend/src/
├── api/          # HTTP-клиент
├── components/   # React компоненты
├── hooks/        # custom hooks (логика)
├── pages/        # страницы
└── types/        # TypeScript типы
```

### Если Claude спрашивает про зависимости:
- Backend: FastAPI, SQLAlchemy, OpenCV, NumPy, pytesseract, trimesh, NetworkX
- Frontend: React, TypeScript, Three.js, Fabric.js, Axios, Zustand

### Если Claude спрашивает про текущее состояние:
- ✅ Работает: загрузка изображений, бинаризация, векторизация, 3D-генерация, базовая навигация, JWT auth
- ⚠️ Архитектурный долг: нет чёткого разделения слоёв, бизнес-логика в роутерах, нет repositories
- 🚧 В разработке: улучшение пайплайна, редактор векторной маски, многоэтажная навигация

---

## Обновление документации

Этот файл нужно обновлять при:
- Добавлении новых важных файлов в проект
- Изменении структуры проекта
- Появлении новых модулей или фич
- Изменении архитектурных принципов

**Последнее обновление:** 2026-03-22
