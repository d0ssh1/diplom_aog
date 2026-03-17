# Architecture: Frontend Redesign

## C4 Level 1 — System Context

```mermaid
C4Context
title System Context — Frontend Redesign
Person(user, "Пользователь", "Загружает планы эвакуации, редактирует маски, просматривает 3D")
System(system, "Diplom3D", "Оцифровщик планов этажей + 3D-конструктор")
System_Ext(storage, "File Storage", "Хранит изображения и 3D-модели на диске")
Rel(user, system, "Использует через браузер")
Rel(system, storage, "Читает/пишет файлы")
```

## C4 Level 2 — Container

```mermaid
C4Container
title Container Diagram — Frontend Redesign
Container(frontend, "React App", "TypeScript + Three.js + Vite", "SPA: UI, wizard, 3D-вьюер")
Container(backend, "FastAPI", "Python 3.12", "REST API + image processing")
ContainerDb(db, "SQLite/PostgreSQL", "База данных")
Container(storage, "File Storage", "Disk", "Изображения + OBJ/GLB модели")
Rel(frontend, backend, "HTTP/REST /api/v1/", "axios")
Rel(backend, db, "SQLAlchemy async")
Rel(backend, storage, "File I/O")
Rel(frontend, storage, "GET /api/v1/uploads/*", "img src / Three.js loader")
```

**Важно:** Frontend не меняет backend. Все API-методы уже реализованы в `apiService.ts`.

## C4 Level 3 — Component

### 3.1 Frontend — целевая структура

```mermaid
C4Component
title Frontend Components — Frontend Redesign
Component(pages, "pages/", "React", "Сборка: LoginPage, DashboardPage, WizardPage, ViewMeshPage")
Component(layout, "components/Layout/", "React", "AppLayout, Header, Sidebar")
Component(wizard, "components/Wizard/", "React", "WizardShell, StepIndicator, Step1-5")
Component(upload, "components/Upload/", "React", "DropZone, FileGrid, FileCard, MetadataForm")
Component(editor, "components/Editor/", "React", "MaskEditor (существующий), ToolPanel")
Component(ui, "components/UI/", "React", "Button, IconButton, Slider")
Component(meshviewer, "components/MeshViewer/", "Three.js", "MeshViewer (без изменений)")
Component(hooks, "hooks/", "React", "useWizard, useFileUpload, useMeshViewer (существующий)")
Component(types, "types/", "TypeScript", "wizard.ts, dashboard.ts, reconstruction.ts (расширить)")
Component(api, "api/apiService.ts", "axios", "Все API-методы (без изменений)")
Component(styles, "styles/globals.css", "CSS", "Дизайн-система: переменные, reset, типографика")

Rel(pages, layout, "использует")
Rel(pages, wizard, "использует")
Rel(pages, hooks, "вызывает")
Rel(wizard, upload, "содержит")
Rel(wizard, editor, "содержит")
Rel(wizard, meshviewer, "содержит")
Rel(wizard, ui, "использует")
Rel(layout, ui, "использует")
Rel(hooks, api, "вызывает")
Rel(pages, types, "типизирует")
Rel(hooks, types, "типизирует")
```

### 3.2 Маршруты и layout-дерево

```
BrowserRouter
├── /login                    → <LoginPage />          (без layout)
├── /                         → <AppLayout />           (Header + Sidebar + Outlet)
│   ├── index                 → <DashboardPage />
│   └── mesh/:id              → <ViewMeshPage />
├── /upload                   → <WizardPage />          (WizardShell layout)
└── *                         → <Navigate to="/" />
```

### 3.3 Wizard — внутренняя структура

```
WizardPage
└── WizardShell (header + StepIndicator + footer)
    ├── step=1 → StepUpload
    │   ├── DropZone
    │   ├── FileGrid → FileCard[]
    │   └── MetadataForm
    ├── step=2 → StepEditMask
    │   ├── MaskEditor (canvas, Fabric.js)
    │   └── ToolPanel (crop, brush, eraser, slider)
    ├── step=3 → StepBuild
    ├── step=4 → StepView3D → MeshViewer
    └── step=5 → StepSave
```

## Module Dependency Graph

```mermaid
flowchart BT
    api[api/apiService.ts]
    types[types/]
    hooks[hooks/]
    ui[components/UI/]
    layout[components/Layout/]
    wizard[components/Wizard/]
    upload[components/Upload/]
    editor[components/Editor/]
    meshviewer[components/MeshViewer/]
    pages[pages/]
    styles[styles/globals.css]

    hooks --> api
    hooks --> types
    pages --> hooks
    pages --> layout
    pages --> wizard
    wizard --> upload
    wizard --> editor
    wizard --> meshviewer
    wizard --> ui
    layout --> ui
    upload --> ui
    editor --> ui

    api -.->|НИКОГДА| hooks
    api -.->|НИКОГДА| pages
```

**Правило:** Зависимости направлены внутрь. `api/` не знает о компонентах. Компоненты не вызывают `api/` напрямую — только через хуки.

## Новые файлы vs существующие

### Сохранить без изменений
- `frontend/src/api/apiService.ts` — все API-методы
- `frontend/src/components/MeshViewer.tsx` — Three.js вьюер
- `frontend/src/components/MeshViewer/RoomLabels.tsx`
- `frontend/src/components/MeshViewer/ViewerControls.tsx`
- `frontend/src/hooks/useMeshViewer.ts`
- `frontend/vite.config.ts`, `frontend/tsconfig.json`

### Заменить
- `frontend/src/pages/LoginPage.tsx` — переписать по макету
- `frontend/src/pages/HomePage.tsx` → `DashboardPage.tsx`
- `frontend/src/pages/AddReconstructionPage.tsx` → `WizardPage.tsx`
- `frontend/src/pages/ReconstructionsListPage.tsx` → удалить (функционал в DashboardPage)
- `frontend/src/components/NavBar.tsx` → `Layout/Header.tsx` + `Layout/Sidebar.tsx`
- `frontend/src/styles/index.css` → `styles/globals.css` (новая дизайн-система)
- `frontend/src/App.tsx` — обновить роутинг

### Создать новые
```
components/Layout/AppLayout.tsx
components/Layout/Header.tsx
components/Layout/Sidebar.tsx
components/Wizard/WizardShell.tsx
components/Wizard/StepIndicator.tsx
components/Wizard/StepUpload.tsx
components/Wizard/StepEditMask.tsx
components/Wizard/StepBuild.tsx
components/Wizard/StepView3D.tsx
components/Wizard/StepSave.tsx
components/Upload/DropZone.tsx
components/Upload/FileGrid.tsx
components/Upload/FileCard.tsx
components/Upload/MetadataForm.tsx
components/Editor/ToolPanel.tsx
components/UI/Button.tsx
components/UI/IconButton.tsx
components/UI/Slider.tsx
hooks/useWizard.ts
hooks/useFileUpload.ts
types/wizard.ts
types/dashboard.ts
pages/DashboardPage.tsx
pages/WizardPage.tsx
```
