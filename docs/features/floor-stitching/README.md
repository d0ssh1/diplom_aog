# Floor Stitching — Design

date: 2026-05-29
status: draft
research: ../../research/floor-stitching.md

> Horizontal assembly of several independently-reconstructed floor **sections
> (отсеки)** into one unified floor coordinate space using **control points
> (опорные точки)** with stable IDs, an auto-computed per-section
> **scale + shift** transform, manually drawn **connecting lines**
> (межблочные коридоры), and a combined 3D floor mesh.
>
> This is the horizontal half of backlog feature #6 `building-assembly`
> ("склейка секций в этаж"). Vertical floor→building stacking is out of scope **but
> explicitly designed-for**: the floor artifact is a stackable local-metric unit, the
> registration solver is reused for floor→floor, and air bridges extend the existing
> transition layer — see [03-decisions.md](03-decisions.md) §Forward compatibility.

## Business Context

A building floor is too large to photograph as one evacuation plan, so it is
split into **sections** (отсеки). Each section is photographed, cropped, rotated,
wall-extracted, annotated with cabinets/doors and reconstructed into its own 3D
model **independently** (the existing per-section wizard). Today there is no way
to place those independent sections back into one floor: the `Building → Floor →
Section` hierarchy and a per-floor **master schema** exist, sections can be drawn
on the master schema and bound to reconstructions, but **the geometric
registration layer is entirely missing** (research §Gaps). The operator cannot
tell the system *where* on the floor each section physically sits, so no unified
floor model can be built.

This feature adds that registration layer. The operator marks a few **control
points** with stable IDs on each section during its per-section processing, then
re-marks the *same* points (matched by ID) on the floor master schema. The
system solves a per-section **scale + shift** transform (rotation is already
baked into each section's source schema), places every section into one floor
coordinate space, lets the operator draw **connecting lines** for the
corridors/passages between sections, and raises a single combined 3D floor mesh
— reusing the same wall-extrusion used for a normal single-plan 3D model.

A hard constraint drives the whole design: **cabinets, elevators and staircases
must not move or change shape** when a section is placed on the floor. Their
coordinates are already preserved by the per-section edit-merge
(`reconstruction_service.py:301-311`); this feature must never re-detect or
re-deform them — it only repositions each section *as a rigid, uniformly-scaled
whole*.

## Acceptance Criteria

1. During **section-plan upload** (per-section wizard, after binarization), the
   operator can place ≥3 named control points on a section, each with an **ID unique
   within that section** (stable, never reused), persisted on the reconstruction in
   normalised [0,1] section-local coordinates. The editor toggles photo ↔ binarised
   mask with an opacity slider; points may **snap to the nearest wall-corner within
   a radius** so the same physical landmark is captured precisely (→ accurate scale).
2. In the Floor Editor, correspondence is established **by ID only, never by
   spatial proximity**: the operator selects a control-point ID (active-point
   picker) and clicks the master schema to set *that* ID's master coordinate.
   The section thumbnail highlights the same point simultaneously, so points
   cannot be swapped or confused. Master coordinates persist per section in
   normalised [0,1].
3. The system auto-matches points by ID and computes, per section, a
   shape-preserving **uniform scale + translation** transform via least squares
   **in pixel space** (aspect-correct), reporting a residual error and rejecting
   any section with < 3 matched points or a degenerate (coincident/collinear /
   baseline-too-short) point set.
4. The transform is **strictly uniform** — a single isotropic scale, no rotation,
   no shear, no per-axis scaling — so a square cabinet stays square and never
   acquires a coordinate shift relative to its own section. Assembly is
   **read-only** w.r.t. `vectorization_data`: cabinet, door, stair and lift
   geometry is byte-for-byte unchanged; transformed copies live only in the
   assembled floor artifact.
5. The operator can draw, edit and delete **connecting lines** (open polylines)
   on the master schema; they persist per floor in normalised [0,1] coordinates.
6. The result is one **stitched horizontal floor map**: each bound section's wall
   mask is warped by its uniform similarity and composited into the master-pixel
   floor canvas, connecting lines are rasterised as **wall bands** into the same
   canvas, and the combined mask is extruded by the **same `build_mesh_from_mask`**
   used for a single plan → one floor GLB.
7. Building is a **preview → confirm** step: the operator previews the assembled
   floor in 3D, and only on explicit **confirm** does the floor model persist
   (`floors.mesh_file_glb`) so it can be reloaded — a rebuild never implicitly
   overwrites a saved floor.
8. All new endpoints have Pydantic request/response models; all new coordinates
   are normalised [0,1]; all new processing functions are pure (no DB/HTTP).

## Documents

| File | View | Description |
|------|------|-------------|
| [01-architecture.md](01-architecture.md) | Logical | C4 L1→L2→L3, module dependency graph |
| [02-behavior.md](02-behavior.md) | Process | DFD + sequence diagram per use case, errors, edge cases |
| [03-decisions.md](03-decisions.md) | Decision | ADRs, risks, open questions |
| [04-testing.md](04-testing.md) | Quality | Test strategy + full coverage mapping |
| [05-api-contract.md](05-api-contract.md) | API | Exact JSON shapes for every new endpoint |
| [06-pipeline-spec.md](06-pipeline-spec.md) | Pipeline | Coordinate spaces, the solver, the metric mesh assembly |
| [07-ui-reference.md](07-ui-reference.md) | UI | "Редактор точек" screen anatomy from the operator mock-ups, mapped to ACs |
| [plan/README.md](plan/README.md) | Code | Phase-by-phase implementation plan (15 phases, bottom-up) |

## Glossary

| Term | Meaning |
|------|---------|
| Section (отсек) | One photographed/reconstructed part of a floor. `Section` row links a `Floor` to a `Reconstruction`. |
| Master schema | The per-floor reference image (`Floor.schema_image_id` + crop). The floor's canonical 2D frame. |
| Control point (опорная точка) | A landmark with a stable ID, placed once on a section and once on the master schema, used to register the section into floor space. |
| Section-local coords | Normalised [0,1] over the section's own cropped plan image (the `Reconstruction` frame). |
| Master coords | Normalised [0,1] over the floor master schema (the `Section.geometry` / `Floor.wall_polygons` frame). |
| Transform | Per-section uniform scale + translation mapping section pixels → master pixels (shape-preserving). |
| Connecting line (соединительная линия) | A manually drawn **open polyline** tracing an inter-section corridor wall on the master schema; rasterised as a wall band and raised in 3D like any wall (no slab — the floor mesh is walls-only). |
