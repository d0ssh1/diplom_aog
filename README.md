# Diplom3D — Построение виртуальных карт зданий

Diplom3D — веб-приложение для построения 3D-моделей этажей зданий на основе планов эвакуации. На текущий момент проект уже содержит рабочие сценарии загрузки, обработки изображений, построения векторной модели, генерации 3D, навигации, редактирования планов и stitching.

## Что уже реализовано

- загрузка планов эвакуации и вспомогательных файлов;
- бинаризация, выделение контуров, OCR и векторизация;
- расчёт комнат, дверей, масштаба и нормализация координат;
- генерация 3D-моделей в форматах OBJ и GLB;
- просмотр 3D-моделей в браузере;
- JWT-аутентификация и CRUD для реконструкций;
- редактор плана и редактор векторной маски;
- построение навигационного графа и поиск маршрута;
- stitching нескольких реконструкций в одну;
- админская панель и список реконструкций.

## Что работает частично

- часть навигационного HTTP-контракта всё ещё возвращает заглушки;
- отдельные ручки rooms / patch reconstruction не завершены;
- некоторые flow используют placeholder user_id;
- часть данных редактирования хранится в JSON-полях;
- фронтенд местами использует fallback shapes и касты.

## Технологии

### Backend
- Python 3.12
- FastAPI
- SQLAlchemy
- OpenCV
- NumPy, scikit-image
- pytesseract
- shapely, trimesh
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
- Zustand

### База данных
- SQLite в разработке
- PostgreSQL в production

## Архитектура

### Backend

- `api/` — HTTP-роутеры;
- `services/` — бизнес-логика и оркестрация;
- `processing/` — обработка изображений, 3D, навигация, stitching;
- `db/` — ORM-модели и репозитории;
- `models/` — Pydantic API/domain модели;
- `core/` — конфигурация, БД, безопасность, логирование.

### Frontend

- `pages/` — пользовательские сценарии;
- `components/` — UI-компоненты;
- `hooks/` — вся логика и состояние;
- `types/` — TypeScript типы;
- `api/` — HTTP-клиент.

## Основные сценарии

1. Пользователь загружает план эвакуации.
2. Backend обрабатывает изображение и строит векторную маску.
3. Система генерирует 3D-модель и даёт её просмотреть в браузере.
4. Пользователь может редактировать план и повторно строить навигационные данные.
5. Пользователь может объединять несколько планов через stitching.
6. Пользователь строит маршрут между помещениями.

## Запуск проекта

### Backend

```bash
cd backend
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

### Дополнительно

```bash
cd backend
alembic upgrade head
pytest

cd frontend
npm run build
npm run lint
```

## Полезные ссылки

- API docs: `http://localhost:8000/api/docs`
- ReDoc: `http://localhost:8000/api/redoc`
- Healthcheck: `http://localhost:8000/health`

## Документация

- `docs/ONBOARDING.md` — актуальный вводный документ
- `docs/PROJECT_SUMMARY.md` — расширенное описание текущего состояния
- `docs/research/Полный.md` — полный research по codebase
- `prompts/` — стандарты и контекст разработки
