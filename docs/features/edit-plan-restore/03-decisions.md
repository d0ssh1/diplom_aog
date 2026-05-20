# Design Decisions: edit-plan-restore

## Decisions

| # | Decision | Choice | Alternatives | Rationale |
|---|----------|--------|--------------|-----------|
| 1 | Restore geometry fidelity | Preserve polygon data in the edit-plan data flow instead of reconstructing rooms only as bounding boxes | Keep flattening to x/y/width/height | Current bug comes from shape loss during restore/save; polygon data already exists in stored vector JSON at `frontend/src/pages/EditPlanPage.tsx:45-61` and backend deserialization preserves it at `backend/app/services/reconstruction_service.py:219-225`. |
| 2 | Canvas representation | Keep the current Fabric rectangle rendering for room annotations only if the UI is meant to show bounding-box annotations; otherwise extend the editor data model to support polygon rooms | Leave UI unchanged and accept loss of exact geometry | The current canvas implementation renders `fabric.Rect` groups at `frontend/src/components/Editor/WallEditorCanvas.tsx:171-205`. If exact geometry is required, the editor model must stop treating all rooms as rectangles. |
| 3 | Save semantics | Save exactly what the editor actually contains, and do not synthesize a new geometry shape on each save | Regenerate polygon from bounding box every time | `saveVectors()` currently rewrites rooms into 4-point rectangles at `frontend/src/pages/EditPlanPage.tsx:123-150`, which permanently overwrites richer room geometry. |
| 4 | Scope | Limit the fix to edit-plan restore/save and its API contract for vector data | Change stitching or 3D build pipeline | The bug is observed in edit-plan reopening; stitching already consumes `rooms.polygon` and normalizes it in `backend/app/services/stitching_service.py:147-236`. |

## Risks

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Canvas and stored schema remain inconsistent | High | Define one canonical room shape for edit-plan and use it consistently at restore and save boundaries. |
| Some legacy records only contain bounding boxes | Medium | Treat missing polygon data as a supported legacy fallback and keep the editor stable. |
| Room types are visually encoded as orange rectangles | Medium | Keep the current color semantics if rectangles are intentional, but do not confuse styling with geometry loss. |

## Open Questions

- [ ] Is the expected edit-plan behavior to preserve exact polygons, or is bounding-box display acceptable for rooms after loading?
- [ ] Are the affected objects all `room` annotations, or is there a separate cabinet/room entity outside the current schema?
- [ ] Should the API reject invalid polygon payloads, or tolerate mixed legacy rectangle and polygon records?
