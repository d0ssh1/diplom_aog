# Design Decisions: Massive Stitching / Transition Points

## Decisions

| # | Decision | Choice | Alternatives | Rationale |
|---|----------|--------|--------------|-----------|
| 1 | Multi-plan routing model | Transition groups + transition points | Stitch plans into one image; implicit graph links | Research shows stitching already exists but solves a different problem, and the current routing stack is single-plan only (`docs/research/@tickets/new_tickets/13-massive-stitching-omg.md.md:45-74`). |
| 2 | Backend API shape | Add dedicated transition CRUD endpoints and a dedicated multi-plan route endpoint | Overload the stitching API or keep route logic in stubs | Current navigation API is a stub (`backend/app/api/navigation.py:12-76`), so a dedicated route boundary keeps the existing single-plan flow intact. |
| 3 | Graph composition | Build a super-graph from per-plan nav graphs and transition edges | Merge plans into a single stitched reconstruction before routing | Per-plan nav graphs already exist as separate JSON files beside masks (`backend/app/services/nav_service.py:105-108`), so super-graph composition matches storage reality. |
| 4 | Coordinate system | Store transition points normalized in `[0,1]` and denormalize during graph assembly | Store points directly in pixels | Existing vectorization and frontend patterns rely on normalized coordinates, and the research notes that nav graphs are file-based and plan-local. |
| 5 | Frontend organization | Dedicated transitions page with hook-driven state and a route visualization component | Add the editor to the existing stitching page | The current stitching page is already a distinct workflow and should remain separate from inter-plan routing. |
| 6 | Existing stitching feature | Leave stitching in place for now and design transition points as a new path | Delete stitching in this same change | The current task is about routing across independent plans; removing stitching is a separate architectural change and would be too broad for one feature. |

## Risks

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Super-graph construction becomes slow on large buildings | Medium | Load only participating reconstructions and use existing NetworkX A* patterns from `backend/app/processing/nav_graph.py:422-519`. |
| Transition points may be placed where no nav node is reachable | High | Reject point creation with a clear 400 error and explanation; do not persist invalid points. |
| Multi-plan route UI may conflict with current single-plan route UI | Medium | Keep route visualization additive and preserve existing single-plan route code paths. |
| Transition CRUD may introduce new dependencies across backend modules | Medium | Keep routers thin, services responsible for orchestration, repositories for persistence. |

## Open Questions

- [x] Should transition points replace stitching immediately? No. Stitching remains as a separate capability; this feature adds routing links between plans.
- [x] Should the multi-plan route endpoint return a single flattened path? No. It should return segments so the frontend can show plan boundaries.
- [ ] Should transition groups be scoped only to a building, or can they be shared across buildings? The research allows nullable building linkage for future inter-building support, but the exact product scope for v1 is still open.
- [ ] Should the frontend transition editor be available from an admin route or embedded in the reconstruction workflow? The research points to a dedicated admin route, but the final navigation entry is not yet fixed.
