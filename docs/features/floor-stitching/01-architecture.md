# Architecture: Floor Stitching

> Logical view (C4 L1 → L2 → L3) + module dependency graph.
> Behaviour is in [02-behavior.md](02-behavior.md); the geometry/maths is in
> [06-pipeline-spec.md](06-pipeline-spec.md).

## C4 Level 1 — System Context

```mermaid
C4Context
title System Context — Floor Stitching
Person(operator, "Operator (admin)", "Reconstructs sections, assembles the floor")
System(diplom, "Diplom3D", "Floor-plan digitiser + 3D builder")
System_Ext(storage, "File Storage", "Section masks, master schema image, floor GLB")
Rel(operator, diplom, "Places control points, draws connectors, builds floor", "HTTPS")
Rel(diplom, storage, "Reads section masks + master schema, writes floor GLB", "File I/O")
```

The operator already produces per-section reconstructions. This feature adds the
**registration + assembly** loop on top of the existing `Building → Floor →
Section` data the operator has created.

## C4 Level 2 — Container

```mermaid
C4Container
title Container Diagram — Floor Stitching
Person(operator, "Operator", "")
Container(spa, "React SPA", "TypeScript + Three.js", "Per-section wizard + Floor Editor + 3D floor preview")
Container(api, "FastAPI", "Python 3.12", "REST API + registration solver + mesh assembly")
ContainerDb(db, "SQLite / PostgreSQL", "SQLAlchemy async", "control points, transforms, connectors")
Container(fs, "File Storage", "Disk", "section masks, master schema, floor_{id}.glb")
Rel(operator, spa, "Uses", "browser")
Rel(spa, api, "Control points / solve / connectors / build", "HTTP REST /api/v1")
Rel(api, db, "Read/write", "SQLAlchemy")
Rel(api, fs, "Load masks + schema, save floor GLB", "File I/O")
```

No new containers. The feature is additive REST endpoints + new columns/table in
the existing DB + a new GLB artifact in the existing file storage.

## C4 Level 3 — Component

### 3.1 Backend Components

```mermaid
C4Component
title Floor Stitching — Backend Components
Component(rRecon, "reconstruction router", "FastAPI", "section-local control points (extend existing router)")
Component(rAsm, "floor_assembly router", "FastAPI", "master control points, solve, connectors, build, assembly read")
Component(sRecon, "ReconstructionService", "Python", "save/get section-local control points (extend)")
Component(sAsm, "FloorAssemblyService", "Python", "match by ID → solve → persist → composite → GLB")
Component(pReg, "processing.registration", "NumPy (pure)", "uniform similarity least-squares + degeneracy checks")
Component(pAsm, "processing.floor_assembly", "NumPy/OpenCV/trimesh (pure)", "warp+composite masks, rasterise connectors")
Component(pMesh, "processing.mesh_builder", "trimesh (pure, REUSED)", "build_mesh_from_mask")
Component(repos, "Repositories", "SQLAlchemy", "reconstruction / section / floor / connector repos")
Component(models, "Pydantic models", "Pydantic v2", "control-point / transform / connector / assembly contracts")
Component(store, "FileStorage", "Python", "load_mask, load schema, save_floor_mesh_files")

Rel(rRecon, sRecon, "calls")
Rel(rAsm, sAsm, "calls")
Rel(sRecon, repos, "read/write control points")
Rel(sAsm, repos, "read/write transforms, connectors")
Rel(sAsm, pReg, "solve(section_px, master_px)")
Rel(sAsm, pAsm, "assemble(masks, transforms, connectors)")
Rel(pAsm, pMesh, "build_mesh_from_mask(combined_mask)")
Rel(sAsm, store, "load masks + schema, save GLB")
Rel(rRecon, models, "validate")
Rel(rAsm, models, "validate")
```

**Responsibility split (the line that protects the cabinet-preservation rule):**

- `processing.registration` and `processing.floor_assembly` are **pure** — they
  receive plain arrays / numbers and return arrays / a `trimesh.Trimesh`. They
  never touch the DB and never write `vectorization_data`.
- `FloorAssemblyService` does **all** I/O: loads section masks + the master
  schema from `FileStorage`, reads control points from repos, calls the pure
  solver/assembler, persists transforms + the floor GLB.
- The solver output (`scale, tx, ty`) is **uniform** by construction (the pure
  function only ever returns one isotropic scale), so no layer can introduce an
  anisotropic distortion.

### 3.2 Frontend Components

```mermaid
flowchart TB
  subgraph PerSection["Section-plan upload wizard (WizardPage.tsx)"]
    SCP["StepControlPoints.tsx<br/>(NEW) place CPs at upload;<br/>photo↔mask toggle + opacity slider"]
    UW["useWizard.ts<br/>(extend: controlPoints state + saveControlPoints)"]
  end
  subgraph FloorEditor["Floor Editor (FloorEditorPage.tsx)"]
    SBind["StepBindControlPoints.tsx<br/>(NEW) active-point picker on master"]
    SSolve["StepSolveTransforms.tsx<br/>(NEW) solve + overlay preview + residuals"]
    SConn["StepConnectors.tsx<br/>(NEW) draw connecting lines"]
    SPrev["StepFloorPreview.tsx<br/>(NEW) 3D floor GLB via MeshViewer"]
    UFE["useFloorAssembly.ts<br/>(NEW) orchestrates the 4 steps"]
  end
  CPC["ControlPointCanvas.tsx<br/>(NEW shared) labelled/coloured points, snap+hit radius"]
  API["api/floorAssemblyApi.ts (NEW)<br/>api/reconstructionApi.ts (extend)"]
  Types["types/floorAssembly.ts (NEW)"]

  SCP --> CPC
  SBind --> CPC
  SCP --> UW --> API
  SBind --> UFE
  SSolve --> UFE
  SConn --> UFE
  SPrev --> UFE
  UFE --> API
  API --> Types
```

`ControlPointCanvas` is the single shared canvas widget for placing/selecting
labelled control points; it is reused by both the section side (`StepControlPoints`)
and the master side (`StepBindControlPoints`) so the visual language (colour +
label per ID, snap radius, hit radius) is identical on both screens — the core of
the "points can't be confused" requirement.

`useFloorAssembly.ts` is a **new sibling** of the existing `useFloorEditorWizard.ts`
(which already handles section drawing/binding on `FloorEditorPage`). It does not
replace it — the registration/solve/connector/preview steps are a separate concern
with their own state and their own `floorAssemblyApi`, so they live in a dedicated
hook. The per-section side extends the existing `useWizard.ts` used by
`WizardPage.tsx`.

### 3.3 Frontend UX & quality bar

The registration UI is the part the operator touches most, so it gets a deliberate
UX design (not just functional wiring). All logic stays in hooks; components are
presentational; types are explicit (no `any`); Three.js objects `dispose()` on
unmount (`prompts/frontend_style.md`, `threejs_patterns.md`).

```mermaid
flowchart LR
  subgraph FE["Floor Editor — assembly stepper"]
    direction TB
    P1["1 · Bind points"] --> P2["2 · Solve & review"] --> P3["3 · Connecting lines"] --> P4["4 · 3D floor"]
  end
```

**Dual-panel binding (the anti-confusion screen).** Section thumbnail on the left,
master schema on the right, a shared color/label legend between them. Selecting an
ID highlights it on *both* panels (pulse animation); the same color follows that ID
everywhere. A per-ID checklist shows ✓ placed / ○ pending so the operator always
sees what's left. This is the visual enforcement of AC2.

**Live feedback at every step.**

| Step | What the operator sees |
|------|------------------------|
| Place / bind points | snap ring appears when within `R_SNAP` of a wall vertex; cursor crosshair; magnifier loupe near the cursor for pixel-precise clicks; drag to nudge, click-to-select within `R_HIT` |
| Solve & review | each section gets a status chip — green **ok** / amber **check points** (residual/ppm warning) / red **needs points** / red **degenerate** — with its residual in metres; the warped section outline is overlaid on the master in its ID color so misregistration is *visible*, not just numeric |
| Connecting lines | a polyline draw tool (click to add vertices, double-click/Enter to finish, Esc to cancel); existing lines are editable (drag vertex, insert/remove vertex, delete line); rendered as thick bands so they read as walls |
| 3D floor | `MeshViewer` (reuses `useMeshViewer`) with orbit/zoom, per-section tint toggle, a "rebuild" action (fresh preview), a **"save floor" (confirm)** action that promotes the previewed GLB to the persisted floor, and an excluded-sections notice listing why each was skipped |

**Robust states.** Every screen has explicit loading (skeleton), empty ("no
sections bound yet — go bind a plan"), and error (toast + inline) states, plus an
**undo/redo** stack for point placement and line drawing, and keyboard support
(arrow-nudge selected point, Del to remove, Tab to advance active ID). Canvases are
responsive (devicePixelRatio-aware) so points stay crisp on zoom; the display-px
radii (`R_SNAP`,`R_HIT`) are converted through the current display scale so
behaviour is identical at any zoom level.

`ControlPointCanvas` and the connector draw tool share one canvas-interaction core
(coordinate mapping, snap, hit-test, devicePixelRatio handling) so behaviour and
look are uniform across both wizards.

> The operator mock-ups for the combined **"Редактор точек"** screen (3-pane
> layout, photo/маска/инверт. view toggle + opacity, orange crosshair markers,
> "Опорные точки: 8/10" counter, "Далее" CTA) and their mapping to these
> components are captured in [07-ui-reference.md](07-ui-reference.md). Note that
> the mock-up co-locates the **Опорная точка** and **Переходная точка** tools on
> one screen for operator convenience — they remain separate data/concerns per
> [ADR-14](03-decisions.md); this feature owns only the control-point tool.

## Module Dependency Graph

```mermaid
flowchart BT
  rRecon[api/reconstruction.py] --> sRecon[services/reconstruction_service.py]
  rAsm[api/floor_assembly.py] --> sAsm[services/floor_assembly_service.py]
  sRecon --> repos[(db/repositories)]
  sAsm --> repos
  sAsm --> pReg[processing/registration.py]
  sAsm --> pAsm[processing/floor_assembly.py]
  pAsm --> pMesh[processing/mesh_builder.py]
  sAsm --> store[services/file_storage.py]
  pReg -.->|NEVER| sAsm
  pAsm -.->|NEVER| sAsm
  pReg -.->|NEVER| repos
  pAsm -.->|NEVER| repos
```

**Rule (architecture.md §117-119):** dependencies flow inward; `processing/`
imports nothing from `api/`, `services/`, or `db/`. `processing.floor_assembly`
may import `processing.mesh_builder` (same layer) — that is allowed and is how
"raise walls like a normal plan" is reused.

## Data Model (new fields / table)

```mermaid
erDiagram
  RECONSTRUCTION ||--o| SECTION : "1:1 (Section.reconstruction_id)"
  FLOOR ||--o{ SECTION : "1:N"
  FLOOR ||--o{ FLOOR_CONNECTOR : "1:N (NEW)"

  RECONSTRUCTION {
    int id
    text vectorization_data "UNCHANGED — never written by assembly"
    json control_points "NEW: [{id,x,y}] section-local [0,1]"
  }
  SECTION {
    int id
    int floor_id
    json geometry "section polygon on master [0,1] (exists)"
    json control_points "NEW: [{point_id,x,y}] master [0,1]"
    json transform "NEW: {scale,tx,ty,residual_rms_px,n_points,solved_at} px-space"
  }
  FLOOR {
    int id
    string schema_image_id "master schema (exists)"
    json schema_crop_bbox "crop of master (exists)"
    float pixels_per_meter "NEW: floor metric scale (master px/m)"
    string mesh_file_glb "NEW: assembled floor GLB path"
  }
  FLOOR_CONNECTOR {
    int id "NEW table"
    int floor_id "FK CASCADE"
    json points "[[x,y]...] master [0,1] OPEN polyline, >=2 pts"
    float height_m "nullable, default floor_height"
    float thickness_m "nullable, default wall thickness"
    json connects "nullable [section_id,...] for future routing"
  }
```

Rationale for placement (see [03-decisions.md](03-decisions.md) ADR-2):

- **section-local** control points live on `Reconstruction` (they belong to the
  section's own plan, assigned at upload time, independent of any floor).
- **master** control points + the solved **transform** live on `Section` (they
  belong to *this section on this floor*).
- floor metric scale + assembled GLB + connectors live on / under `Floor`.

## Forward compatibility (next features build on this)

This is the **horizontal half** of building assembly. The design leaves clean seams
for the features the user named next — without implementing them (see
[03-decisions.md](03-decisions.md) §Forward compatibility, ADR-14/15):

- **Vertical stitching** reuses the *same* pure `solve_similarity` to register floor
  *N+1* over floor *N* (control points one level up). Floors stack by a parent
  transform using `floors.pixels_per_meter` (persisted here) + a future
  `Floor.base_elevation_m` — **no re-mesh**.
- **Multi-building 3D scene** = each floor/building GLB built at a local origin and
  placed by a parent `Object3D` transform; N buildings = N parented subtrees.
- **Air bridges / vertical transitions** extend the **existing transition layer**
  (`TransitionGroup.type` + `target_hint_building_id/floor_number` already model
  cross-floor/-building links). This feature **does not touch transitions** — control
  points (registration) and transition points (routing) are separate tools (ADR-14).

## Use Cases (→ sequences in 02-behavior.md)

| # | Use case | Primary component |
|---|----------|-------------------|
| UC1 | Place section-local control points (at section-plan upload) | `StepControlPoints` → `ReconstructionService.save_control_points` |
| UC2 | Bind matching control points on the master schema | `StepBindControlPoints` → `FloorAssemblyService.save_section_control_points` |
| UC3 | Solve per-section transforms (match by ID + least squares) | `StepSolveTransforms` → `FloorAssemblyService.solve_transforms` → `processing.registration` |
| UC4 | Draw / replace connecting lines | `StepConnectors` → `FloorAssemblyService.replace_connectors` |
| UC5 | Build (preview) → confirm → persist the stitched floor mesh | `StepFloorPreview` → `FloorAssemblyService.build_floor_mesh` (preview) / `confirm_floor_mesh` (persist) → `processing.floor_assembly` → `build_mesh_from_mask` |
