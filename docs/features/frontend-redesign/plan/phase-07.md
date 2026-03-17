# Phase 7: Pages

phase: 7
layer: pages/
depends_on: phase-03, phase-04, phase-05, phase-06
design: ../01-architecture.md, ../02-behavior.md

## Goal

Создать/переписать все страницы: LoginPage, DashboardPage, WizardPage (со всеми 5 шагами). ViewMeshPage получает минимальные правки для совместимости с новым layout.

## Context

Phases 1-6 создали:
- `types/wizard.ts`, `types/dashboard.ts`
- `components/UI/Button.tsx`, `IconButton.tsx`, `Slider.tsx`
- `components/Layout/AppLayout.tsx`, `Header.tsx`, `Sidebar.tsx`
- `components/Wizard/WizardShell.tsx`, `StepIndicator.tsx`
- `components/Upload/DropZone.tsx`, `FileGrid.tsx`, `FileCard.tsx`, `MetadataForm.tsx`
- `components/Editor/ToolPanel.tsx`
- `hooks/useWizard.ts`, `hooks/useFileUpload.ts`
- Существующие без изменений: `MeshViewer.tsx`, `MaskEditor.tsx`, `CropSelector.tsx`

## Files to Create/Modify

### `frontend/src/pages/LoginPage.tsx` (переписать)
**Purpose:** Экран входа по макету `docs/design/00_login.png`.

Layout: два блока на всю высоту, без AppLayout:
- Левая половина (~50%): оранжевый фон `--color-orange`, изображение `assets/building-isometric.png` по центру
- Правая половина (~50%): белый фон, форма по центру

Форма:
- Заголовок "Вход в систему" (чёрный, bold, ~36px)
- Инпут "Логин" — dashed border (`border: 2px dashed #BDBDBD`), focus: `--color-orange`
- Инпут "Пароль" — аналогично
- Кнопка "Войти" (secondary — чёрный фон, белый текст, ~200px)

Логика:
- `authApi.login(username, password)` возвращает `response.data` без типизации
- Перед использованием проверить реальную структуру ответа `/token/login/` в бэкенде (`backend/app/api/auth.py` или аналог) — поле может называться `access_token`, `token`, или быть вложенным
- Определить локальный тип `interface LoginResponse { access_token: string }` (или скорректировать по факту) и сделать type assertion: `const data = result as LoginResponse`
- `localStorage.setItem('auth_token', data.access_token)` → `navigate('/')`
- Ошибка: красная рамка на инпутах + сообщение

### `frontend/src/pages/LoginPage.module.css`
Стили LoginPage.

### `frontend/src/pages/DashboardPage.tsx` (новый)
**Purpose:** Главное меню — пустое и с файлами. Макеты `01_dashboard_empty.png`, `02_dashboard_file.png`.

Используется внутри `AppLayout` (Header + Sidebar уже есть).

Правая область:
- Если нет реконструкций: фон `assets/building-blur.png` (background-image), иконка × в круге (lucide `X`), текст "Нет загруженных планов", кнопка "Начать" → `navigate('/upload')`
- Если есть: светло-серый фон `--color-grey-bg`, сетка карточек 3 в ряд

Карточка реконструкции:
- Превью (img или серый прямоугольник если нет url)
- Оранжевый × в правом верхнем углу → `deleteReconstruction(id)`
- Имя файла под превью
- Клик на карточку → `navigate('/mesh/${id}')`

Логика:
- `useEffect` → `reconstructionApi.getReconstructions()` при монтировании
- Состояние: `reconstructions`, `isLoading`, `error`

### `frontend/src/pages/DashboardPage.module.css`
Стили DashboardPage.

### `frontend/src/pages/WizardPage.tsx` (новый, заменяет AddReconstructionPage)
**Purpose:** Wizard из 5 шагов. Использует `useWizard`, `useFileUpload`, `WizardShell`.

```typescript
// Нет props — всё через хуки
export const WizardPage: React.FC = () => {
  const wizard = useWizard();
  const upload = useFileUpload();
  // рендерит WizardShell с нужным Step-компонентом
};
```

Рендер по шагу:
- step=1 → `<StepUpload files={upload.files} onFileSelect={upload.addFile} onRemove={upload.removeFile} />`
- step=2 → `<StepEditMask planUrl={wizard.state.planUrl} maskUrl={...} onToolChange={...} />`
- step=3 → `<StepBuild onBuild={wizard.buildMesh} isBuilding={wizard.state.isLoading} />`
- step=4 → `<StepView3D meshUrl={wizard.state.meshUrl} />`
- step=5 → `<StepSave onSave={wizard.save} isLoading={wizard.state.isLoading} />`

### Wizard Step Components

#### `frontend/src/components/Wizard/StepUpload.tsx`
Layout: левая панель (DropZone) + правая панель (FileGrid).
Props: `files`, `onFileSelect`, `onRemove`, `isUploading`.

#### `frontend/src/components/Wizard/StepEditMask.tsx`
Layout: canvas (~75%) + ToolPanel (~25%).
Props: `planUrl`, `maskUrl`, `onMaskSave`.
Использует существующий `MaskEditor` и новый `ToolPanel`.
Синхронизирует `activeTool` и `brushSize` между ToolPanel и MaskEditor.

#### `frontend/src/components/Wizard/StepBuild.tsx`
Layout: фоновое изображение, кнопка "Построить" по центру.
Props: `onBuild`, `isBuilding`, `error`.
Макет: `docs/design/09_hough_build.png`.

#### `frontend/src/components/Wizard/StepView3D.tsx`
Layout: MeshViewer на всю область.
Props: `meshUrl`, `reconstructionId`.
Использует существующий `MeshViewer` и `useMeshViewer`.

#### `frontend/src/components/Wizard/StepSave.tsx`
Layout: форма с полем названия, кнопка "Сохранить".
Props: `onSave`, `isLoading`.

### `frontend/src/pages/ViewMeshPage.tsx` (минимальные правки)
**What changes:** Убрать зависимость от NavBar (уже в AppLayout). Проверить совместимость с новым роутингом. Логика и MeshViewer не меняются.

## Verification
- [ ] `cd frontend && npx tsc --noEmit` — 0 ошибок
- [ ] Нет `any`, нет inline-стилей, нет `console.log/error`
- [ ] WizardPage не содержит прямых вызовов API — только через хуки
- [ ] DashboardPage не содержит прямых вызовов API — только через локальный useEffect + apiService
- [ ] LoginPage не использует AppLayout
