# Behavior: Wizard Steps 2-3

## Data Flow Diagrams

### DFD: Step 2 → Step 3 Transition

```mermaid
flowchart LR
User([User]) -->|clicks Далее| WizardPage
WizardPage -->|calculateMask| useWizard
useWizard -->|POST /reconstruction/initial-masks| Backend[FastAPI]
Backend -->|mask PNG| Storage[(File Storage)]
Backend -->|file_id| useWizard
useWizard -->|maskFileId| WizardState
WizardPage -->|advance to step 3| StepWallEditor
StepWallEditor -->|load mask URL| WallEditorCanvas
```

### DFD: Step 3 → Step 4 Transition

```mermaid
flowchart LR
User([User]) -->|clicks Далее| WizardPage
WizardPage -->|getBlob + getAnnotations| WallEditorCanvas
WallEditorCanvas -->|PNG blob| WizardPage
WizardPage -->|uploadUserMask| useWizard
useWizard -->|POST /upload/user-mask| Backend[FastAPI]
Backend -->|file_id| useWizard
useWizard -->|editedMaskFileId + rooms + doors| WizardState
WizardPage -->|advance to step 4| StepBuild
```

## Sequence Diagrams

### Use Case 1: Step 2 — Crop + Rotate + Advance

```mermaid
sequenceDiagram
actor User
participant StepPreprocess
participant CropOverlay
participant WizardPage
participant useWizard
participant API as apiService

User->>StepPreprocess: drag crop corner
StepPreprocess->>CropOverlay: onCropChange(rect)
CropOverlay-->>StepPreprocess: cropRect {x,y,w,h} normalized [0,1]
StepPreprocess->>WizardPage: onCropChange(rect)
WizardPage->>useWizard: setCropRect(rect)

User->>StepPreprocess: click Повернуть
StepPreprocess->>WizardPage: onRotate()
WizardPage->>useWizard: setRotation((prev+90)%360)

User->>WizardPage: click Далее
WizardPage->>useWizard: calculateMask()
useWizard->>API: POST /reconstruction/initial-masks {file_id, crop, rotation}
Note over WizardPage: isLoading=true, spinner shown
API-->>useWizard: {file_id: "mask-uuid"}
useWizard-->>WizardPage: maskFileId set, isLoading=false
WizardPage->>WizardPage: nextStep() → step=3
```

**Error cases:**

| Condition | Behavior |
|-----------|----------|
| calculateMask fails (500) | `state.error` set, spinner hidden, user stays on step 2 |
| No file uploaded | "Далее" button disabled (step 1 guard) |
| planFileId null | calculateMask returns early, no API call |

**Edge cases:**
- Auto-rotate: if `naturalHeight > naturalWidth` on image load → `setRotation(90)` + toast "Изображение автоматически повёрнуто"
- No crop set: `cropRect` stays null, backend receives `crop: null` (full image)

---

### Use Case 2: Step 3 — Draw Wall

```mermaid
sequenceDiagram
actor User
participant WallEditorCanvas
participant FabricCanvas as fabric.Canvas

User->>WallEditorCanvas: click (first point)
WallEditorCanvas->>WallEditorCanvas: startPoint = {x, y}
WallEditorCanvas->>FabricCanvas: add preview line (dashed orange)

User->>WallEditorCanvas: mousemove
WallEditorCanvas->>FabricCanvas: update preview line endpoint

User->>WallEditorCanvas: click (second point)
WallEditorCanvas->>FabricCanvas: remove preview line
WallEditorCanvas->>FabricCanvas: add fabric.Line(white, strokeWidth=brushSize)
WallEditorCanvas->>WallEditorCanvas: startPoint = null
```

**Edge cases:**
- Shift held on second click → snap endpoint to nearest 0°/90° axis from startPoint
- Tool changed mid-draw → discard preview line, reset startPoint

---

### Use Case 3: Step 3 — Label Room (Кабинет)

```mermaid
sequenceDiagram
actor User
participant WallEditorCanvas
participant RoomPopup
participant FabricCanvas as fabric.Canvas

User->>WallEditorCanvas: mousedown (start rect)
WallEditorCanvas->>FabricCanvas: draw selection rect (dashed orange)
User->>WallEditorCanvas: mouseup (end rect)
WallEditorCanvas->>RoomPopup: show at rect position
User->>RoomPopup: type room number, press Enter
RoomPopup-->>WallEditorCanvas: roomName = "1104"
WallEditorCanvas->>FabricCanvas: add fabric.Group([Rect, Text])
WallEditorCanvas->>WallEditorCanvas: rooms.push({id, name, room_type:'room', x,y,w,h normalized})
```

**Edge cases:**
- User presses Escape in popup → discard rect, no room added
- Empty room name → still add rect with empty label (valid for corridor/staircase types)
- Delete key on selected group → remove from canvas + rooms array

---

### Use Case 4: Step 3 → Step 4 Transition

```mermaid
sequenceDiagram
actor User
participant WizardPage
participant WallEditorCanvas
participant useWizard
participant API as apiService

User->>WizardPage: click Далее
WizardPage->>WallEditorCanvas: ref.getBlob()
WallEditorCanvas-->>WizardPage: PNG Blob
WizardPage->>WallEditorCanvas: ref.getAnnotations()
WallEditorCanvas-->>WizardPage: {rooms[], doors[]}
WizardPage->>useWizard: saveMaskAndAnnotations(blob, rooms, doors)
useWizard->>API: POST /upload/user-mask (multipart)
API-->>useWizard: {file_id: "edited-mask-uuid"}
useWizard-->>WizardPage: editedMaskFileId set
WizardPage->>WizardPage: nextStep() → step=4
```

**Error cases:**

| Condition | Behavior |
|-----------|----------|
| uploadUserMask fails | `state.error` set, user stays on step 3 |
| Canvas has no changes | Still export + upload (mask unchanged is valid) |
