# Phase B2: RoomPopup Component

phase: B2
layer: components/Editor
depends_on: none
design: ../README.md

## Goal

Build a small inline popup that appears over the canvas when the user finishes drawing
a room rectangle. Asks for a room number (for 'room' type) or just confirms (for other types).

## Files to Create

### `frontend/src/components/Editor/RoomPopup.tsx`

**Purpose:** Floating input popup positioned near the drawn rect.

**Props:**
```typescript
interface RoomPopupProps {
  position: { x: number; y: number };  // pixel position in canvas container
  roomType: 'room' | 'staircase' | 'elevator' | 'corridor';
  onConfirm: (name: string) => void;
  onCancel: () => void;
}
```

**Implementation details:**
- Rendered as `position: absolute` div at `{ left: position.x, top: position.y }`
- For `room` type: show text input "Номер кабинета" + Enter/Confirm button
- For other types: show just a Confirm button (no input needed, name = type label)
- Escape key → `onCancel()`
- Enter key in input → `onConfirm(inputValue)`
- Auto-focus input on mount (`useEffect` + `inputRef.current?.focus()`)
- Click outside → `onCancel()` (mousedown on document, check if target is outside popup ref)
- Style: dark bg `#1a1a1a`, border `1px solid #FF5722`, padding `12px`, font-mono

### `frontend/src/components/Editor/RoomPopup.module.css`

**Purpose:** Popup styles.

## Verification
- [ ] `npx tsc --noEmit` passes
- [ ] Input auto-focuses on mount
- [ ] Enter confirms, Escape cancels
- [ ] Renders at correct position over canvas
