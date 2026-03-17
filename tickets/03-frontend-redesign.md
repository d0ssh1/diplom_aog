# Тикет: Frontend Redesign — Вёрстка по макетам Figma

## Обзор

Полная переделка фронтенда по макетам из Figma. Backend API остаётся без изменений.
Все скриншоты макетов сохранены в `docs/design/` (10 файлов).

---

## Дизайн-система

### Цвета
```css
:root {
  --color-black: #000000;
  --color-white: #FFFFFF;
  --color-orange: #FF5722;       /* основной акцент — кнопки, иконки, индикаторы */
  --color-grey-bg: #E0E0E0;      /* фон контентной области */
  --color-grey-dark: #4A4A4A;    /* правая панель инструментов */
  --color-grey-medium: #9E9E9E;  /* неактивные элементы */
  --color-grey-light: #F5F5F5;   /* фон карточек */
  --color-sidebar-bg: #FFFFFF;   /* фон левого сайдбара */
  --color-header-bg: #000000;    /* шапка */
  --color-text-primary: #000000;
  --color-text-white: #FFFFFF;
  --color-text-muted: #9E9E9E;
}
```

### Типографика
```css
/* Основной шрифт — жирный, современный, без засечек */
font-family: 'Inter', 'Helvetica Neue', sans-serif;

/* Заголовки секций в сайдбаре: жирный, с префиксом "//" */
.section-title {
  font-weight: 800;
  font-size: 28px;
  font-style: italic;
}
/* Пример: "// Меню", "// Кадрирование", "// Редактировать" */

/* Пункты меню: с префиксом "> " */
.menu-item {
  font-weight: 500;
  font-size: 16px;
}
/* Пример: "> Загрузить изображение" */

/* Кнопки */
.button-primary {
  font-weight: 600;
  font-size: 16px;
  text-transform: none;
}
```

### Компоненты

#### Кнопка Primary (оранжевая)
- Фон: `var(--color-orange)` (#FF5722)
- Текст: белый
- Без скруглений (sharp corners) или минимальное 4px
- Hover: чуть темнее (#E64A19)
- Используется для: "Начать", "Выбрать файлы", "Далее", "Построить"

#### Кнопка Secondary (серая/чёрная)
- Фон: чёрный или прозрачный
- Текст: белый
- Используется для: "Назад"

#### Иконка удаления (×)
- Маленький оранжевый квадрат с белым × в правом верхнем углу карточки
- Размер: ~24×24px

#### Step Indicator (индикатор шагов)
- 5 кружков в ряд горизонтально, по центру сверху
- Активный шаг: оранжевый (#FF5722), заполненный
- Пройденный: белый/светлый, заполненный
- Будущий: серый (#9E9E9E), незаполненный
- Размер кружка: ~20px

---

## Экраны (маршруты)

### Экран 0: Вход в систему (Login)
**Маршрут:** `/login`
**Макет:** `Вход_админа.png`

**Layout:** Два блока на всю высоту экрана, без шапки.

- **Левая половина** (~50%, фон: оранжевый #FF5722):
  - Декоративная изометрическая иллюстрация здания (3 этажа в разрезе)
  - Чёрные контуры на оранжевом фоне
  - Пунктирные вертикальные линии между этажами
  - Иллюстрация — статичная картинка (SVG или PNG), по центру
- **Правая половина** (~50%, фон: белый #FFFFFF):
  - Контент вертикально по центру, горизонтально по центру:
    - Заголовок "Вход в систему" (чёрный, bold, ~36px)
    - Поле "Логин" — инпут с пунктирной рамкой (dashed border, серый)
    - Поле "Пароль" — инпут с пунктирной рамкой (dashed border, серый)
    - Кнопка "Войти" (чёрный фон, белый текст, ~200px шириной)

**Стиль инпутов:**
```css
.login-input {
  border: 2px dashed #BDBDBD;
  background: transparent;
  padding: 12px 16px;
  font-size: 16px;
  width: 300px;
  outline: none;
}
.login-input:focus {
  border-color: #FF5722;
}
```

**Действия:**
- POST `/api/v1/auth/login` с {username, password}
- При успехе → redirect на `/dashboard`
- При ошибке → красная рамка на инпутах + сообщение

---

### Экран 1: Главное меню — пусто
**Маршрут:** `/` или `/dashboard`
**Макет:** `Главное_меню_-_пусто_24.png`

**Layout:**
- Шапка (header): чёрная полоса на всю ширину
  - Слева: название проекта ("PROJECT_DIPLOM" или другое), белый текст, bold
  - Справа: "Ник_админа", белый текст
- Основная область: два блока
  - **Левый сайдбар** (~25% ширины, белый фон):
    - Заголовок "// Меню" (italic, bold, 28px)
    - Пункты меню (каждый — кликабельный):
      - "> Загрузить изображение"
      - "> Редактировать план помещения"
      - "> Редактировать узловые точки"
      - "> Удалить план помещения"
  - **Правая область** (~75%, фон — оранжевое размытое фоновое изображение зданий):
    - По центру: большая иконка × в круге (svg, белый)
    - Текст "Нет загруженных планов" (белый, bold, ~24px)
    - Кнопка "Начать" (чёрный фон, белый текст, широкая)

**Действия:**
- Клик "Начать" или "Загрузить изображение" → открывает wizard загрузки (Экран 3)

---

### Экран 2: Главное меню — с файлом
**Маршрут:** `/` или `/dashboard` (когда есть загруженные планы)
**Макет:** `Главное_меню_-_файл.png`

**Layout:**
- Шапка — та же
- Левый сайдбар — тот же
- **Правая область** (светло-серый фон #E0E0E0):
  - Сетка карточек загруженных планов (grid, 3 в ряд)
  - Каждая карточка:
    - Превью изображения (серый прямоугольник, ~150×100px)
    - Оранжевая кнопка × в правом верхнем углу
    - Имя файла под превью ("planD3.jpg")
  - Клик на карточку → переход к просмотру/редактированию

---

### Экран 3: Wizard загрузки — Шаг 1: Загрузка файлов
**Маршрут:** модальное окно или `/upload` (wizard на весь экран)
**Макеты:** `Загрузка_-_пусто.png`, `Загрузка_-_несколько_файлов.png`, `Загрузка_-_один_файл.png`, `Загрузка_-_один_файл-1.png`

**Layout:**
- Чёрная шапка с step indicator (5 кружков по центру) и кнопкой × справа (закрыть)
- Основная область — два блока:
  - **Левая панель** (~45%, белый/светлый фон):
    - Drag-and-drop зона:
      - Пунктирная рамка оранжевого цвета (dashed border, color: #FF5722)
      - По центру: иконка облака с стрелкой вверх (оранжевая)
      - Текст "Перетащите для загрузки"
      - Кнопка "Выбрать файлы" (оранжевая)
  - **Правая панель** (~55%):
    - **Если файлов нет:** светло-серый фон, иконка × в круге, "Нет загруженных планов"
    - **Если один файл:** тёмно-серый фон с превью изображения, заголовок с именем файла ("planD3.jpg") и оранжевый × справа. Внизу — форма метаданных:
      - Поля: Здание (> ____), Этаж (> ____), Крыло (> ____), Блок (> ____)
      - Каждое поле — строка с лейблом и текстовым инпутом
    - **Если несколько файлов:** сетка превью 3×N с именами и оранжевыми × для удаления
- **Футер:**
  - Кнопка "Назад" (слева, серая/чёрная)
  - Кнопка "> Далее" (справа, оранжевая)

**Действия:**
- Drag-drop или клик "Выбрать файлы" → загрузка на бэкенд
- × на файле → удаление
- "Далее" → Шаг 2 (Редактирование маски)

---

### Экран 4: Wizard — Шаг 2: Редактирование маски
**Маршрут:** шаг 2 wizard
**Макеты:** `Редактирование_-_один_файл.png`, `Редактирование_-_один_файл-1.png`

**Layout:**
- Чёрная шапка + step indicator (шаг 2 активен — оранжевый)
- Основная область:
  - **Canvas слева** (~75%): большое превью изображения плана (чёрный фон)
  - **Правая панель инструментов** (~25%, тёмно-серый фон #4A4A4A):
    - Секция "// Кадрирование" (белый текст, italic bold):
      - Две иконки-кнопки в ряд (оранжевый фон, белая иконка):
        - Кадрирование (crop icon)
        - Автоулучшение (sparkle/magic icon)
    - Секция "// Редактировать":
      - Две иконки-кнопки:
        - Кисть (paint/draw tool)
        - Ластик/перекрёстные линии (erase tool)
    - Секция "// Толщина":
      - Слайдер (белая полоса с чёрным ползунком)
      - Значение "6 px" справа
- **Футер:** "Назад" + "Далее"

**Размер иконок-кнопок:** ~80×80px, оранжевый фон с закруглёнными углами (~12px), белая иконка внутри.

**Действия:**
- Инструменты кадрирования применяются к изображению на canvas
- Кисть/ластик позволяют дорисовать/стереть маску
- Слайдер меняет толщину кисти
- "Далее" → Шаг 3

---

### Экран 5: Wizard — Шаг 3: Построение (Линии Хаффа / 3D)
**Маршрут:** шаг 3 wizard
**Макет:** `Линии_Хаффа.png`

**Layout:**
- Чёрная шапка + step indicator (шаг 3 активен)
- Основная область: фоновое изображение (ч/б фото зданий — декоративное)
- По центру: большая кнопка "Построить" (оранжевая, ~200×60px)
- **Футер:** "> Назад" + "> Далее"

**Действия:**
- Клик "Построить" → POST запрос к API для построения 3D модели
- Показать спиннер/прогресс
- По завершении → автоматически к шагу 4 или разблокировать "Далее"

---

### Экран 6: Wizard — Шаг 4: Просмотр 3D модели
**Маршрут:** шаг 4 wizard (или отдельная страница `/mesh/:id`)
**Макет:** отсутствует в Figma, но логически следует

**Layout:**
- MeshViewer (уже реализован) занимает основную область
- Правая панель или оверлей с метками комнат (если есть)
- **Футер:** "Назад" + "Далее" (Далее = сохранить)

---

### Экран 7: Wizard — Шаг 5: Сохранение
**Маршрут:** шаг 5 wizard
**Макет:** отсутствует

**Layout:**
- Форма с названием реконструкции
- Кнопка "Сохранить"

---

## Архитектура фронтенда

### Структура файлов
```
frontend/src/
├── components/
│   ├── Layout/
│   │   ├── Header.tsx              — чёрная шапка
│   │   ├── Sidebar.tsx             — левый сайдбар с "// Меню"
│   │   └── AppLayout.tsx           — Header + Sidebar + children
│   ├── Wizard/
│   │   ├── WizardShell.tsx         — обёртка wizard (header + steps + footer)
│   │   ├── StepIndicator.tsx       — 5 кружков
│   │   ├── StepUpload.tsx          — шаг 1: загрузка файлов
│   │   ├── StepEditMask.tsx        — шаг 2: редактирование маски
│   │   ├── StepBuild.tsx           — шаг 3: построение
│   │   ├── StepView3D.tsx          — шаг 4: просмотр 3D
│   │   └── StepSave.tsx            — шаг 5: сохранение
│   ├── Upload/
│   │   ├── DropZone.tsx            — drag-and-drop зона
│   │   ├── FileGrid.tsx            — сетка превью файлов
│   │   ├── FileCard.tsx            — карточка файла с × и именем
│   │   └── MetadataForm.tsx        — форма Здание/Этаж/Крыло/Блок
│   ├── Editor/
│   │   ├── MaskEditor.tsx          — canvas для редактирования маски
│   │   └── ToolPanel.tsx           — правая панель с инструментами
│   ├── MeshViewer/
│   │   └── MeshViewer.tsx          — Three.js 3D вьюер (уже есть)
│   └── UI/
│       ├── Button.tsx              — Primary/Secondary кнопки
│       ├── IconButton.tsx          — квадратные оранжевые кнопки-иконки
│       └── Slider.tsx              — слайдер толщины
├── pages/
│   ├── LoginPage.tsx               — экран входа
│   ├── DashboardPage.tsx           — главное меню
│   ├── WizardPage.tsx              — wizard (все 5 шагов)
│   └── ViewMeshPage.tsx            — просмотр 3D (уже есть)
├── hooks/
│   ├── useWizard.ts                — состояние wizard (шаг, данные, навигация)
│   └── useFileUpload.ts            — загрузка файлов (drag-drop, API)
├── api/
│   └── apiService.ts               — уже есть
├── styles/
│   └── globals.css                 — CSS-переменные, reset, общие стили
├── App.tsx                          — роутинг
└── main.tsx                         — точка входа
```

### Роутинг

Текущий `App.tsx` уже имеет роуты. Обновить до:

```tsx
import { Routes, Route, useLocation, Navigate } from 'react-router-dom';

function App() {
  return (
    <Routes>
      {/* Login — без layout */}
      <Route path="/login" element={<LoginPage />} />

      {/* Все остальные — с AppLayout (header + sidebar) */}
      <Route path="/" element={<AppLayout />}>
        <Route index element={<DashboardPage />} />
        <Route path="mesh/:id" element={<ViewMeshPage />} />
      </Route>

      {/* Wizard — отдельный layout (header + step indicator) */}
      <Route path="/upload" element={<WizardPage />} />

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  );
}
```

**Существующие страницы** (будут заменены):
- `HomePage.tsx` → заменяется на `DashboardPage.tsx`
- `AddReconstructionPage.tsx` → заменяется на `WizardPage.tsx`
- `ReconstructionsListPage.tsx` → функционал переносится в `DashboardPage.tsx`
- `LoginPage.tsx` → переписывается по макету
- `ViewMeshPage.tsx` → сохраняется, используется как есть
- `NavBar.tsx` → заменяется на `Header.tsx` + `Sidebar.tsx` в `AppLayout`

**Существующий `apiService.ts` — НЕ менять.** Все API-методы уже реализованы.

---

## API маппинги (из существующего apiService.ts)

Файл `frontend/src/api/apiService.ts` уже содержит все нужные методы. НЕ менять его, использовать как есть.

### Экран 0 — Login
```tsx
import { authApi } from '../api/apiService';

// При клике "Войти":
const { access_token } = await authApi.login(username, password);
localStorage.setItem('auth_token', access_token);
navigate('/');
```

### Экран 1/2 — Dashboard
```tsx
import { reconstructionApi } from '../api/apiService';

// Загрузка списка сохранённых реконструкций:
const list = await reconstructionApi.getReconstructions();
// list = [{ id, name, status, url, ... }]

// Удаление карточки:
await reconstructionApi.deleteReconstruction(id);
```

### Wizard Шаг 1 — Загрузка файлов
```tsx
import { uploadApi } from '../api/apiService';

// При drop/выборе файла:
const { file_id, url } = await uploadApi.uploadPlanPhoto(file);
// Сохранить file_id в state wizard для следующих шагов
```

### Wizard Шаг 2 — Маска (автогенерация + редактирование)
```tsx
import { reconstructionApi } from '../api/apiService';

// При входе в шаг 2 — автоматически запросить маску:
const { file_id: maskFileId } = await reconstructionApi.calculateMask(
  planFileId,
  cropRect,    // { x, y, width, height } или null
  rotation,    // 0/90/180/270
);
// maskFileId сохранить в state для шага 3

// Маска доступна по URL: /api/v1/uploads/masks/{maskFileId}.png
// Отобразить маску на canvas для ручного редактирования (кисть/ластик)

// При ручном редактировании маски — загрузить отредактированную маску:
// const { file_id: editedMaskId } = await uploadApi.uploadUserMask(editedMaskBlob);
```

### Wizard Шаг 3 — Построение 3D модели
```tsx
import { reconstructionApi } from '../api/apiService';

// При клике "Построить":
const result = await reconstructionApi.calculateMesh(planFileId, maskFileId);
// result = { id, status, url, ... }
// id = reconstruction ID для шага 4
```

### Wizard Шаг 4 — Просмотр 3D
```tsx
import { reconstructionApi } from '../api/apiService';

// Получить данные реконструкции:
const data = await reconstructionApi.getReconstructionById(reconstructionId);
// data.url = URL к GLB файлу → передать в <MeshViewer url={data.url} />
// data.status: 2=в процессе, 3=готово, 4=ошибка
```

### Wizard Шаг 5 — Сохранение
```tsx
import { reconstructionApi } from '../api/apiService';

// При клике "Сохранить":
await reconstructionApi.saveReconstruction(reconstructionId, name);
navigate('/');  // вернуться на dashboard
```

### Полный state wizard
```tsx
interface WizardState {
  step: number;                    // 1-5
  planFileId: string | null;       // из uploadApi.uploadPlanPhoto()
  planUrl: string | null;          // URL превью
  maskFileId: string | null;       // из reconstructionApi.calculateMask()
  reconstructionId: number | null; // из reconstructionApi.calculateMesh()
  meshUrl: string | null;          // из getReconstructionById().url
  cropRect: CropRect | null;
  rotation: number;                // 0/90/180/270
}
```

---

## Правила реализации

1. **React + TypeScript** — strict mode, no `any`
2. **CSS Modules** или обычный CSS с BEM — НЕ Tailwind (макеты слишком специфичные)
3. **Все тексты на русском** — как в макетах
4. **Адаптивность:** desktop-first, минимум 1280px ширина
5. **MeshViewer.tsx** — не переписывать, использовать как есть
6. **Иконки:** использовать lucide-react или SVG из макетов
7. **Без внешних UI-библиотек** (MUI, Ant, Chakra) — кастомные компоненты по макету
8. **State management:** React Context + useState, без Redux

---

## Приоритет реализации

### Фаза 1 (критично):
1. LoginPage (вход в систему)
2. DashboardPage (главное меню — пустое + с файлами)
3. WizardShell + StepIndicator
4. StepUpload (загрузка с drag-drop)
5. Роутинг

### Фаза 2 (важно):
6. StepEditMask (canvas + инструменты)
7. StepBuild (кнопка "Построить")
8. StepView3D (MeshViewer интеграция)
9. StepSave

### Фаза 3 (polish):
10. Анимации переходов между шагами
11. Мобильная адаптация
12. Обработка ошибок с красивыми сообщениями

---

## Графические ассеты

Сохранены в `frontend/src/assets/`:

| Файл | Где используется | Описание |
|------|-----------------|----------|
| `building-isometric.png` | Экран Login (левая половина) | Ч/б изометрическое здание в разрезе (3 этажа). Отображается на оранжевом фоне (#FF5722) |
| `building-blur.png` | Dashboard (пустой, правая область) | Размытое фото здания на оранжевом фоне. Используется как background-image с затемнением |

**Как использовать:**
```css
/* Login — левая половина */
.login-illustration {
  background-color: #FF5722;
  display: flex;
  align-items: center;
  justify-content: center;
}
.login-illustration img {
  max-width: 80%;
  height: auto;
}

/* Dashboard — пустое состояние */
.dashboard-empty {
  background-image: url('../assets/building-blur.png');
  background-size: cover;
  background-position: center;
}
```

---

## Скриншоты макетов

Все скриншоты в `docs/design/`:
- `00_login.png` — Вход в систему
- `01_dashboard_empty.png` — Главное меню (пусто)
- `02_dashboard_file.png` — Главное меню (с файлом)
- `03_upload_empty.png` — Wizard шаг 1 (пусто)
- `04_upload_multiple.png` — Wizard шаг 1 (несколько файлов)
- `05_upload_single.png` — Wizard шаг 1 (один файл + метаданные)
- `06_upload_single_v2.png` — Wizard шаг 1 (вариант)
- `07_edit_mask.png` — Wizard шаг 2 (редактирование)
- `08_edit_mask_v2.png` — Wizard шаг 2 (вариант)
- `09_hough_build.png` — Wizard шаг 3 (построение)
- `10_vector_line.png` — Линия Хаффа (визуализация)