# Design Decisions: 3D Color API

## Decisions

| # | Decision | Choice | Alternatives | Rationale |
|---|----------|--------|--------------|-----------|
| 1 | Color parameter format | Hex string OR RGBA array | Only hex, only RGBA, RGB (no alpha) | Hex is user-friendly, RGBA is programmatic. Both cover all use cases. RGB omits alpha which is useful for transparency. |
| 2 | Color validation layer | Service layer (business logic) | Router layer, processing layer | Service layer owns business rules. Router is thin. Processing is pure (no validation). |
| 3 | Default color behavior | Use `WALL_SIDE_COLOR` if omitted | Require color parameter, use frontend-provided default | Optional parameter is more user-friendly. Backend has single source of truth for defaults. |
| 4 | Color storage | Transient (not persisted) | Store in DB, store in GLB metadata | Color is generation-time parameter, not reconstruction property. Simplifies schema. GLB already stores vertex colors. |
| 5 | Scope of color | Wall vertices only | Walls + floors + rooms, configurable per element | MVP: walls only. Simpler, matches current architecture. Future: extend to floors/rooms. |
| 6 | Color application | All walls same color | Per-wall colors, room-based colors | MVP: uniform. Simpler. Future: room-based coloring via `assign_room_colors()` function (already exists in codebase). |

## Risks

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Invalid color crashes mesh generation | High | Validate in service layer before passing to mesh generator. Unit tests for all invalid formats. |
| User provides color that's hard to see (e.g., white on white) | Medium | Document in API docs. Frontend can provide color picker with preview. No backend validation needed. |
| GLB export doesn't preserve colors | High | Already verified: GLB preserves vertex colors, OBJ doesn't. Current code uses GLB by default. No change needed. |
| Performance impact of color parsing | Low | Parsing is O(1), negligible. Mesh generation dominates. No optimization needed. |
| Breaking change for existing clients | Low | Parameter is optional. Existing requests without `wall_color` work unchanged. Backward compatible. |

## Open Questions

- [ ] Should we support room-based coloring in this MVP? → **No, defer to future feature.** Current scope: uniform wall color only.
- [ ] Should color be stored in reconstruction metadata for later retrieval? → **No, transient only.** Color is generation-time parameter, not a property of the reconstruction.
- [ ] Should we add color presets (e.g., "dark", "light", "high-contrast")? → **No, defer to future.** MVP: raw hex/RGBA only.
- [x] Is GLB export guaranteed to preserve vertex colors? → **Yes, verified in codebase.** `mesh_builder.py` exports GLB with `include_normals=True, file_type='glb'`.
