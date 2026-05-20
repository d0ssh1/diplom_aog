# Pipeline Specification: shift-fix

## Where in the Pipeline

```text
[1] Preprocessing → [2] Text Removal → [3] Wall Vectorization → [4] FloorPlan Assembly → [5] 3D Build
```

This feature focuses on the transform consistency that must hold across steps [1] through [5], plus the frontend crop/editor rendering that feeds those steps.

## Input / Output

**Input:**
- Frontend crop and rotation state
- Uploaded plan image as `np.ndarray` or file bytes
- Saved mask image and editor annotations
- Previously stored vectorization data

**Output:**
- Mask preview bytes
- Saved mask file
- `VectorizationResult` with normalized coordinates
- Reconstruction mesh files (`OBJ`, `GLB`)
- Nav graph JSON and route coordinates

## Algorithm

1. Load the source plan image and apply the same crop/rotation transform in every preview and save path.
2. Normalize brightness and remove colored elements if enabled.
3. Apply thresholding and text removal to produce a binary mask.
4. Extract contours/rooms/doors and convert them to normalized coordinates.
5. Persist vectorization data, mesh artifacts, and nav graph data using the same geometric frame.
6. Render the frontend editor and 3D viewer against the same saved transform metadata.

## Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `crop` | object | none | Crop rectangle applied to the source image |
| `rotation` | int | 0 | Rotation applied before processing |
| `block_size` | int | implementation-defined | Thresholding parameter used in mask generation |
| `threshold_c` | int | implementation-defined | Threshold offset used in mask generation |
| `scale_factor` | float | derived | Scale used by nav graph and 3D route conversion |

## Error Handling

| Condition | Exception | Message |
|-----------|------------|---------|
| Empty image | `ImageProcessingError` | `"[step] Empty image"` |
| Wrong dtype | `ImageProcessingError` | `"[step] Expected uint8, got {dtype}"` |
| Missing source file | service/API error | `"..."` |
| Inconsistent transform metadata | validation/service error | `"..."` |

## Notes on Alignment
- Frontend canvas coordinates and backend image coordinates must represent the same origin after crop and rotation.
- `VectorizationResult` is the likely place to round-trip crop and rotation metadata because the research shows those values already flow through reconstruction data.
- Normalized coordinates must remain in `[0, 1]` after vectorization so reconstruction and nav graph rendering do not reintroduce pixel-space drift.
