# Phase 8: Routing + Cleanup

phase: 8
layer: App.tsx, удаление старых файлов
depends_on: phase-07
design: ../01-architecture.md

## Goal

Обновить роутинг в App.tsx под новую структуру (nested routes + AppLayout), удалить старые файлы, проверить финальную сборку.

## Context

Phase 7 создала все новые страницы:
- `pages/LoginPage.tsx`
- `pages/DashboardPage.tsx`
- `pages/WizardPage.tsx`
- `pages/ViewMeshPage.tsx` (обновлён)
- `components/Layout/AppLayout.tsx`

## Files to Modify

### `frontend/src/App.tsx`
**What changes:** Полностью заменить роутинг на nested routes.

```tsx
import { Routes, Route, Navigate } from 'react-router-dom';
import { AppLayout } from './components/Layout/AppLayout';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { WizardPage } from './pages/WizardPage';
import { ViewMeshPage } from './pages/ViewMeshPage';

function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={<AppLayout />}>
        <Route index element={<DashboardPage />} />
        <Route path="mesh/:id" element={<ViewMeshPage />} />
      </Route>
      <Route path="/upload" element={<WizardPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
```

Убрать: импорт NavBar, useLocation, условный рендер NavBar.

## Files to Delete

После успешной сборки удалить:
- `frontend/src/pages/HomePage.tsx`
- `frontend/src/pages/AddReconstructionPage.tsx`
- `frontend/src/pages/ReconstructionsListPage.tsx`
- `frontend/src/components/NavBar.tsx`
- `frontend/src/styles/index.css` (заменён на globals.css в phase-01)

## Verification
- [ ] `cd frontend && npx tsc --noEmit` — 0 ошибок
- [ ] `cd frontend && npm run lint` — 0 предупреждений
- [ ] `cd frontend && npm run build` — успешная сборка
- [ ] Маршрут `/login` — LoginPage без шапки/сайдбара
- [ ] Маршрут `/` — DashboardPage с Header + Sidebar
- [ ] Маршрут `/upload` — WizardPage с WizardShell
- [ ] Маршрут `/mesh/:id` — ViewMeshPage с Header + Sidebar
- [ ] Маршрут `/unknown` — redirect на `/`
- [ ] Нет импортов удалённых файлов
