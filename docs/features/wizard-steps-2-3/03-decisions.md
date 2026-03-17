# Design Decisions: Wizard Steps 2-3

## Decisions

| # | Decision | Choice | Alternatives | Rationale |
|---|----------|--------|--------------|-----------|
| 1 | Crop overlay implementation | Pure div/CSS (no Fabric.js) | Fabric.js, react-cropper | Ticket explicitly says "НЕ Fabric.js для кадрирования — слишком тяжело для простой рамки". Div-based with pointer events is sufficient for 4-corner drag + move. |
| 2 | Wall editor canvas | Fabric.js | Plain HTML Canvas, Konva | Ticket specifies Fabric.js with `fabric.Line`, `fabric.Rect`, `fabric.Group`. Already used in existing `MaskEditor.tsx:1`. |
| 3 | Fabric.js version | Keep existing (from MaskEditor) | Upgrade | `MaskEditor.tsx` already uses Fabric.js. Reuse same version to avoid conflicts. |
| 4 | ToolPanelV2 vs ToolPanel | New component ToolPanelV2 | Extend existing ToolPanel | Ticket specifies different button style (horizontal, dark bg `#1a1a1a`, `border-radius: 8px`). Different enough to warrant a new component. Old ToolPanel deleted. |
| 5 | Room annotations storage | In-memory array in WallEditorCanvas, exposed via ref | Redux/context | Annotations are local to the wizard session. No persistence needed until step 4 transition. Ref pattern keeps canvas state encapsulated. |
| 6 | Normalized coordinates for annotations | [0,1] range | Pixel coordinates | Consistent with existing `CropRect` type in `types/wizard.ts:1`. Backend expects normalized coords. |
| 7 | Step count change | 5 → 6 steps | Keep 5 steps | Ticket requires splitting StepEditMask into two steps. `WizardStep` type in `types/wizard.ts` must be updated to `1|2|3|4|5|6`. `useWizard.ts` nextStep/prevStep clamp must change from 5 to 6. |
| 8 | calculateMask trigger | On "Далее" click from step 2 | On step 2 mount, on crop change | Ticket: "Backend API: calculateMask вызывается при переходе с шага 2 на шаг 3". Avoids unnecessary API calls while user is still adjusting crop. |
| 9 | Eraser implementation | `canvas.isDrawingMode = true` + black brush | EraserBrush plugin | Ticket specifies this exact approach. Black paint on white mask = erasing walls. Simple and reliable. |
| 10 | Auto-rotate detection | `img.naturalHeight > img.naturalWidth` on load | EXIF orientation | Ticket specifies this exact condition. EXIF would require extra library. |

## Risks

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Fabric.js canvas sizing on mount | High — canvas may not fill container | Initialize canvas in `useEffect` after container ref is set; use `ResizeObserver` to update canvas dimensions |
| CropOverlay coordinate normalization | Medium — off-by-one if image has object-fit padding | Calculate normalization against `img.naturalWidth/Height` not container size; use `getBoundingClientRect` carefully |
| Fabric.js `getBlob()` async timing | Medium — WizardPage calls ref before canvas renders | `getBlob()` returns `Promise<Blob>` via `canvas.toDataURL` → `fetch(dataUrl).then(r=>r.blob())` |
| Step number collision | High — existing step 3 (StepBuild) becomes step 4 | All step switch cases in `WizardPage.tsx:43` must be renumbered; `isNextDisabled` condition at line 38 must update |
| ToolPanelV2 border-radius | Low — conflicts with brutalism zero-radius rule | Ticket CSS shows `border-radius: 8px` for tool buttons. This is an intentional exception for the dark panel. Keep as-is per ticket spec. |

## Open Questions

- [x] Does `saveRooms` API (`reconstructionApi.saveRooms` in `apiService.ts:162`) need to be called at step 3→4 transition? — No, ticket says pass rooms to step 4 for 3D build. `saveRooms` is called later.
- [x] Should `StepEditMask` be deleted immediately or kept as fallback? — Ticket says delete it. It's replaced entirely.
- [ ] Does `WallEditorCanvas` need undo/redo? — Ticket explicitly says "Undo/redo (можно добавить позже)". Not in scope.
