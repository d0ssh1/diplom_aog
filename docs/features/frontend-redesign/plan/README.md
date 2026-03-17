# Code Plan: Frontend Redesign

date: 2026-03-17
design: ../README.md
status: draft

## Phase Strategy

**Bottom-up по слоям UI:**
1. Фундамент (типы + дизайн-система + UI-примитивы)
2. Layout (AppLayout, Header, Sidebar)
3. Wizard infrastructure (WizardShell, StepIndicator, хуки)
4. Страницы (LoginPage, DashboardPage, WizardPage со всеми шагами)
5. Роутинг + финальная интеграция

Каждая фаза компилируется (`tsc --noEmit`) перед переходом к следующей.

## Phases

| # | Фаза | Слой | Зависит от | Статус |
|---|------|------|------------|--------|
| 1 | Types + Design System | types/, styles/ | — | ☐ |
| 2 | UI Primitives | components/UI/ | Phase 1 | ☐ |
| 3 | Layout Components | components/Layout/ | Phase 2 | ☐ |
| 4 | Wizard Infrastructure | components/Wizard/shell, hooks/ | Phase 2 | ☐ |
| 5 | Upload Components | components/Upload/ | Phase 2 | ☐ |
| 6 | Editor Components | components/Editor/ | Phase 2 | ☐ |
| 7 | Pages | pages/ | Phases 3-6 | ☐ |
| 8 | Routing + Cleanup | App.tsx, удаление старых файлов | Phase 7 | ☐ |

## File Map

### Новые файлы
- `frontend/src/types/wizard.ts` — WizardState, WizardStep, UploadedFile
- `frontend/src/types/dashboard.ts` — ReconstructionCard
- `frontend/src/styles/globals.css` — новая дизайн-система (заменяет index.css)
- `frontend/src/components/UI/Button.tsx` + `Button.module.css`
- `frontend/src/components/UI/IconButton.tsx` + `IconButton.module.css`
- `frontend/src/components/UI/Slider.tsx` + `Slider.module.css`
- `frontend/src/components/Layout/AppLayout.tsx` + `AppLayout.module.css`
- `frontend/src/components/Layout/Header.tsx` + `Header.module.css`
- `frontend/src/components/Layout/Sidebar.tsx` + `Sidebar.module.css`
- `frontend/src/components/Wizard/WizardShell.tsx` + `WizardShell.module.css`
- `frontend/src/components/Wizard/StepIndicator.tsx` + `StepIndicator.module.css`
- `frontend/src/components/Wizard/StepUpload.tsx`
- `frontend/src/components/Wizard/StepEditMask.tsx`
- `frontend/src/components/Wizard/StepBuild.tsx`
- `frontend/src/components/Wizard/StepView3D.tsx`
- `frontend/src/components/Wizard/StepSave.tsx`
- `frontend/src/components/Upload/DropZone.tsx` + `DropZone.module.css`
- `frontend/src/components/Upload/FileGrid.tsx` + `FileGrid.module.css`
- `frontend/src/components/Upload/FileCard.tsx` + `FileCard.module.css`
- `frontend/src/components/Upload/MetadataForm.tsx` + `MetadataForm.module.css`
- `frontend/src/components/Editor/ToolPanel.tsx` + `ToolPanel.module.css`
- `frontend/src/hooks/useWizard.ts`
- `frontend/src/hooks/useFileUpload.ts`
- `frontend/src/pages/DashboardPage.tsx` + `DashboardPage.module.css`
- `frontend/src/pages/WizardPage.tsx`

### Изменяемые файлы
- `frontend/src/pages/LoginPage.tsx` — переписать по макету
- `frontend/src/pages/ViewMeshPage.tsx` — минимальные правки (новый layout)
- `frontend/src/types/reconstruction.ts` — расширить типами
- `frontend/src/App.tsx` — обновить роутинг
- `frontend/package.json` — добавить lucide-react

### Удаляемые файлы (фаза 8)
- `frontend/src/pages/HomePage.tsx`
- `frontend/src/pages/AddReconstructionPage.tsx`
- `frontend/src/pages/ReconstructionsListPage.tsx`
- `frontend/src/components/NavBar.tsx`
- `frontend/src/styles/index.css`

### Сохраняются без изменений
- `frontend/src/api/apiService.ts`
- `frontend/src/components/MeshViewer.tsx`
- `frontend/src/components/MeshViewer/RoomLabels.tsx`
- `frontend/src/components/MeshViewer/ViewerControls.tsx`
- `frontend/src/hooks/useMeshViewer.ts`
- `frontend/src/components/CropSelector.tsx`
- `frontend/src/components/MaskEditor.tsx`

## Success Criteria
- [ ] Все фазы завершены
- [ ] `tsc --noEmit` — 0 ошибок
- [ ] `npm run lint` — 0 предупреждений
- [ ] Все 8 экранов из Figma реализованы
- [ ] Нет `any`, нет inline-стилей, нет `console.log`
- [ ] `MeshViewer.tsx` и `apiService.ts` не изменены
- [ ] Все acceptance criteria из ../README.md выполнены
