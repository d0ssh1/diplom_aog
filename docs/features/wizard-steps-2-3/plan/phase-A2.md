# Phase A2: CropOverlay Component

phase: A2
layer: components/Editor
depends_on: A1
design: ../README.md

## Goal

Build a pure div-based crop overlay that renders over an `<img>` and lets the user
drag the 4 corners to resize and drag the interior to move the crop rect.
Outputs normalized [0,1] coordinates via `onCropChange`.

## Context

Phase A1 added `CropRect` (already exists in `types/wizard.ts`) and `RoomAnnotation`/`DoorAnnotation`.
This component uses `CropRect` as its output type.

## Files to Create

### `frontend/src/components/Editor/CropOverlay.tsx`

**Purpose:** Renders a resizable/movable crop rect over an image.

**Props:**
```typescript
interface CropOverlayProps {
  imageRef: React.RefObject<HTMLImageElement>;
  cropRect: CropRect;                        // normalized [0,1]
  onChange: (rect: CropRect) => void;
}
```

**Implementation details:**
- Container: `position: absolute; inset: 0; pointer-events: none` (sits over image)
- Crop rect div: `position: absolute` with `left/top/width/height` computed from normalized coords × image rendered size
- Use `imageRef.current.getBoundingClientRect()` to get rendered image size (not natural size)
- 4 corner handles: `position: absolute` 12×12px orange squares, `pointer-events: all`
- Interior drag area: `position: absolute; inset: 12px; cursor: move; pointer-events: all`
- Darkened overlay: 4 divs (top/bottom/left/right strips) with `rgba(0,0,0,0.5)`
- On corner mousedown: track which corner (tl/tr/bl/br), listen to `mousemove`/`mouseup` on `document`
- On interior mousedown: track offset from rect origin, listen to `mousemove`/`mouseup` on `document`
- On mousemove: compute new rect in pixels → normalize → clamp to [0,1] → call `onChange`
- Min size: 10% of image in each dimension
- Cleanup: remove document event listeners on mouseup and on unmount
- Reference: 02-behavior.md Use Case 1 for coordinate normalization rules

**Helper functions (pure, exportable for testing):**
```typescript
export function normalizeCropRect(
  pixelRect: { x: number; y: number; width: number; height: number },
  imageWidth: number,
  imageHeight: number
): CropRect

export function clampCropRect(rect: CropRect, minSize?: number): CropRect
```

### `frontend/src/components/Editor/CropOverlay.module.css`

**Purpose:** Styles for overlay, handles, darkened strips.

Key classes:
- `.overlay` — `position: absolute; inset: 0; pointer-events: none`
- `.cropRect` — `position: absolute; border: 2px dashed #FF4500; pointer-events: none`
- `.handle` — `position: absolute; width: 12px; height: 12px; background: #FF4500; pointer-events: all; cursor: nwse-resize`
- `.interior` — `position: absolute; inset: 12px; cursor: move; pointer-events: all`
- `.dimTop`, `.dimBottom`, `.dimLeft`, `.dimRight` — `position: absolute; background: rgba(0,0,0,0.5); pointer-events: none`

## Verification
- [ ] `npx tsc --noEmit` passes
- [ ] `normalizeCropRect` and `clampCropRect` are exported (needed for tests in 04-testing.md)
- [ ] No Fabric.js imports (this component is div-only)
