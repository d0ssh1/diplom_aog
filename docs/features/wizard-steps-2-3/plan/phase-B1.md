# Phase B1: WallEditorCanvas (Fabric.js)

phase: B1
layer: components/Editor
depends_on: A1
design: ../README.md

## Goal

Build the Fabric.js canvas component for Step 3. Handles wall drawing (click-click),
eraser (free draw), and room markup (drag rect). Exposes `getBlob()` and
`getAnnotations()` via imperative ref.

## Context

- Phase A1: `RoomAnnotation`, `DoorAnnotation` types available in `types/wizard.ts`

## Files to Create

### `frontend/src/components/Editor/WallEditorCanvas.tsx`

**Purpose:** Fabric.js canvas with wall/eraser/markup tools. Loads mask as background image.

**Ref interface:**
```typescript
export interface WallEditorCanvasRef {
  getBlob: () => Promise<Blob>;
  getAnnotations: () => { rooms: RoomAnnotation[]; doors: DoorAnnotation[] };
}
```

**Props:**
```typescript
interface WallEditorCanvasProps {
  maskUrl: string;
  activeTool: 'wall' | 'eraser' | 'room' | 'staircase' | 'elevator' | 'corridor' | 'door';
  brushSize: number;
  onRoomPopupRequest: (rect: { x: number; y: number; w: number; h: number }, onConfirm: (name: string) => void, onCancel: () => void) => void;
}
```

**Implementation details:**

Initialization (`useEffect` on mount):
- Create `fabric.Canvas(canvasEl, { selection: false })`
- Set canvas width/height to container size via `containerRef.current.getBoundingClientRect()`
- Load mask as background: `fabric.Image.fromURL(maskUrl, (img) => { canvas.setBackgroundImage(img, canvas.renderAll.bind(canvas), { scaleX: canvas.width/img.width, scaleY: canvas.height/img.height }) })`
- Cleanup on unmount: `canvas.dispose()`

Tool switching (`useEffect` on `activeTool`):
- `wall` / `door`: `canvas.isDrawingMode = false`; attach `mouse:down` / `mouse:move` / `mouse:up` handlers
- `eraser`: `canvas.isDrawingMode = true; canvas.freeDrawingBrush.color = 'black'; canvas.freeDrawingBrush.width = brushSize`
- `room/staircase/elevator/corridor`: `canvas.isDrawingMode = false`; attach rect-draw handlers
- Always remove previous event listeners before attaching new ones

Wall tool logic:
```typescript
// ВАЖНО: стена рисуется ДВУМЯ ОТДЕЛЬНЫМИ КЛИКАМИ, не drag!
// state: startPoint: {x, y} | null

// First mouse:down (no drag) → set startPoint, add preview line (dashed orange, selectable:false)
// mouse:move (no button held) → update preview line x2/y2 in real time
// Second mouse:down → compute endPoint, apply Shift-snap, remove preview, add final white line, reset startPoint to null
// НЕ использовать mouse:up для завершения — это сломает UX (drag would immediately complete)

// Shift-snap on second click:
if (e.e.shiftKey) {
  const dx = Math.abs(endX - startX);
  const dy = Math.abs(endY - startY);
  if (dx > dy) { endY = startY; }  // snap to horizontal
  else { endX = startX; }           // snap to vertical
}
```

Door tool logic: same as wall but `stroke: '#4CAF50'`, `strokeWidth: 3`, fixed width

Room/staircase/elevator/corridor tool logic:
```typescript
// mouse:down → record startX, startY
// mouse:move → update selection rect (dashed orange)
// mouse:up → call onRoomPopupRequest(normalizedRect, onConfirm, onCancel)
// onConfirm(name) → add fabric.Group([Rect, Text]) to canvas; push to rooms[]
// onCancel → remove selection rect
```

Fill colors by type:
- `room`: `rgba(255, 87, 34, 0.15)` + `#FF5722` stroke
- `staircase` / `elevator`: `rgba(244, 67, 54, 0.15)` + `#F44336` stroke
- `corridor`: `rgba(33, 150, 243, 0.15)` + `#2196F3` stroke

Delete key handler:
```typescript
document.addEventListener('keydown', (e) => {
  if (e.key === 'Delete' || e.key === 'Backspace') {
    const active = canvas.getActiveObject();
    if (active) {
      canvas.remove(active);
      // also remove from rooms[] / doors[] by matching id stored in active.data
    }
  }
});
```

Coordinate normalization for annotations:
- All stored coords normalized to [0,1] using `canvas.width` / `canvas.height`

`getBlob()`:
```typescript
// IMPORTANT: export ONLY the mask (walls + eraser), WITHOUT annotation objects.
// All annotation objects (rooms, doors) must have data.type = 'annotation' set on creation.
// Before export:
// 1. Hide all annotation objects: canvas.getObjects().filter(o => o.data?.type === 'annotation').forEach(o => o.visible = false)
// 2. canvas.renderAll()
// 3. const dataUrl = canvas.toDataURL({ format: 'png' })
// 4. Restore visibility: ...forEach(o => o.visible = true); canvas.renderAll()
// 5. Return blob from dataUrl
return new Promise((resolve) => {
  const annotations = canvas.getObjects().filter(o => (o as fabric.Object & { data?: { type: string } }).data?.type === 'annotation');
  annotations.forEach(o => { o.visible = false; });
  canvas.renderAll();
  const dataUrl = canvas.toDataURL({ format: 'png' });
  annotations.forEach(o => { o.visible = true; });
  canvas.renderAll();
  fetch(dataUrl).then(r => r.blob()).then(resolve);
});
```

`getAnnotations()`:
```typescript
return { rooms: roomsRef.current, doors: doorsRef.current };
```

### `frontend/src/components/Editor/WallEditorCanvas.module.css`

**Purpose:** Container fills parent; canvas element fills container.

```css
.container { width: 100%; height: 100%; position: relative; }
.canvas { display: block; }
```

## Verification
- [ ] `npx tsc --noEmit` passes
- [ ] Canvas fills its container on mount
- [ ] Mask image loads as background
- [ ] Wall tool: two clicks produce white line
- [ ] Shift+click snaps to axis
- [ ] Eraser: free draw removes white pixels
- [ ] Room tool: drag → popup callback fires
- [ ] Delete key removes selected object
- [ ] `getBlob()` returns a PNG Blob
- [ ] `getAnnotations()` returns normalized coords
