# Code Plan: Floor Stitching

date: 2026-05-29
design: ../README.md
status: implemented (2026-05-30) — all 15 phases committed on feat/floor-stitching

> Implementation plan for the floor-stitching feature (horizontal assembly of
> sections into one floor via control points + uniform scale/shift + connectors +
> combined GLB). Read the design first: [../README.md](../README.md),
> [../01-architecture.md](../01-architecture.md),
> [../06-pipeline-spec.md](../06-pipeline-spec.md),
> [../05-api-contract.md](../05-api-contract.md).

## Phase Strategy

**Bottom-up, backend-first, then frontend, then end-to-end self-verification.**

Why:
- The pure `processing/` layer (solver + assembly) has no dependencies and is the
  riskiest maths — build and test it in isolation first (CLAUDE.md: every
  `processing/` fn needs tests).
- Services/routers consume the pure layer + repos, so they come after.
- Frontend consumes the finished API contract.
- A synthetic end-to-end fixture (`scripts/seed_demo_floor.py`) lets us drive
  solve→build→confirm without operator data and verify a non-empty GLB — this is
  the self-test the user asked for.

Each phase is independently implement → review → gate → commit (per `/implement`).

## Phases

| # | Phase | Layer | Depends on | Status |
|---|-------|-------|------------|--------|
| 01 | DB schema + migration | `db/models`, alembic | — | ☐ |
| 02 | Pydantic contracts + constants + exceptions | `models/`, `core/` | — | ☐ |
| 03 | `processing.registration` (solver) + tests | `processing/` | 02 | ☐ |
| 04 | `processing.floor_assembly` (warp/composite) + tests | `processing/` | 02, 03 | ☐ |
| 05 | Repositories (extend + new connector repo) | `db/repositories` | 01 | ☐ |
| 06 | Section-local control points (UC1: service + router) | `services/`, `api/reconstruction.py` | 02, 05 | ☐ |
| 07 | `FloorAssemblyService` core (UC2 bind, UC3 solve, UC4 connectors) | `services/` | 03, 05 | ☐ |
| 08 | Build → confirm → assembly read (UC5 + GET assembly) | `services/`, `services/file_storage.py` | 04, 07 | ☐ |
| 09 | `api/floor_assembly.py` router + registration + DI | `api/`, `api/deps.py` | 06, 07, 08 | ☐ |
| 10 | Backend tests (service + API) | `tests/` | 06–09 | ☐ |
| 11 | Frontend types + api client | `frontend/src/types`, `frontend/src/api` | 09 | ☐ |
| 12 | Section-local CP UI (UC1: `ControlPointCanvas` + wizard step) | `frontend/src/components`, `hooks` | 11 | ☐ |
| 13 | Floor Editor assembly steps (UC2–UC5) | `frontend/src/components/FloorEditor`, `hooks` | 11, 12 | ☐ |
| 14 | Frontend tests | `frontend/src/__tests__` | 12, 13 | ☐ |
| 15 | End-to-end synthetic fixture + self-verification | `scripts/`, `backend/tests/` | 09 | ☐ |

---

## File Map

### Backend — new files

- `backend/app/processing/registration.py` — pure solver `solve_similarity` + `SimilarityResult` + `DegenerateControlPointsError` (06 §2–3).
- `backend/app/processing/floor_assembly.py` — pure `assemble_floor_mask` + dataclasses `SectionWarpInput`, `ConnectorRaster` (06 §5).
- `backend/app/models/floor_assembly.py` — all Pydantic request/response models (05).
- `backend/app/services/floor_assembly_service.py` — `FloorAssemblyService` (match→solve→ppm→composite→GLB, preview/confirm).
- `backend/app/db/repositories/floor_connector_repo.py` — `FloorConnectorRepository` (atomic replace-all).
- `backend/app/db/models/floor_connector.py` — `FloorConnector` ORM (new table).
- `backend/app/api/floor_assembly.py` — new thin router (UC2–UC5 + assembly read).
- `backend/alembic/versions/{rev}_floor_stitching.py` — migration (columns + table).
- `backend/tests/processing/test_registration.py` — solver unit tests (04-testing §Unit registration).
- `backend/tests/processing/test_floor_assembly.py` — assembly unit tests (04-testing §Unit floor_assembly).
- `backend/tests/services/test_floor_assembly_service.py` — service tests.
- `backend/tests/api/test_floor_assembly_api.py` — API contract tests.
- `scripts/seed_demo_floor.py` — synthetic end-to-end fixture + smoke test.

### Backend — modified files

- `backend/app/db/models/reconstruction.py` — add `Reconstruction.control_points` (JSON).
- `backend/app/db/models/section.py` — add `Section.control_points` (JSON) + `Section.transform` (JSON); add `connectors` relationship target via Floor.
- `backend/app/db/models/building.py` — add `Floor.pixels_per_meter` (Float) + `Floor.mesh_file_glb` (String); add `connectors` relationship to `FloorConnector`.
- `backend/app/db/repositories/reconstruction_repo.py` — `update_control_points` / read via existing `get_by_id`.
- `backend/app/db/repositories/section_repo.py` — `update_master_control_points`, `update_transform`, `list_by_floor` already eager-loads reconstruction (reuse).
- `backend/app/db/repositories/floor_repo.py` — `update_pixels_per_meter`, `update_mesh_glb`, ensure `get_by_id` available.
- `backend/app/services/reconstruction_service.py` — `save_control_points`, `get_control_points` (UC1).
- `backend/app/services/file_storage.py` — `save_floor_preview_mesh`, `floor_preview_path(floor_id, glb_file_id)`, `promote_floor_preview` (preview→confirm; stateless, disk-based; atomic `*.tmp`+`os.replace`; `re.fullmatch`+`\Z` id guard with floor_id match).
- `backend/app/api/reconstruction.py` — add GET/PUT `…/control-points`.
- `backend/app/api/deps.py` — `get_floor_connector_repo`, `get_floor_assembly_service`.
- `backend/app/api/__init__.py` — register `floor_assembly_router`.
- `backend/app/core/exceptions.py` — `DegenerateControlPointsError` (or in processing), `SectionNotBoundError`, `PreviewNotFoundError`, etc. (reuse existing where present).

### Frontend — new files

- `frontend/src/types/floorAssembly.ts` — all TS interfaces (no `any`).
- `frontend/src/api/floorAssemblyApi.ts` — axios functions per endpoint.
- `frontend/src/components/ControlPointCanvas.tsx` (+ `.module.css`) — shared labelled-point canvas (snap/hit radius, id colours).
- `frontend/src/components/Wizard/StepControlPoints.tsx` (+ css) — section-local CP placement at upload.
- `frontend/src/components/FloorEditor/Step6BindControlPoints.tsx` (+ css) — master binding (active-id picker, dual highlight).
- `frontend/src/components/FloorEditor/Step7SolveTransforms.tsx` (+ css) — solve + residual chips + warped overlay.
- `frontend/src/components/FloorEditor/Step8Connectors.tsx` (+ css) — draw/edit connecting lines.
- `frontend/src/components/FloorEditor/Step9FloorPreview.tsx` (+ css) — 3D preview + "Сохранить этаж" (confirm).
- `frontend/src/hooks/useFloorAssembly.ts` — orchestrates bind/solve/connectors/preview state.

### Frontend — modified files

- `frontend/src/types/wizard.ts` — widen `WizardStep` to `1..6`; add `controlPoints` + `nextControlPointId` to `WizardState`.
- `frontend/src/hooks/useWizard.ts` — control-point state (monotonic id, no reuse); renumber hardcoded step constants; deferred CP persist after `buildMesh` (no `reconstructionId` exists until then).
- `frontend/src/pages/WizardPage.tsx` — insert `StepControlPoints` as new `case 3`; shift all step numbers + labels + gating + `totalSteps`.
- `frontend/src/hooks/useFloorEditorWizard.ts` — extend `WizardStep`/`TOTAL_STEPS`/clamp from 5 to 9.
- `frontend/src/pages/FloorEditorPage.tsx` — mount the 4 assembly steps after `Step5BindPlans`; wire sibling `useFloorAssembly`.
- `frontend/src/components/MeshViewer.tsx` — add `dispose()` for cloned geometry/material on unmount (currently leaks).

---

## Success Criteria

- [x] All 15 phases implemented, reviewed, gated, committed.
- [x] Backend: `pytest` green (488 passed; 4 unrelated pre-existing failures); all floor-stitching files `flake8`-clean; new `processing/` fns each have tests.
- [x] Frontend: `tsc --noEmit` clean (no `any`); `vitest` green (13 new; 1 unrelated pre-existing failure in `useRouteTest.helpers`).
- [x] AC1–AC8 from [../README.md](../README.md) covered (service/API/processing tests).
- [x] Non-displacement guarantees pass: `test_vectorization_data_never_written_during_assembly`, `test_uniform_warp_preserves_cabinet_aspect_ratio`, `test_solve_pixel_space_not_normalized_no_aspect_skew`.
- [x] `scripts/seed_demo_floor.py` + `tests/integration/test_floor_stitching_e2e.py` run end-to-end and produce a non-empty floor GLB (160 vertices / 320 faces) loadable in the 3D viewer.

## Cross-cutting rules (apply in every phase)

- `processing/` is PURE — no DB/HTTP/IO; dataclasses only, no Pydantic/ORM.
- Routers thin: validate → service → return; every body has a Pydantic model.
- Never write `reconstruction.vectorization_data` anywhere in this feature.
- Never mutate an input `np.ndarray` — `.copy()`/fresh arrays.
- All new coordinates normalised `[0,1]` except `*_px` fields.
- TS `any` forbidden — `unknown` + type guard.
- Three.js objects `dispose()` on unmount.
- `logging`, not `print()`.
- No `Co-authored-by: Claude` in commits. Commit only when the human says so.

## Known pre-existing security gaps (NOT introduced by this feature)

A round-2 security review found two codebase-wide issues the existing routers all
share. They are **pre-existing** and span far more than this feature; flagged here so
the implementer does NOT copy them blindly or claim the new endpoints are "secured":

- **Decorative auth.** `api/floors.py` (and siblings) inject
  `credentials: HTTPAuthorizationCredentials = Depends(security)` but never decode the
  token; `deps.py get_current_user` is a TODO stub returning a fake `id:1`. Any bearer
  string passes.
- **No ownership scoping (IDOR).** No model has a usable owner edge; every endpoint
  acts on a raw integer id with no "does this floor belong to the caller" check.

**Decision (resolved — ADR-19 in `../03-decisions.md`): SCOPE-OUT.** Single-operator
diploma system; a proper auth+ownership pass is a separate, codebase-wide ticket. The
new endpoints mirror the existing routers' auth as-is. **Constraint:** this feature
must NOT *expand* the gap — add no new unauthenticated surface beyond what mirroring
`floors.py` already implies, and do not claim the endpoints are secured.
