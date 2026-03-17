# Architecture: Wizard Steps 2-3

## C4 Level 1 — System Context

```mermaid
C4Context
title System Context — Wizard Steps 2-3
Person(user, "User", "Uploads floor plan photo, crops/rotates, edits walls")
System(system, "Diplom3D", "Floor plan digitizer + 3D builder")
System_Ext(backend, "FastAPI Backend", "Vectorization + mask generation")
Rel(user, system, "Uses via browser")
Rel(system, backend, "POST /api/v1/reconstruction/initial-masks")
```

## C4 Level 2 — Container

```mermaid
C4Container
title Container Diagram — Wizard Steps 2-3
Container(frontend, "React App", "TypeScript", "Wizard UI")
Container(backend, "FastAPI", "Python 3.12", "calculateMask endpoint")
ContainerDb(storage, "File Storage", "Disk", "Uploaded images + masks")
Rel(frontend, backend, "POST /api/v1/reconstruction/initial-masks")
Rel(backend, storage, "Reads plan photo, writes mask PNG")
```

## C4 Level 3 — Component

### 3.1 Frontend Components

```mermaid
C4Component
title Wizard Steps 2-3 — Frontend Components
Component(wizardPage, "WizardPage", "pages/WizardPage.tsx", "Orchestrates all steps, handles transitions")
Component(wizardShell, "WizardShell", "components/Wizard/WizardShell.tsx", "Header + footer nav, step count")
Component(stepPreprocess, "StepPreprocess", "components/Wizard/StepPreprocess.tsx", "Step 2: raw photo + crop + rotate")
Component(stepWallEditor, "StepWallEditor", "components/Wizard/StepWallEditor.tsx", "Step 3: Fabric.js canvas + tool panel")
Component(cropOverlay, "CropOverlay", "components/Editor/CropOverlay.tsx", "Drag-resizable crop rect over image")
Component(wallEditorCanvas, "WallEditorCanvas", "components/Editor/WallEditorCanvas.tsx", "Fabric.js canvas: wall/eraser/markup tools")
Component(toolPanelV2, "ToolPanelV2", "components/Editor/ToolPanelV2.tsx", "Right panel: tool buttons + slider")
Component(roomPopup, "RoomPopup", "components/Editor/RoomPopup.tsx", "Inline popup for room number input")
Component(useWizard, "useWizard", "hooks/useWizard.ts", "Wizard state: step, cropRect, rotation, rooms, doors")
Component(apiService, "apiService", "api/apiService.ts", "reconstructionApi.calculateMask()")
Rel(wizardPage, wizardShell, "Renders inside")
Rel(wizardPage, stepPreprocess, "Renders at step 2")
Rel(wizardPage, stepWallEditor, "Renders at step 3")
Rel(stepPreprocess, cropOverlay, "Renders over image")
Rel(stepPreprocess, toolPanelV2, "Right panel")
Rel(stepWallEditor, wallEditorCanvas, "Canvas area")
Rel(stepWallEditor, toolPanelV2, "Right panel")
Rel(wallEditorCanvas, roomPopup, "Shows on rect draw")
Rel(wizardPage, useWizard, "State + actions")
Rel(useWizard, apiService, "calculateMask()")
```

### 3.2 State Shape (useWizard)

```typescript
// types/wizard.ts additions
export type WizardStep = 1 | 2 | 3 | 4 | 5 | 6;

export interface RoomAnnotation {
  id: string;
  name: string;           // room number or empty
  room_type: 'room' | 'staircase' | 'elevator' | 'corridor';
  x: number;              // normalized [0,1]
  y: number;
  width: number;
  height: number;
}

export interface DoorAnnotation {
  id: string;
  x1: number; y1: number;  // normalized [0,1]
  x2: number; y2: number;
}

// WizardState additions:
// rooms: RoomAnnotation[]
// doors: DoorAnnotation[]
// editedMaskFileId: string | null
```

## Module Dependency Graph

```mermaid
flowchart BT
WizardPage --> useWizard
WizardPage --> StepPreprocess
WizardPage --> StepWallEditor
StepPreprocess --> CropOverlay
StepPreprocess --> ToolPanelV2
StepWallEditor --> WallEditorCanvas
StepWallEditor --> ToolPanelV2
WallEditorCanvas --> RoomPopup
useWizard --> apiService
```

**Rule:** Components are pure render. All API calls go through `useWizard`. `WallEditorCanvas` manages Fabric.js lifecycle internally and exposes `getBlob()` + `getAnnotations()` via ref.
