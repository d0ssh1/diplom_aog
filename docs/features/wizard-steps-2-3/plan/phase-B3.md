# Phase B3: StepWallEditor + WizardPage Wiring (Step 3) + Cleanup

phase: B3
layer: components/Wizard + pages
depends_on: A1, A3, B1, B2
design: ../README.md

## Goal

Build the Step 3 screen (Wall Editor), wire it into WizardPage, update step 3→4
transition logic, and delete the old StepEditMask and ToolPanel components.

## Context

- Phase A1: `WizardState` has `rooms`, `doors`, `editedMaskFileId`; `useWizard` has `saveMaskAndAnnotations`
- Phase A3: `ToolPanelV2` ready
- Phase B1: `WallEditorCanvas` ready with `WallEditorCanvasRef` (getBlob, getAnnotations)
- Phase B2: `RoomPopup` ready

## Files to Create

### `frontend/src/components/Wizard/StepWallEditor.tsx`

**Purpose:** Step 3 layout — Fabric.js canvas on left, tool panel on right.

**Props:**
```typescript
interface StepWallEditorProps {
  maskUrl: string;
  onExport: (blob: Blob, rooms: RoomAnnotation[], doors: DoorAnnotation[]) => void;
}
```

**Implementation details:**
- Layout: same flex structure as StepPreprocess (left ~75%, right panel)
- Left area: `bg-zinc-200; padding: 32px; position: relative`
  - Grid background div
  - `<WallEditorCanvas ref={canvasRef} maskUrl={maskUrl} activeTool={activeTool} brushSize={brushSize} onRoomPopupRequest={handleRoomPopupRequest} />`
  - `{popupState && <RoomPopup position={popupState.position} roomType={popupState.roomType} onConfirm={handlePopupConfirm} onCancel={handlePopupCancel} />}`
- Right area: `<ToolPanelV2>` with sections:
  ```typescript
  sections={[
    {
      title: '// РЕДАКТОР СТЕН',
      tools: [
        { id: 'wall', label: 'Нарисовать стену', icon: <Pencil size={20} /> },
        { id: 'eraser', label: 'Стереть', icon: <Eraser size={20} /> },
      ]
    },
    {
      title: '// РАЗМЕТКА',
      tools: [
        { id: 'room', label: 'Кабинет', icon: <Square size={20} /> },
        { id: 'staircase', label: 'Лестница', icon: <ArrowUpDown size={20} /> },
        { id: 'elevator', label: 'Лифт', icon: <ArrowUp size={20} /> },
        { id: 'corridor', label: 'Коридор', icon: <StretchHorizontal size={20} /> },
        { id: 'door', label: 'Дверь', icon: <DoorOpen size={20} /> },
      ]
    }
  ]}
  brushSize={brushSize}
  onBrushSizeChange={setBrushSize}
  ```
- Local state: `activeTool`, `brushSize`, `popupState`
- `popupState` shape: `{ position: {x,y}; roomType: ...; onConfirm: ...; onCancel: ... } | null`
- `handleRoomPopupRequest`: sets `popupState`
- `handlePopupConfirm(name)`: calls `popupState.onConfirm(name)`, clears `popupState`
- `handlePopupCancel`: calls `popupState.onCancel()`, clears `popupState`
- Note: `onExport` is called by WizardPage (not by StepWallEditor itself) — WizardPage calls `canvasRef.current.getBlob()` and `canvasRef.current.getAnnotations()` directly

**Ref forwarding:** WizardPage needs access to `canvasRef`. Two options:
- Pass `canvasRef` as a prop (simpler)
- Use `forwardRef` on StepWallEditor

Use prop approach: `canvasRef: React.RefObject<WallEditorCanvasRef>` as a prop.

### `frontend/src/components/Wizard/StepWallEditor.module.css`

**Purpose:** Layout styles, mirrors StepPreprocess.module.css.

## Files to Modify

### `frontend/src/pages/WizardPage.tsx`

**What changes:**
1. Import `StepWallEditor`, `WallEditorCanvasRef`
2. Add `canvasRef = useRef<WallEditorCanvasRef>(null)`
3. Add `case 3:` rendering `<StepWallEditor maskUrl={...} canvasRef={canvasRef} />`
   - `maskUrl`: `/api/v1/uploads/${state.maskFileId}` (same pattern as existing `WizardPage.tsx:57`)
4. Update `handleNext` for step 3:
   ```typescript
   if (state.step === 3 && canvasRef.current) {
     const blob = await canvasRef.current.getBlob();
     const { rooms, doors } = canvasRef.current.getAnnotations();
     await wizard.saveMaskAndAnnotations(blob, rooms, doors);
     wizard.nextStep();
   }
   ```
5. Update `handlePrev` for step 3: show a confirmation before going back, since all drawn walls and annotations will be lost:
   ```typescript
   if (state.step === 3) {
     if (!window.confirm('Вернуться на шаг 2? Все нарисованные стены и разметка будут потеряны.')) return;
     wizard.prevStep();
     return;
   }
   ```
6. Update `isNextDisabled`: step 3 disabled when `state.isLoading`
7. Remove `StepEditMask` import

### `frontend/src/hooks/useWizard.ts`

**What changes:**
- Add `saveMaskAndAnnotations(blob, rooms, doors)` method:
  ```typescript
  const saveMaskAndAnnotations = useCallback(async (
    blob: Blob,
    rooms: RoomAnnotation[],
    doors: DoorAnnotation[]
  ) => {
    setState(s => ({ ...s, isLoading: true, error: null }));
    try {
      const file = new File([blob], 'mask.png', { type: 'image/png' });
      const data = await uploadApi.uploadUserMask(file);
      setState(s => ({
        ...s,
        editedMaskFileId: String(data.id ?? data.file_id ?? ''),
        rooms,
        doors,
        isLoading: false,
      }));
    } catch {
      setState(s => ({ ...s, isLoading: false, error: 'Ошибка сохранения маски' }));
    }
  }, []);
  ```
- Remove old `saveMask` method (replaced by `saveMaskAndAnnotations`)
- Update `UseWizardReturn` interface

## Files to Delete

After WizardPage no longer imports them:
- `frontend/src/components/Wizard/StepEditMask.tsx`
- `frontend/src/components/Wizard/StepEditMask.module.css`
- `frontend/src/components/Editor/ToolPanel.tsx`
- `frontend/src/components/Editor/ToolPanel.module.css`

## Verification
- [ ] `npx tsc --noEmit` passes with 0 errors
- [ ] Step 3 renders mask in Fabric.js canvas
- [ ] All tools work (wall, eraser, room, staircase, elevator, corridor, door)
- [ ] Room popup appears on rect draw, label appears on canvas
- [ ] "Далее" on step 3 exports canvas and advances to step 4
- [ ] Old StepEditMask and ToolPanel files deleted
- [ ] Full visual checklist from 04-testing.md passes
