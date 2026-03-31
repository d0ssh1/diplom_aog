# Pipeline Specification: crop→mask→rooms

## Where in the Pipeline

```text
plan upload → crop/rotation selection → mask preview generation → editor rendering → room/door annotation → vector save → nav graph build
```

This feature sits across the editor stage of the pipeline and affects how the plan preview, the mask preview, and the editable annotations share the same geometry basis.

## Input / Output

**Input:**
- `planUrl: string` — uploaded plan image URL
- `planCropRect: CropRect | null` — normalized crop rectangle in [0, 1]
- `planRotation: number` — one of 0/90/180/270 in the editor flow
- `maskUrl: string` — generated or edited mask image URL
- `rooms: RoomAnnotation[]` — normalized editor annotations
- `doors: DoorAnnotation[]` — normalized editor annotations

**Output:**
- `displayPlanUrl: string | null` — rendered plan image after rotation and optional crop
- `mask background image` — Fabric background image aligned to the same shared basis
- `roomsRef.current` / `doorsRef.current` — normalized annotations stored in editor state and later persisted

## Algorithm

1. Load the source plan image from `planUrl`.
2. Apply the requested rotation in the browser.
3. Apply the crop rectangle after rotation to form the visible plan preview.
4. Load the mask image from `maskUrl` as the editor background.
5. Render rooms and doors using normalized coordinates that are derived from the same displayed background geometry.
6. On save, serialize rooms and doors back into vector payloads and submit them to the backend.
7. Build the navigation graph using the same saved room/door data and the same mask file id.

## Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `cropRect` | `CropRect \| null` | `null` | Normalized crop box applied to the rotated plan |
| `rotation` | `number` | `0` | Plan rotation in degrees |
| `blockSize` | `number` | `15` | Mask preview parameter forwarded to backend |
| `thresholdC` | `number` | `10` | Mask preview parameter forwarded to backend |
| `overlayOpacity` | `number` | `0.4` | Visual opacity for the plan overlay |

## Error Handling

| Condition | Exception / Response | Behavior |
|-----------|----------------------|----------|
| Missing plan URL | no render | Clear the display plan URL |
| Missing mask URL | no background image | Editor cannot align annotations |
| Invalid crop or rotation | validation error / 400 | Preview request rejected by API |
| Failed preview generation | 500 / safe message | Editor keeps previous mask or empty state |
| Missing reconstruction vectors | 404 or null fallback | Editor loads empty annotations |

## Pipeline Consistency Notes
- The repository already documents that all coordinates after vectorization must be normalized to [0, 1] in `prompts/cv_patterns.md:86-108` and `prompts/pipeline.md:86-91`.
- `StepWallEditor` forwards `cropRect` and `rotation` to the preview mask API (`frontend/src/components/Wizard/StepWallEditor.tsx:93-110`).
- `WallEditorCanvas` currently applies the plan crop/rotation and separately loads the mask background (`frontend/src/components/Editor/WallEditorCanvas.tsx:78-117`, `243-268`).
- The key design requirement is that these two paths must produce the same effective geometry before rooms and doors are normalized.
