# Phase 4: Wizard Infrastructure

phase: 4
layer: components/Wizard/shell, hooks/
depends_on: phase-02
design: ../01-architecture.md, ../02-behavior.md

## Goal

Создать WizardShell (layout wizard), StepIndicator (5 кружков) и два хука: useWizard (состояние wizard) и useFileUpload (загрузка файлов).

## Context

Phase 1-2 создали:
- `types/wizard.ts` — `WizardState`, `WizardStep`, `UploadedFile`
- `components/UI/Button.tsx` — используется в footer wizard

## Files to Create

### `frontend/src/hooks/useWizard.ts`
**Purpose:** Управление состоянием wizard — шаги, данные, API-вызовы.

```typescript
interface UseWizardReturn {
  state: WizardState;
  nextStep: () => void;
  prevStep: () => void;
  setPlanFile: (id: string, url: string) => void;
  calculateMask: () => Promise<void>;
  setMaskFile: (id: string) => void;
  buildMesh: () => Promise<void>;
  save: (name: string) => Promise<void>;
  setCropRect: (rect: CropRect | null) => void;
  setRotation: (deg: 0 | 90 | 180 | 270) => void;
}
```
- Использует `reconstructionApi` из `apiService.ts`
- `calculateMask` вызывается автоматически при входе в шаг 2
- `buildMesh` вызывается по клику "Построить" на шаге 3
- `save` вызывает `saveReconstruction` затем `navigate('/')`
- Ошибки пишутся в `state.error`

### `frontend/src/hooks/useFileUpload.ts`
**Purpose:** Загрузка файлов через drag-drop или file picker.

```typescript
interface UseFileUploadReturn {
  files: UploadedFile[];
  isUploading: boolean;
  error: string | null;
  addFile: (file: File) => Promise<void>;
  removeFile: (id: string) => void;
  clearFiles: () => void;
}
```
- `addFile` вызывает `uploadApi.uploadPlanPhoto(file)`
- Валидация формата до загрузки (jpg, png, pdf)
- Один файл за раз (для wizard шага 1)

### `frontend/src/components/Wizard/StepIndicator.tsx`
**Purpose:** 5 кружков — индикатор текущего шага.

```typescript
interface StepIndicatorProps {
  totalSteps: number;
  currentStep: number; // 1-based
}
```
- Активный: оранжевый (#FF5722), заполненный
- Пройденный: белый/светлый, заполненный
- Будущий: серый (#9E9E9E), незаполненный
- Размер кружка: ~20px, горизонтально по центру

### `frontend/src/components/Wizard/StepIndicator.module.css`
Стили StepIndicator.

### `frontend/src/components/Wizard/WizardShell.tsx`
**Purpose:** Layout wizard: чёрная шапка + StepIndicator + children + footer (Назад/Далее).

```typescript
interface WizardShellProps {
  currentStep: number;
  totalSteps: number;
  onNext: () => void;
  onPrev: () => void;
  onClose: () => void;
  nextDisabled?: boolean;
  nextLabel?: string;
  children: React.ReactNode;
}
```
- Header: чёрный фон, StepIndicator по центру, кнопка × справа
- Footer: кнопка "Назад" (secondary) слева, кнопка "> Далее" (primary) справа
- Шаг 1: "Назад" → navigate('/') или скрыта
- Шаг 5: "Далее" заменяется на "Сохранить"

### `frontend/src/components/Wizard/WizardShell.module.css`
Стили WizardShell.

## Verification
- [ ] `cd frontend && npx tsc --noEmit` — 0 ошибок
- [ ] `useWizard` не импортирует ничего из `components/`
- [ ] `useFileUpload` не импортирует ничего из `components/`
- [ ] Нет `any`, нет inline-стилей
