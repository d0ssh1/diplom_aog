# Behavior: crop→mask→rooms

## Data Flow Diagrams

### DFD: Crop and Preview Generation

```mermaid
flowchart LR
Admin([Admin]) --> StepPreprocess[StepPreprocess]
StepPreprocess -->|cropRect + rotation| WizardPage[WizardPage]
WizardPage -->|POST preview request| API[reconstructionApi.previewMask]
API --> Backend[Reconstruction API]
Backend --> Storage[(File Storage)]
Backend -->|mask blob URL| Frontend[StepWallEditor]
Frontend -->|maskUrl + planUrl| WallCanvas[WallEditorCanvas]
```

### DFD: Annotation Editing and Save

```mermaid
flowchart LR
Admin([Admin]) --> WallCanvas[WallEditorCanvas]
WallCanvas -->|draw room / door| Rooms[(roomsRef)]
WallCanvas -->|normalize against background bounds| Doors[(doorsRef)]
Rooms -->|getAnnotations| Save[WizardPage / EditPlanPage]
Doors -->|getAnnotations| Save
Save -->|PUT vectors| Backend[Reconstruction API]
Backend --> DB[(reconstructions.vectorization_data)]
Backend --> Nav[buildNavGraph]
Nav --> DB2[(nav graph storage)]
```

## Sequence Diagrams

### Use Case 1: Generate a cropped/rotated preview mask

```mermaid
sequenceDiagram
actor Admin
participant StepPreprocess
participant StepWallEditor
participant Api as reconstructionApi
participant Router as Reconstruction Router
participant Service as Reconstruction Service
participant Storage as File Storage

Admin->>StepPreprocess: Adjust crop and rotation
StepPreprocess-->>StepWallEditor: Pass cropRect + rotation
StepWallEditor->>Api: previewMask(planFileId, cropRect, rotation, blockSize, thresholdC)
Api->>Router: POST /reconstruction/mask-preview
Router->>Service: build preview request
Service->>Storage: read plan file, apply crop/rotation, render preview
Storage-->>Service: preview blob
Service-->>Router: blob response
Router-->>Api: blob
Api-->>StepWallEditor: object URL
StepWallEditor-->>Admin: mask preview updates
```

**Error cases:**

| Condition | HTTP Status | Response | Behavior |
|-----------|-----------|----------|----------|
| Missing plan file | 404 | `{"detail": "..."}` | Preview cannot be generated |
| Invalid crop/rotation | 400 | validation error | Request rejected before processing |
| Preview generation failure | 500 | safe error message | Log the failure and stop refresh loop |

### Use Case 2: Render editor with shared plan/mask geometry

```mermaid
sequenceDiagram
actor Admin
participant WizardPage
participant StepWallEditor
participant WallCanvas as WallEditorCanvas
participant Api as reconstructionApi
participant Backend as Reconstruction API
participant Storage as File Storage

Admin->>WizardPage: Open edit flow
WizardPage->>Api: getReconstructionById / getReconstructionVectors
Api->>Backend: GET reconstruction + vectors
Backend->>Storage: resolve plan and mask URLs
Storage-->>Backend: urls + vector data
Backend-->>Api: reconstruction payload
Api-->>WizardPage: PlanData
WizardPage->>StepWallEditor: pass planUrl, cropRect, rotation, maskUrl, rooms, doors
StepWallEditor->>WallCanvas: mount with shared props
WallCanvas->>WallCanvas: build displayPlanUrl from planUrl + crop + rotation
WallCanvas->>WallCanvas: load maskUrl as background
WallCanvas->>WallCanvas: restore rooms and doors from vectors
```

**Error cases:**

| Condition | HTTP Status | Response | Behavior |
|-----------|-----------|----------|----------|
| Reconstruction not found | 404 | `{"detail": "..."}` | Editor page shows error state |
| Vectorization data missing | 404/nullable fallback | `null` or error detail | Editor loads with empty annotations |
| Mask URL missing | none/empty string | empty string | Editor cannot align layers and stays degraded |

### Use Case 3: Place a room or door and save it

```mermaid
sequenceDiagram
actor Admin
participant WallCanvas as WallEditorCanvas
participant Popup as RoomPopup
participant WizardPage
participant Api as reconstructionApi
participant Backend as Reconstruction API
participant Nav as Nav Service

Admin->>WallCanvas: Select room or door tool
Admin->>WallCanvas: Drag / click on canvas
WallCanvas->>WallCanvas: Normalize coordinates against background bounds
WallCanvas->>Popup: Request room name if needed
Admin->>Popup: Confirm room name
Popup-->>WallCanvas: onConfirm(name)
WallCanvas->>WizardPage: getAnnotations()
WizardPage->>Api: updateVectorizationData(id, updatedPayload)
Api->>Backend: PUT /reconstruction/reconstructions/{id}/vectors
Backend-->>Api: saved
WizardPage->>Api: buildNavGraph(maskFileId, rooms, doors)
Api->>Backend: POST /reconstruction/nav-graph
Backend->>Nav: build graph from mask + rooms + doors
Nav-->>Backend: graph_id
Backend-->>Api: graph response
```

**Error cases:**

| Condition | HTTP Status | Response | Behavior |
|-----------|-----------|----------|----------|
| Invalid room payload | 400 | validation error | Save rejected |
| Reconstruction not found | 404 | `{"detail": "Реконструкция не найдена"}` | Save or update fails |
| Nav graph build failure | 500 | safe error message | Graph step stops; edited vectors remain saved |

### Use Case 4: Re-open an edited plan

```mermaid
sequenceDiagram
actor Admin
participant EditPlanPage
participant Api as reconstructionApi
participant Backend as Reconstruction API
participant WallCanvas as WallEditorCanvas

Admin->>EditPlanPage: Open existing reconstruction
EditPlanPage->>Api: getReconstructionById + getReconstructionVectors
Api->>Backend: GET reconstruction + vectors
Backend-->>Api: payload with planUrl, maskUrl, cropRect, rooms, doors
Api-->>EditPlanPage: PlanData
EditPlanPage->>WallCanvas: pass initialRooms and initialDoors
WallCanvas->>WallCanvas: restore annotations against mask background bounds
WallCanvas-->>Admin: sees current edit state
```

## DFD Notes
- The plan crop and rotation originate in `StepPreprocess` and are reused by both the preview-mask request and the plan rendering effect.
- The mask preview is regenerated whenever crop or rotation changes in `StepWallEditor`.
- Rooms and doors are currently normalized using the visible background image dimensions in `WallEditorCanvas`.
- The save flow persists the edited annotations to vectorization data, then triggers nav graph building from the same room/door arrays.

## Edge Cases Specific to This Feature
- The plan preview can be cropped while the mask URL remains from an earlier generation if preview refresh is delayed.
- The plan may render with a different transform than the mask when the loaded reconstruction already has stored crop metadata.
- Door coordinates are stored as a point-like annotation (`x1 == x2`, `y1 == y2`) and are sensitive to any mismatch in the shared basis.
- Restored rooms are converted from polygons to bounding rectangles in `EditPlanPage`, which can lose the original polygon shape when re-rendering annotations.
