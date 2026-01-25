# Diplom3D - Построение виртуальных карт зданий

Система для построения 3D-моделей этажей зданий на основе планов эвакуации с функцией навигации.

## 🏗️ Структура проекта

```
diplom_aog/
├── backend/              # FastAPI сервер
│   ├── app/
│   │   ├── api/          # API эндпоинты
│   │   ├── core/         # Конфигурация, security
│   │   ├── models/       # Pydantic модели
│   │   ├── services/     # Бизнес-логика
│   │   ├── processing/   # Обработка изображений (OpenCV)
│   │   └── db/           # База данных
│   ├── requirements.txt
│   └── main.py
├── frontend/             # React приложение
│   ├── src/
│   │   ├── api/          # API клиент
│   │   ├── components/   # React компоненты
│   │   ├── pages/        # Страницы
│   │   ├── hooks/        # Custom hooks
│   │   └── styles/       # CSS
│   └── package.json
└── README.md
```

## 🚀 Быстрый старт

### Backend
```bash
cd backend
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```

## 📚 Технологии

- **Backend**: Python 3.12, FastAPI, OpenCV, SQLAlchemy
- **Frontend**: React, TypeScript, Three.js
- **БД**: PostgreSQL
