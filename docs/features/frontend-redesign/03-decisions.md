# Design Decisions: Frontend Redesign

## Decisions

| # | Решение | Выбор | Альтернативы | Обоснование |
|---|---------|-------|--------------|-------------|
| 1 | Стейт-менеджмент wizard | React Context + useState | Zustand (установлен), Redux | Wizard — локальный flow одной страницы. Context достаточен, Zustand избыточен для одного wizard. Ticket явно указывает "React Context + useState, без Redux" |
| 2 | Стилизация | CSS Modules + глобальные CSS-переменные | Tailwind, styled-components, inline | Ticket запрещает Tailwind ("макеты слишком специфичные"). Inline запрещены в `prompts/frontend_style.md:147`. CSS Modules дают изоляцию + переменные дают тему |
| 3 | Иконки | lucide-react | SVG из макетов, react-icons | Ticket явно называет lucide-react. Уже в экосистеме React, tree-shakeable |
| 4 | Роутинг layout | Nested routes (AppLayout как Outlet) | Условный рендер NavBar (текущий подход в App.tsx:15) | Nested routes — стандарт React Router v6. Текущий подход с useLocation — хак. Ticket явно описывает nested route структуру |
| 5 | Сохранение MeshViewer | Без изменений | Переписать под новый дизайн | MeshViewer работает корректно (research). Ticket явно: "MeshViewer.tsx — не переписывать". Нет Figma-макета для шага 4 |
| 6 | Сохранение apiService.ts | Без изменений | Разбить по файлам (authApi.ts, uploadApi.ts) | Ticket явно: "apiService.ts — НЕ менять". Все методы уже реализованы и работают |
| 7 | Drag-and-drop | Нативный HTML5 DnD | react-dropzone, react-dnd | Нет внешних UI-библиотек (ticket правило 7). Нативный DnD достаточен для одной зоны загрузки |
| 8 | Шрифт | Inter (Google Fonts или системный) | Helvetica Neue (fallback уже в ticket) | Ticket явно: `font-family: 'Inter', 'Helvetica Neue', sans-serif`. Подключить через @import в globals.css |
| 9 | Замена старых страниц | Удалить HomePage, ReconstructionsListPage, AddReconstructionPage, NavBar | Оставить как deprecated | Ticket явно перечисляет что заменяется. Мёртвый код создаёт путаницу |
| 10 | Тестирование | Нет тестов для фронтенда в этой фазе | Добавить vitest + testing-library | Нет тестовой инфраструктуры (research). Добавление инфраструктуры — отдельная задача. Ticket не упоминает тесты для фронтенда |

## Risks

| Риск | Влияние | Митигация |
|------|---------|-----------|
| Сломать существующий wizard flow при рефакторинге | Высокое | Сохранить `apiService.ts` без изменений. Тестировать каждый шаг wizard вручную после реализации |
| CSS-переменные конфликтуют со старыми переменными | Среднее | Полностью заменить `styles/index.css` — не патчить поверх старых переменных |
| MaskEditor (Fabric.js) несовместим с новым ToolPanel layout | Среднее | MaskEditor получает новые props для размеров canvas. Fabric.js инициализация зависит от размера контейнера — проверить при монтировании |
| Nested routes ломают текущую логику скрытия NavBar | Низкое | Текущий NavBar удаляется. AppLayout рендерит Header/Sidebar только для своих дочерних маршрутов |
| lucide-react не установлен | Низкое | Добавить в package.json в фазе 1 |

## Open Questions

- [x] Нужны ли анимации переходов между шагами wizard? — Фаза 3 (polish), не блокирует фазы 1-2
- [x] Где хранить `building-isometric.png` и `building-blur.png`? — `frontend/src/assets/` (ticket явно указывает)
- [ ] Нужна ли страница регистрации или только вход? — Текущий LoginPage имеет toggle для регистрации, макет `Вход_админа.png` показывает только вход. Уточнить у пользователя или реализовать только вход
- [ ] MetadataForm (Здание/Этаж/Крыло/Блок) — данные сохраняются в БД или только локально в wizard state? Текущий API не имеет эндпоинта для метаданных плана
