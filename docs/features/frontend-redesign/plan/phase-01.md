# Phase 1: Types + Design System

phase: 1
layer: types/, styles/
depends_on: none
design: ../README.md

## Goal

Создать фундамент: новые TypeScript-типы для wizard и dashboard, расширить существующие типы, заменить CSS-переменные на дизайн-систему из тикета.

## Files to Create

### `frontend/src/types/wizard.ts`
**Purpose:** Типы для состояния wizard и загруженных файлов.

```typescript
// CropRect не экспортируется из apiService.ts (строка 98, internal interface) — дублируем здесь
export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type WizardStep = 1 | 2 | 3 | 4 | 5;

export interface UploadedFile {
  id: string;
  url: string;
  name: string;
}

export interface WizardState {
  step: WizardStep;
  planFileId: string | null;
  planUrl: string | null;
  maskFileId: string | null;
  reconstructionId: number | null;
  meshUrl: string | null;
  cropRect: CropRect | null;
  rotation: 0 | 90 | 180 | 270;
  isLoading: boolean;
  error: string | null;
}
```

### `frontend/src/types/dashboard.ts`
**Purpose:** Тип карточки реконструкции для DashboardPage.

```typescript
export interface ReconstructionCard {
  id: number;
  name: string;
  url: string | null;
  status: number;
}
```

## Files to Modify

### `frontend/src/types/reconstruction.ts`
**What changes:** Добавить `CropRect` если не экспортируется из apiService, убедиться что `ReconstructionDetail` покрывает все поля ответа API.

### `frontend/src/styles/index.css` → переименовать в `globals.css`
**What changes:** Полностью заменить содержимое. Новые CSS-переменные из тикета:

```css
:root {
  --color-black: #000000;
  --color-white: #FFFFFF;
  --color-orange: #FF5722;
  --color-orange-hover: #E64A19;
  --color-grey-bg: #E0E0E0;
  --color-grey-dark: #4A4A4A;
  --color-grey-medium: #9E9E9E;
  --color-grey-light: #F5F5F5;
  --color-sidebar-bg: #FFFFFF;
  --color-header-bg: #000000;
  --color-text-primary: #000000;
  --color-text-white: #FFFFFF;
  --color-text-muted: #9E9E9E;
  --border-radius: 4px;
  --transition: all 0.2s ease;
}

/* Reset + base */
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
html, body, #root { height: 100%; }
body {
  font-family: 'Inter', 'Helvetica Neue', sans-serif;
  font-size: 16px;
  color: var(--color-text-primary);
  background: var(--color-white);
}
```

### `frontend/src/main.tsx`
**What changes:** Обновить импорт стилей с `./styles/index.css` на `./styles/globals.css`.

### `frontend/package.json`
**What changes:** Добавить `"lucide-react": "^0.400.0"` в dependencies.

## Verification
- [ ] `cd frontend && npx tsc --noEmit` — 0 ошибок
- [ ] Импорт `globals.css` в `main.tsx` работает
- [ ] Старые CSS-переменные (`--primary-color`, `--bg-primary`) удалены
