# Research: floor-stitching (horizontal section→floor assembly via control points)
date: 2026-05-29

> Scope: the **horizontal** assembly described by the user — placing several
> independently-reconstructed floor SECTIONS (отсеки) into one unified floor
> coordinate space using **control points (опорные точки)** with stable IDs,
> auto-computing a per-section scale+shift transform, drawing inter-section
> **connecting polygons**, and raising a combined 3D floor mesh.
> This is the first half of backlog feature #6 `building-assembly`
> ("склейка секций в этаж"). Vertical floor→building assembly is out of scope here.

---

## Summary

The data backbone already exists. A `Building → Floor → Section` hierarchy is in
place (`backend/app/db/models/building.py`, `backend/app/db/models/section.py`).
A **master schema of the whole floor** is stored on the `Floor` row
(`Floor.schema_image_id` + `schema_crop_bbox` + `wall_polygons`, all normalised
[0,1]). The FloorEditor wizard already lets the operator upload/crop the master
schema (steps 1–3), draw a polygon per section on it (`Step4MarkSections`,
normalised [0,1]) and bind each polygon to an existing section reconstruction
(`Step5BindPlans`). Sections are persisted atomically through
`PUT /floors/{floor_id}/sections`. Each section reconstruction independently
stores its rooms/doors/walls as normalised [0,1] geometry inside the
`reconstructions.vectorization_data` JSON column, and the 3D wall mesh is built
mask-driven by `build_mesh_from_mask(mask, floor_height, pixels_per_meter, vr)`.

What is **completely missing** is the geometric registration layer the user
described. No control-point concept exists anywhere. `Section` stores only its
polygon on the schema and a `reconstruction_id`; it has **no transform, no scale,
no offset, no rotation, no anchor points** (confirmed `section.py:32-65`). There
is no per-section control-point storage on the reconstruction either. There is no
solver that turns point correspondences into a transform, no "connecting polygon"
tool/storage for inter-section corridors, and no 3D floor-assembly step that
places multiple section meshes into one scene.

There is prior art that is **adjacent but not reusable as-is**. An OLD `stitching`
system (`backend/app/services/stitching_service.py`, route `POST /stitching/`)
already merges plans with an affine transform — but the transform is supplied
**manually** by the operator dragging fabric.js layers, not computed from control
points, and it fuses everything into one brand-new merged `reconstruction` row
(destroying the section identity the user wants to keep). Two other point-based
systems exist for **routing only** (not geometry): `TransitionPoint`/
`TransitionGroup` (mostly unwired) and `FloorTransition` (wired, vertical
teleports). Their normalised-point storage pattern is a good model to copy, but
their purpose (graph edges) is different from geometric registration.

---

## User's two target flows mapped to current code

### A) Per-section processing wizard (`frontend/src/pages/WizardPage.tsx`, 5 steps)
| User step | Status | Where |
|---|---|---|
| [1] Загрузка плана отсека | EXISTS | `StepUpload.tsx` (`WizardPage.tsx:84-97`) |
| [2] Кадрирование, поворот | EXISTS | `StepPreprocess.tsx` (`WizardPage.tsx:99-109`) |
| [3] Выделение стен | EXISTS | `StepWallEditor.tsx` (`WizardPage.tsx:110-126`) |
| [4] Расстановка кабинетов и дверей | EXISTS (markup tools inside StepWallEditor `MARKUP_TOOLS` L36-42) | `StepWallEditor.tsx` |
| **[5] Расстановка опорных точек** | **NEW** | — must add a wizard step + storage |
| [6] Генерация 3D-меша отсека | EXISTS (footer button on nav-graph step → `wizard.buildMesh`) | `WizardPage.tsx:52-53` |

### B) Floor assembly wizard (`frontend/src/hooks/useFloorEditorWizard.ts`, 5 steps)
| User step | Status | Where |
|---|---|---|
| [1] Загрузка/выбор мастер-схемы | EXISTS | `Step1Upload.tsx` → `Floor.schema_image_id` |
| [2] Разметка полигонов отсеков | EXISTS | `Step4MarkSections.tsx` → `Section.geometry` |
| **[3] Привязка опорных точек к мастер-схеме** | **NEW** | — |
| **[4] Авторасчёт преобразований** | **NEW** | — needs solver + transform storage |
| **[5] Рисование соединительных полигонов** | **NEW** | — needs tool + storage |
| [6] Превью 3D-этажа | PARTIAL (single-section 3D viewer exists; no multi-section floor scene) | `MeshViewer.tsx` |
| [7] Сохранение | EXISTS for sections; NEW for transforms/connectors | `PUT /floors/{id}/sections` |

> Note: current FloorEditor binds plans in `Step5BindPlans`; the user's flow B
> assumes sections are already bound and focuses on geometric registration.
> These two are compatible — binding stays, control-point steps are inserted after it.

---

## Architecture — Current State

### Backend Structure (relevant to floor-stitching)

**Hierarchy / sections / master schema**
- `backend/app/db/models/section.py:23` — `Section`: `id`, `floor_id`(FK CASCADE, L34), `number`(L39), `geometry`(JSON, 4-pt polygon normalised [0,1] on the master schema, L42), `reconstruction_id`(FK SET NULL, **unique**, L44-49), `section_type`(int 1=room/2=stairs/3=elevator, L52), timestamps. **No transform/scale/offset/rotation/control-point fields.**
- `backend/app/db/models/building.py:39` — `Floor`: `building_id`(L49), `number`(L52), `schema_image_id`(FK→uploaded_files, the master-schema image, L55), `schema_crop_bbox`(JSON {x,y,width,height,rotation}, L62), `wall_polygons`(JSON [[[x,y]…]] normalised [0,1], L65). Relationship `sections` cascade delete-orphan (L71).
- `backend/app/db/models/building.py:18` — `Building`: `id`, `name`, `code`(unique 5-char), `address`, `floors`.
- `backend/app/services/section_service.py` — section CRUD; atomic replace.
- `backend/app/services/floor_schema_service.py` — master-schema image + crop + wall extraction.
- `backend/app/api/sections.py:36` — `PUT /floors/{floor_id}/sections` → `replace_sections` (atomic replace of all sections, body `ReplaceSectionsRequest`, saves each `geometry` + `reconstruction_id`). `GET` list (L20), `DELETE /sections/{id}` (L63).
- `backend/app/api/floor_schema.py:27` — `PUT /floors/{floor_id}/schema` (set master image+crop); `POST .../extract-walls` (L58); `PUT .../walls` (L96).
- `backend/app/api/floors.py` — floor CRUD; `GET /floors/{id}` returns schema image/crop/wall_polygons (L73).
- `backend/app/api/buildings_hierarchy.py` — building CRUD; `GET ?published=true` public (L46).

**Per-section reconstruction + geometry storage**
- `backend/app/db/models/reconstruction.py:37` — `Reconstruction`: `plan_file_id`(L44), `mask_file_id`(L47), `mesh_file_id_obj/_glb`(L50-51), `floor_id`(FK SET NULL, L55), `status`(L61), `vectorization_data`(JSON, L65), `section`(1:1 rel). **No pixels_per_meter/scale/transform column** — those live inside `vectorization_data`.
- `backend/app/models/reconstruction_vectors.py:10` — `VectorPoint.x/y` constrained `ge=0, le=1` (normalised). `VectorRoom`(center+polygon+room_type, L15), `VectorDoor`(position+width+connects, L24). This is the authoritative room/cabinet & door store.
- `backend/app/services/reconstruction_service.py:288` — `update_vectorization_data` merges, overwriting only `rooms, doors, rotation_angle, crop_rect` and preserving walls/scale/image sizes (L301-311). **This is the existing "preserve cabinet/door coords" mechanism the user referenced.**
- `backend/app/api/reconstruction.py:412` — `PUT /reconstruction/reconstructions/{id}/vectors` (save edited rooms/doors).

**3D mesh build (reusable for raising section walls)**
- `backend/app/processing/mesh_builder.py:73` — `build_mesh_from_mask(mask: np.ndarray, floor_height: float = 3.0, pixels_per_meter: float = 50.0, vr: VectorizationResult | None = None) -> trimesh.Trimesh`. Walls only (no floor slab), pixel→meter `scale = 1/pixels_per_meter` with Y-flip, rotated to Three.js Y-up.
- `backend/app/processing/mesh_generator.py:185` — `build_floor_mesh(polygon, z_offset=0.0)` (exists, unused — could floor-slab the assembled floor).
- `backend/app/processing/pipeline.py:859` — `compute_scale_factor(wall_thickness_px) = wall_thickness_px / 0.2` (GOST 0.2 m wall → pixels_per_meter; default 50.0).

### Frontend Structure (relevant to floor-stitching)
- `frontend/src/hooks/useFloorEditorWizard.ts` — FloorEditor orchestration (`WizardStep=1..5`, L16; `saveAll` builds `ReplaceSectionsRequest` and calls `sectionsApi.replace(floorId, req)`, L308-348; **no transform computed/sent**).
- `frontend/src/components/FloorEditor/Step4MarkSections.tsx` — draw section polygon (`rect`/`polygon` tools L32); `toNorm` normalises to [0,1] over fit-contain image (L86-90); rect → 4 pts (L307); saved via `onAddSectionDraft` (L414).
- `frontend/src/components/FloorEditor/Step5BindPlans.tsx` — bind section→reconstruction via `PlanGalleryPicker` restricted to floor (L274); `onBind(idx, reconstructionId)` (useFloorEditorWizard.ts:296).
- `frontend/src/components/FloorEditor/FloorOverview.tsx` — renders sections over mask/schema (canvas).
- `frontend/src/pages/WizardPage.tsx` — per-section reconstruction wizard (5 steps).
- `frontend/src/components/Wizard/StepWallEditor.tsx` — wall + cabinet/door markup (`MARKUP_TOOLS` L36).
- `frontend/src/components/MeshViewer.tsx` — single-reconstruction GLB viewer (would host the floor preview).

### Database Models (summary)
- `Building (buildings)` → `Floor (floors)` → `Section (sections)` ; `Section.reconstruction_id` 1:1 → `Reconstruction (reconstructions)`.
- Migration head: `a2b3c4d5e6f7`. Sections table + `Floor` schema columns + `Reconstruction.floor_id` created in `f1g2h3i4j5k6_building_hierarchy.py`.

---

## Closest Analog Feature

**OLD stitching system** (`backend/app/services/stitching_service.py`, `POST /stitching/`).
- Files: `backend/app/models/stitching.py`, `backend/app/services/stitching_service.py`, `backend/app/api/stitching.py`, `backend/app/processing/stitching.py` (`build_affine_matrix`, `apply_affine_to_polygon`), frontend `StitchingPage.tsx`, `hooks/useStitching.ts`, `hooks/useStitchingCanvas.ts`, `types/stitching.ts`.
- Data flow: load N reconstructions → deserialize `vectorization_data` → per-source `rect_crop` → denormalize → **operator-supplied affine** (`_apply_affine_transform`, L659) → Shapely clip (`_apply_clip_polygon`, L737) → merge walls/rooms/doors (`_merge_models_pixel`, L261) → dedup → normalize to bbox → save a NEW merged reconstruction (status=3) reusing source[0]'s file ids.
- **Key difference from the requested feature:** transform is manual (drag), not solved from control-point correspondences; output collapses sections into one reconstruction (loses per-section identity the user wants to keep). Reuse the *geometry helpers* (affine/clip, Shapely merge) but **not** the manual-drag flow or the merge-into-one-recon model.

Secondary analogs for "normalised points placed on a plan":
- `FloorTransition` (`backend/app/db/models/floor_transition.py:14`) — stores `from_x/from_y`, `to_x/to_y` normalised, two-click placement UI. Good storage/UX pattern to mirror for control points.
- `TransitionPoint` (`backend/app/db/models/transition.py:47`) — normalised `position_x/y` + `group_id` + `reconstruction_id`. The **group-by-shared-ID** idea (same logical point across plans) directly parallels the user's "same control-point ID across section and master schema."

---

## Existing Patterns to Reuse
- Normalised [0,1] coordinate convention everywhere (rooms/doors `reconstruction_vectors.py:10`; section polygons `Step4MarkSections.tsx:86`; transitions). Control points should follow it.
- Atomic "replace all" persistence for child collections — `PUT /floors/{id}/sections` (`sections.py:36`) is the template for saving control points/connectors.
- Edit-preserving merge of `vectorization_data` (`reconstruction_service.py:301-311`) — the mechanism guaranteeing cabinet/door coords are never silently mutated.
- Mask-driven wall extrusion `build_mesh_from_mask` (`mesh_builder.py:73`) — reuse per section, then transform into floor space; `build_floor_mesh` (`mesh_generator.py:185`) for the assembled slab.
- Shapely geometry ops already used (`stitching_service.py` clip/merge) — available for connecting-polygon walls.
- Canvas point/polygon placement UX — `Step4MarkSections.tsx`, `FloorTransition` two-click flow, `Transitions/TransitionPlanCanvas.tsx`.
- Repository/service/DI layering already present (`api/deps.py`, `services/`, `db/repositories/`) — the codebase is further along than CLAUDE.md "Current Code State" suggests; new code should follow the existing `*_service.py` + `*_repo.py` pattern.

---

## Integration Points
- **Database:** add control-point storage (per-section local coords) + per-section transform + master-schema control-point coords + connecting polygons. Natural homes: `Reconstruction` (section-local control points) and `Section`/`Floor` (master-schema control points, transform, connectors). New Alembic migration on head `a2b3c4d5e6f7`.
- **File storage** (`backend/app/services/file_storage.py`): `upload_dir/plans/`, `masks/` (UUID-named), `models/reconstruction_{id}.{obj,glb}`; nav graphs at `masks/{mask_file_id}_nav.json`. An assembled floor mesh would need a new naming convention (e.g. `models/floor_{id}.glb`).
- **API:** extend `sections.py`/`floor_schema.py` (or new `floor_assembly` router) for control points, transform solve, connectors, and floor-mesh build. Existing `PUT /floors/{id}/sections` already carries section geometry.
- **Pipeline / 3D:** reuse `build_mesh_from_mask` per section + apply transform; assemble into one scene; optional floor slab via `build_floor_mesh`.
- **Nav graph:** the assembled floor enables a single-floor multi-section graph. Existing `merge_floor_graphs` (`nav_graph.py:733`) merges per-reconstruction graphs via `FloorTransition`; connecting corridors would need analogous edges. (Routing integration can be a later phase.)

---

## Gaps (what's missing for this feature)
1. **No control-point concept at all** — no storage for section-local control points (on `Reconstruction`) nor master-schema control points (on `Section`); no stable point-ID scheme.
2. **No transform on `Section`** — `section.py:32-65` has only `geometry` + `reconstruction_id`; nowhere to persist computed scale + shift (or similarity transform).
3. **No transform solver** — nothing converts point correspondences → scale/shift (least squares). Old stitching only *applies* a manual affine.
4. **No connecting-polygon (соединительный полигон) tool or storage** for inter-section corridors/passages, and no 3D wall raising for them.
5. **No multi-section 3D floor assembly** — `MeshViewer` shows one reconstruction; no scene that places N transformed section meshes (+ connectors) into one floor model; `build_floor_mesh` unused.
6. **No "place control points" wizard step** in either the per-section wizard (`WizardPage`) or the FloorEditor (`useFloorEditorWizard`).
7. **Floor lacks an absolute real-world scale** — section meshes are metric via per-section `pixels_per_meter`, but the floor/master-schema has no pixels_per_meter; relative scale must be derived (e.g. from control-point distance ratios) or a floor scale introduced.
8. **Overlap to resolve:** OLD `stitching` system (manual affine, merge-into-one-recon) conceptually competes with this feature — decide deprecate vs. coexist.

### Pre-existing bugs/debt found nearby (not caused by this feature)
- `GET /reconstruction/buildings/{building_id}/reconstructions` is **broken** — references removed columns `r.building_id`/`r.floor_number` (`reconstruction.py:210`).
- `POST /navigation/route/multi` calls `NavService.find_multi_plan_route`, which **does not exist** on `NavService` (`navigation.py:60-66`) — latent 500.
- `multi_plan_graph.build_super_graph` (`multi_plan_graph.py:76`) is implemented but **unwired**; only `nav_graph.merge_floor_graphs` is actually used → two parallel merge implementations.
- `StepBuild.tsx` exists but is **orphaned** (not mounted in `WizardPage`).
- `reconstructions.rooms` table + `/rooms` endpoints are **stubs** (no-ops); real room data is in `vectorization_data`.

---

## Key Files
- `backend/app/db/models/section.py` — Section model; where transform + master-schema control points must be added.
- `backend/app/db/models/building.py` — Floor (master schema) + connector storage candidate.
- `backend/app/db/models/reconstruction.py` + `backend/app/models/reconstruction_vectors.py` — section-local geometry; where section-local control points fit; normalisation convention.
- `backend/app/services/reconstruction_service.py:288` — coord-preserving merge pattern (the "don't move cabinets/doors" guarantee).
- `backend/app/processing/mesh_builder.py:73` + `mesh_generator.py:185` — reusable wall extrusion + unused floor slab for 3D floor assembly.
- `backend/app/services/stitching_service.py` + `backend/app/processing/stitching.py` — affine/clip/merge helpers to reuse; manual-drag flow to NOT reuse.
- `backend/app/api/sections.py:36` + `frontend/src/hooks/useFloorEditorWizard.ts` — section persistence + FloorEditor orchestration to extend with new steps.
- `frontend/src/components/FloorEditor/Step4MarkSections.tsx` / `Step5BindPlans.tsx` — canvas markup + binding patterns for the new control-point/connector steps.
- `backend/app/db/models/floor_transition.py` + `backend/app/db/models/transition.py` — normalised-point storage & two-click UX patterns to mirror.
