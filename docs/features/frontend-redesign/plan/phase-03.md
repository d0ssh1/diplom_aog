# Phase 3: Layout Components

phase: 3
layer: components/Layout/
depends_on: phase-02
design: ../01-architecture.md

## Goal

Создать AppLayout (Header + Sidebar + Outlet) — основной layout для всех страниц кроме Login и Wizard.

## Context

Phase 1-2 создали:
- `styles/globals.css` с переменными `--color-header-bg: #000000`, `--color-sidebar-bg: #FFFFFF`
- `components/UI/Button.tsx` — используется в Sidebar для кнопок меню

## Files to Create

### `frontend/src/components/Layout/Header.tsx`
**Purpose:** Чёрная шапка на всю ширину.

```typescript
interface HeaderProps {
  username?: string;
}
```
- Фон: `--color-header-bg` (#000000)
- Слева: название проекта (белый текст, bold)
- Справа: username (белый текст)
- Высота: ~56px

### `frontend/src/components/Layout/Header.module.css`
Стили Header.

### `frontend/src/components/Layout/Sidebar.tsx`
**Purpose:** Левый сайдбар с "// Меню" и пунктами навигации.

```typescript
// Нет props — навигация через useNavigate
```
- Фон: `--color-sidebar-bg` (#FFFFFF)
- Ширина: ~25% или 280px
- Заголовок "// Меню" — italic, bold, 28px
- Пункты меню с префиксом "> ":
  - "> Загрузить изображение" → navigate('/upload')
  - "> Редактировать план помещения" → navigate('/upload')
  - "> Редактировать узловые точки" → (заглушка)
  - "> Удалить план помещения" → (заглушка)

### `frontend/src/components/Layout/Sidebar.module.css`
Стили Sidebar.

### `frontend/src/components/Layout/AppLayout.tsx`
**Purpose:** Обёртка: Header сверху, Sidebar слева, Outlet справа.

```typescript
// Нет props — использует React Router Outlet
import { Outlet } from 'react-router-dom';
```
- Flex layout: header (full width) + row(sidebar + main)
- main занимает оставшееся пространство

### `frontend/src/components/Layout/AppLayout.module.css`
Стили AppLayout.

## Verification
- [ ] `cd frontend && npx tsc --noEmit` — 0 ошибок
- [ ] Нет `any`, нет inline-стилей
- [ ] AppLayout использует `<Outlet />` из react-router-dom
