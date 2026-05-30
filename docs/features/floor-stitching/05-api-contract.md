# API Contract: Floor Stitching

> Exact request/response JSON for every new or extended endpoint. All coordinates
> are normalised `[0,1]` unless a field name says `_px`. Every body has a Pydantic
> Request/Response model (`prompts/python_style.md`). Auth: `HTTPBearer`, same as
> existing routers. Base path: `/api/v1`.

## Models (Pydantic v2)

### Shared point types

```jsonc
// ControlPoint — section-local, stored on reconstruction.control_points
{
  "id": "cp-1",          // stable string id, unique within the section
  "x": 0.1234,           // [0,1] over the cropped section plan image
  "y": 0.5678
}

// MasterControlPoint — stored on section.control_points
{
  "point_id": "cp-1",    // MUST equal a ControlPoint.id of the bound reconstruction
  "x": 0.4321,           // [0,1] over the cropped master schema
  "y": 0.8765
}

// SectionTransform — solved, stored on section.transform (read-only to clients)
{
  "scale": 1.234,        // single isotropic scale, master_px / section_px
  "tx": 56.7,            // master-pixel translation
  "ty": 89.0,
  "residual_rms_px": 2.3,
  "n_points": 3,
  "solved_at": "2026-05-29T12:00:00Z"
}
```

Validation (all point types): `0.0 <= x,y <= 1.0` (`Field(ge=0, le=1)`); ids match
`^cp-\d+$`; list length `<= MAX_CONTROL_POINTS`.

---

## UC1 — Section-local control points

### `GET /api/v1/reconstruction/reconstructions/{reconstruction_id}/control-points`

`200`:
```json
{
  "reconstruction_id": 12,
  "image_size_cropped": [1024, 768],
  "points": [
    { "id": "cp-1", "x": 0.12, "y": 0.34 },
    { "id": "cp-2", "x": 0.80, "y": 0.30 }
  ]
}
```
`image_size_cropped` is echoed (from `vectorization_data`) so the client can render
the snap radius in image px. `404` if reconstruction not found.

### `PUT /api/v1/reconstruction/reconstructions/{reconstruction_id}/control-points`

Request — `SaveControlPointsRequest`:
```json
{ "points": [ { "id": "cp-1", "x": 0.12, "y": 0.34 },
              { "id": "cp-2", "x": 0.80, "y": 0.30 } ] }
```
`200` → same shape as the GET response.

| Error | Status | Body |
|-------|--------|------|
| reconstruction not found | 404 | `{"detail":"Reconstruction 12 not found"}` |
| duplicate `id` in `points` | 422 | `{"detail":"Duplicate control-point id: cp-1"}` |
| x/y out of `[0,1]` | 422 | Pydantic validation error |
| > `MAX_CONTROL_POINTS` | 422 | `{"detail":"Too many control points (max 20)"}` |

> Empty/1-/2-point lists are accepted (200) — the section just isn't solvable until
> it has ≥3 matched points at solve time.

---

## UC2 — Master control points (per section on a floor)

### `PUT /api/v1/floors/{floor_id}/sections/{section_id}/control-points`

Request — `SaveMasterControlPointsRequest`:
```json
{ "points": [ { "point_id": "cp-1", "x": 0.41, "y": 0.22 },
              { "point_id": "cp-2", "x": 0.77, "y": 0.20 } ] }
```
`200` — `SectionControlPointsResponse`:
```json
{
  "section_id": 5,
  "points": [ { "point_id": "cp-1", "x": 0.41, "y": 0.22 },
              { "point_id": "cp-2", "x": 0.77, "y": 0.20 } ],
  "section_point_ids": ["cp-1", "cp-2", "cp-3"],
  "matched_ids": ["cp-1", "cp-2"],
  "unmatched_ids": ["cp-3"]
}
```
`matched_ids` = master ids that exist on the section; `unmatched_ids` = section ids
not yet placed on the master. Lets the UI show ✓/✗ badges (02-behavior UC2).

| Error | Status | Body |
|-------|--------|------|
| section not found | 404 | `{"detail":"Section 5 not found"}` |
| section has no bound reconstruction | 409 | `{"detail":"Section 5 is not bound to a reconstruction"}` |
| `point_id` ∉ reconstruction's control-point ids | 422 | `{"detail":"point_id cp-9 is not a control point of the section"}` |
| x/y out of `[0,1]` | 422 | validation error |

> Rejecting unknown `point_id` (422) is what makes correspondence orphan-proof — a
> master point can never reference a non-existent section point.

---

## UC3 — Solve transforms

### `POST /api/v1/floors/{floor_id}/solve-transforms`

No request body. Solves every bound section on the floor.

`200` — `SolveTransformsResponse`:
```json
{
  "floor_id": 3,
  "pixels_per_meter": 47.5,
  "anchor_section_id": 5,
  "sections": [
    {
      "section_id": 5,
      "status": "ok",
      "transform": { "scale": 1.21, "tx": 40.0, "ty": 88.0,
                     "residual_rms_px": 1.8, "n_points": 3,
                     "solved_at": "2026-05-29T12:00:00Z" },
      "implied_ppm": 47.5,
      "warning": null
    },
    {
      "section_id": 6,
      "status": "needs_points",
      "transform": null,
      "implied_ppm": null,
      "warning": "Only 2 matched control points (need >= 3)"
    },
    {
      "section_id": 7,
      "status": "degenerate",
      "transform": null,
      "implied_ppm": null,
      "warning": "Control points too close together (baseline < 2% of image)"
    },
    {
      "section_id": 8,
      "status": "ok",
      "transform": { "scale": 1.05, "tx": 5.0, "ty": 410.0,
                     "residual_rms_px": 9.4, "n_points": 3,
                     "solved_at": "2026-05-29T12:00:00Z" },
      "implied_ppm": 52.9,
      "warning": "ppm differs from floor anchor by 11% — check control points"
    }
  ]
}
```

`status` ∈ `{"ok","needs_points","degenerate"}`. Only `ok` sections carry a
`transform` and are included in the build. Warnings are non-fatal.

| Error | Status | Body |
|-------|--------|------|
| floor not found | 404 | `{"detail":"Floor 3 not found"}` |
| no sections bound to reconstructions | 409 | `{"detail":"No sections bound to plans"}` |

---

## UC4 — Connecting lines

A connector is an **open polyline** (vector line) tracing one corridor wall — not a
closed polygon. `points` is an ordered list of ≥2 master-norm vertices.

### `GET /api/v1/floors/{floor_id}/connectors`

`200`:
```json
{ "floor_id": 3,
  "connectors": [
    { "id": 1, "points": [[0.30,0.40],[0.36,0.46],[0.36,0.55]],
      "height_m": null, "thickness_m": null, "connects": [5, 6] } ] }
```

### `PUT /api/v1/floors/{floor_id}/connectors`

Atomic replace-all (mirrors `PUT /floors/{id}/sections`). Request —
`ReplaceConnectorsRequest`:
```json
{ "connectors": [
    { "points": [[0.30,0.40],[0.36,0.46],[0.36,0.55]],
      "height_m": null, "thickness_m": null, "connects": [5, 6] } ] }
```
`200` → same shape as GET (with assigned ids).

| Error | Status | Body |
|-------|--------|------|
| floor not found | 404 | `{"detail":"Floor 3 not found"}` |
| line < 2 points | 422 | `{"detail":"Connector line needs >= 2 points"}` |
| coord out of `[0,1]` | 422 | validation error |
| > `MAX_CONNECTORS` / `> MAX_CONNECTOR_POINTS` | 422 | `{"detail":"Too many connectors"}` |
| empty `connectors` list | 200 | clears all (valid) |

`height_m` nullable (defaults to `FLOOR_HEIGHT`); `thickness_m` nullable (defaults
to the derived wall thickness); `connects` nullable (reserved for future inter-
section routing, not used by the mesh build).

---

## UC5 — Build (preview) then confirm the stitched floor mesh

Building is a **two-step preview → confirm** flow. `build-mesh` assembles and
writes a **preview** GLB to storage but does **not** touch `floors.mesh_file_glb`;
the operator inspects the preview in 3D and only then `confirm-mesh` promotes that
exact GLB to the persisted floor model. This avoids overwriting a good saved floor
with an unreviewed rebuild.

### `POST /api/v1/floors/{floor_id}/build-mesh`

No request body. Assembles a **preview** (not persisted). `200` —
`BuildFloorPreviewResponse`:
```json
{
  "floor_id": 3,
  "glb_file_id": "floor-3-preview-7f3a",
  "glb_url": "/api/v1/files/models/floor_3_preview_7f3a.glb",
  "persisted": false,
  "pixels_per_meter": 47.5,
  "canvas_size_px": [3200, 2400],
  "included_sections": [5, 8],
  "excluded_sections": [
    { "section_id": 6, "reason": "needs_points" },
    { "section_id": 7, "reason": "degenerate" }
  ],
  "warnings": [
    { "section_id": 8, "code": "low_detail",
      "message": "Section 8 rendered at 0.42× — master schema may be too low-res" }
  ],
  "connector_count": 2
}
```
`glb_file_id` is an opaque handle to the just-built preview; pass it to
`confirm-mesh`. `floors.mesh_file_glb` is unchanged until confirm. `warnings` is
non-fatal (e.g. `low_detail` when a section's scale `< DETAIL_WARN_SCALE` on a
low-res master); the build still produces a previewable GLB.

| Error | Status | Body |
|-------|--------|------|
| floor not found | 404 | `{"detail":"Floor 3 not found"}` |
| no section has a transform | 409 | `{"detail":"Run solve-transforms first"}` |
| master schema image missing | 422 | `{"detail":"Floor has no master schema image"}` |
| combined mask has no wall contours | 422 | `{"detail":"Empty floor mask — nothing to extrude"}` |
| a section mask file missing | 200 | section listed in `excluded_sections` (reason `"mask_missing"`), build continues |
| trimesh/export failure | 500 | safe logged message |

### `POST /api/v1/floors/{floor_id}/confirm-mesh`

Promotes a previously built preview to the persisted floor model. Request —
`ConfirmMeshRequest`:
```json
{ "glb_file_id": "floor-3-preview-7f3a" }
```
`200` — `ConfirmMeshResponse`:
```json
{
  "floor_id": 3,
  "mesh_file_glb": "models/floor_3.glb",
  "glb_url": "/api/v1/files/models/floor_3.glb",
  "persisted": true
}
```
Sets `floors.mesh_file_glb` to the promoted GLB.

| Error | Status | Body |
|-------|--------|------|
| floor not found | 404 | `{"detail":"Floor 3 not found"}` |
| unknown / expired `glb_file_id` | 422 | `{"detail":"No such preview — rebuild first"}` |

---

## Assembly read (drives the Floor Editor)

### `GET /api/v1/floors/{floor_id}/assembly`

One call returns everything the Floor Editor needs to render all four steps.
`200` — `FloorAssemblyResponse`:
```json
{
  "floor_id": 3,
  "pixels_per_meter": 47.5,
  "mesh_file_glb": "models/floor_3.glb",
  "master_schema": {
    "image_id": "a1b2…",
    "url": "/api/v1/files/schemas/a1b2.png",
    "crop_bbox": { "x": 0.0, "y": 0.0, "width": 1.0, "height": 1.0, "rotation": 0 },
    "size_px": [3200, 2400]
  },
  "sections": [
    {
      "section_id": 5,
      "number": 1,
      "reconstruction_id": 12,
      "mask_file_id": "m-5",
      "image_size_cropped": [1024, 768],
      "section_control_points": [ { "id": "cp-1", "x": 0.12, "y": 0.34 } ],
      "master_control_points":  [ { "point_id": "cp-1", "x": 0.41, "y": 0.22 } ],
      "transform": { "scale": 1.21, "tx": 40.0, "ty": 88.0,
                     "residual_rms_px": 1.8, "n_points": 3,
                     "solved_at": "2026-05-29T12:00:00Z" },
      "status": "ok"
    }
  ],
  "connectors": [
    { "id": 1, "points": [[0.30,0.40],[0.36,0.46],[0.36,0.55]],
      "height_m": null, "thickness_m": null, "connects": [5, 6] }
  ]
}
```
`404` if floor not found. `transform`/`status` are `null`/`"needs_points"` until a
solve runs. `mesh_file_glb` is the last **confirmed** floor mesh (`null` until a
`confirm-mesh` runs — an unconfirmed preview is never reflected here). This is the
single read used to populate bind / solve / connectors / preview without N
round-trips.

---

## Endpoint summary

| Method | Path | Model in → out | Service |
|--------|------|----------------|---------|
| GET | `/reconstruction/reconstructions/{id}/control-points` | — → `ControlPointsResponse` | `ReconstructionService` |
| PUT | `/reconstruction/reconstructions/{id}/control-points` | `SaveControlPointsRequest` → `ControlPointsResponse` | `ReconstructionService` |
| PUT | `/floors/{id}/sections/{sid}/control-points` | `SaveMasterControlPointsRequest` → `SectionControlPointsResponse` | `FloorAssemblyService` |
| POST | `/floors/{id}/solve-transforms` | — → `SolveTransformsResponse` | `FloorAssemblyService` |
| GET | `/floors/{id}/connectors` | — → `ConnectorsResponse` | `FloorAssemblyService` |
| PUT | `/floors/{id}/connectors` | `ReplaceConnectorsRequest` → `ConnectorsResponse` | `FloorAssemblyService` |
| POST | `/floors/{id}/build-mesh` | — → `BuildFloorPreviewResponse` | `FloorAssemblyService` |
| POST | `/floors/{id}/confirm-mesh` | `ConfirmMeshRequest` → `ConfirmMeshResponse` | `FloorAssemblyService` |
| GET | `/floors/{id}/assembly` | — → `FloorAssemblyResponse` | `FloorAssemblyService` |

All live in two routers: section-local CPs extend `api/reconstruction.py`; the rest
is a new `api/floor_assembly.py`. Routers stay thin (validate → service → return).
