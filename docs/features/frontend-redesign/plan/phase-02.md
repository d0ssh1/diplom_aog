# Phase 2: UI Primitives

phase: 2
layer: components/UI/
depends_on: phase-01
design: ../01-architecture.md

## Goal

Создать три переиспользуемых UI-компонента: Button, IconButton, Slider. Все компоненты используют CSS Modules и CSS-переменные из globals.css.

## Context

Phase 1 создала:
- `types/wizard.ts`, `types/dashboard.ts`
- `styles/globals.css` с переменными `--color-orange`, `--color-black`, `--color-white` и др.
- `lucide-react` добавлен в package.json

## Files to Create

### `frontend/src/components/UI/Button.tsx`
**Purpose:** Primary (оранжевый) и Secondary (чёрный) варианты кнопки.

```typescript
interface ButtonProps {
  variant?: 'primary' | 'secondary';
  disabled?: boolean;
  onClick?: () => void;
  type?: 'button' | 'submit';
  children: React.ReactNode;
}
```
- primary: `--color-orange` фон, белый текст, hover `--color-orange-hover`
- secondary: `--color-black` фон, белый текст
- disabled: opacity 0.5, cursor not-allowed

### `frontend/src/components/UI/Button.module.css`
Стили для Button — без inline стилей.

### `frontend/src/components/UI/IconButton.tsx`
**Purpose:** Квадратная кнопка-иконка (~80×80px, оранжевый фон, белая иконка). Используется в ToolPanel.

```typescript
interface IconButtonProps {
  icon: React.ReactNode;
  active?: boolean;
  onClick?: () => void;
  title?: string;
}
```
- Размер: 80×80px
- Фон: `--color-orange` (active) или `--color-grey-medium` (inactive)
- border-radius: 12px

### `frontend/src/components/UI/IconButton.module.css`
Стили для IconButton.

### `frontend/src/components/UI/Slider.tsx`
**Purpose:** Слайдер толщины кисти. Белая полоса, чёрный ползунок.

```typescript
interface SliderProps {
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  label?: string;
}
```
- Отображает значение справа: "6 px"
- Стилизованный `<input type="range">`

### `frontend/src/components/UI/Slider.module.css`
Стили для Slider.

## Verification
- [ ] `cd frontend && npx tsc --noEmit` — 0 ошибок
- [ ] Нет `any`, нет inline-стилей
- [ ] Все props типизированы через interface
