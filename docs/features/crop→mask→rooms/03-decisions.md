# Design Decisions: crop→mask→rooms

## Decisions

| # | Decision | Choice | Alternatives | Rationale |
|---|----------|--------|--------------|-----------|
| 1 | Shared geometry basis | Use one crop/rotation basis for plan, mask, rooms, and doors | Separate plan and mask transforms | The research showed the plan preview and mask background are currently transformed separately in `WallEditorCanvas:78-117` and `243-268`, which causes drift.
| 2 | Annotation normalization source | Normalize room/door coordinates against the same shared basis as the mask preview | Normalize against canvas pixels or plan pixels independently | `WallEditorCanvas:467-493` and `623-678` currently normalize against background bounds; that is only safe if the background uses the same crop/rotation chain as the plan.
| 3 | Edit flow source of truth | Keep cropRect and rotation in wizard/reconstruction state and pass them to every rendering path | Recompute crop/rotation independently in each component | `WizardPage:65-105`, `EditPlanPage:72-81`, and `StepWallEditor:93-110` already pass this metadata through the flow.
| 4 | Mask refresh timing | Regenerate mask preview whenever crop or rotation changes | Manual refresh only | `StepWallEditor:93-110` already refreshes on crop/rotation change; this keeps the editor consistent with the selected geometry.
| 5 | Rooms save shape | Preserve room rectangles as normalized rectangles in the editor payload, while keeping backend vector data as the canonical source | Save only canvas pixels or only polygons | The current save flow converts room annotations to polygons in `EditPlanPage:123-152`, but restored rooms are derived from polygons into rectangles in `EditPlanPage:46-61`.

## Risks

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Plan and mask still diverge if one path applies crop/rotation differently | High | Make all render paths consume the same crop/rotation metadata and verify against a shared basis in tests.
| Restored rooms lose polygon fidelity when converted to rectangles | Medium | Keep the canonical vector payload in the backend and treat the editor rectangles as a UI representation.
| Door positions are point-like and may remain visually offset if the basis is inconsistent | High | Treat door coordinates as normalized positions in the same shared coordinate system as rooms.
| Nav graph generation may consume inconsistent room/door coordinates | High | Pass the same normalized room/door arrays used by the editor into `buildNavGraph`.

## Open Questions

- [ ] Should the mask editor itself render the cropped/rotated plan as a visual reference, or should the plan be pre-transformed before the mask is loaded?
- [ ] Should room annotations remain rectangles in the editor payload or be stored as polygons end-to-end?
- [ ] Should the backend store explicit crop/rotation metadata alongside vectorization data for editor rehydration?
- [ ] Is the mask file used by navigation graph generation always the same file shown in the wall editor, or can edited masks diverge?
