# Design Decisions: Floor Stitching

## Decisions (ADRs)

| # | Decision | Choice | Alternatives | Rationale |
|---|----------|--------|--------------|-----------|
| 1 | Transform model | **Uniform similarity: 1 isotropic scale + 2D translation, no rotation, no shear, no reflection** | (a) axis-aligned affine `sx,sy,tx,ty`; (b) full affine incl. rotation/shear; (c) homography | User mandates shapes of cabinets/lifts/stairs must not change. Only a *uniform* scale preserves shape (square→square). Rotation is already baked into section schemas, so it is excluded. **Reflection (mirroring) is also excluded — user confirmed sections are never mirrored relative to the master**; if one ever were, the no-rotation/no-flip model would produce a large residual that flags it. (a) would stretch cabinets when section/master aspect ratios differ; rejected. |
| 2 | Where control points live | **section-local on `Reconstruction.control_points`; master on `Section.control_points`; transform on `Section.transform`** | single JSON blob on Floor; new `control_points` table | section-local points belong to the section's own plan ("assigned at upload", floor-independent) → `Reconstruction`. Master placement + solved transform are *per section on this floor* → `Section`. Mirrors how `Section.geometry` already stores master-space geometry (`section.py:42`). |
| 3 | Point correspondence | **Explicit stable IDs + active-point picker; never spatial nearest-neighbour** | match by click order; match by nearest point | Robustness: spatial matching swaps points when sections are dense or points are close. IDs make the mapping deterministic. The picker carries the ID with each master click. Parallels the shared-ID idea in `TransitionPoint.group_id` (`transition.py:47`). |
| 4 | Solve coordinate space | **Pixel space** (undo [0,1] normalisation using each image's W,H before solving) | solve directly in normalised [0,1] | [0,1] divides x by W and y by H independently → aspect distortion. A uniform scale in normalised space would silently behave anisotropically. Pixel space is aspect-correct, so the single `scale` is physically meaningful. |
| 5 | 3D assembly strategy | **Stitch section masks into the master-pixel canvas (uniform `warpAffine` + composite), then `build_mesh_from_mask` on the combined mask; connectors rasterised in** | concatenate per-section trimeshes in 3D | Matches the user's model ("наложение карт → сшитая карта этажа"). Reuses the exact single-plan extrusion ("raise walls like a normal plan"), gives natural wall dedup at overlaps, and lets connectors merge into one map. Mesh-concat leaves double walls at seams and needs separate connector meshes. |
| 6 | Warp interpolation | **`INTER_NEAREST` on binary masks** | INTER_LINEAR / INTER_AREA | Binary mask must stay 0/255 with crisp edges; linear introduces gray and edge bleed. Nearest + uniform scale = shape-faithful. |
| 7 | Floor metric scale | **Derive `floors.pixels_per_meter` from the anchor section: `ppm_floor = ppm_anchor × scale_anchor`** | introduce a manual floor scale; assume a fixed FLOOR_SIZE | The floor master schema has no intrinsic metric. Control points already encode the section↔master scale, and each section knows its own `estimated_pixels_per_meter` (`reconstruction_vectors.py:42`). The anchor (most/most-spread points) gives the most reliable value; cross-section disagreement becomes a warning. Resolves research Gap #7. |
| 8 | Connecting lines storage | **New `floor_connectors` table, atomic replace-all** | JSON column on `Floor`; reuse sections | They are a child collection of a floor with their own geometry + optional `connects`; a table follows architecture.md's ORM+repository rule and the existing atomic-replace pattern (`section_service.py:46`). |
| 9 | Cabinet/lift/stair preservation | **Assembly is read-only w.r.t. `vectorization_data`; transformed copies exist only in the floor artifact** | bake transformed rooms back into a floor-level vectorization | Guarantees the section's own model/editor is untouched (no silent coordinate drift). The per-section coord-preserving merge (`reconstruction_service.py:301-311`) stays the single writer. |
| 10 | Old stitching system | **New feature is fully independent of it; do NOT reuse or depend on it. Mark deprecated and remove in a separate cleanup task** | (a) reuse `/stitching/` affine helpers; (b) delete it now in this feature | User: the old system "не очень подойдёт" — its paradigm (manual affine, merge sections into one reconstruction) is fundamentally different from the new auto-overlay-by-control-points map-stitching. So we share **no code** with it: a dedicated pure `registration.py` is written from scratch. Deleting it *inside this feature* is rejected as out-of-scope/risky (touches `StitchingPage`, `stitching_service.py`, `useStitching*`); a follow-up cleanup task removes it cleanly. |
| 11 | Per-section CP step placement | **In the section-plan upload wizard (`WizardPage`), as a dedicated "Опорные точки" step placed *after* binarization/wall extraction so the wall mask exists for snapping; editor toggles photo ↔ binarised mask with an opacity slider (matches the friend's mockup)** | a step after the cabinet editor, before nav-graph; only in the Floor Editor | User: "При загрузке плана отсека". Control points belong to the section's own plan and are captured as part of uploading it. The mockup shows the editor over both the photo and the binarised mask with an opacity slider — so the step sits right after binarization, where the mask is available for accurate corner-snap, but is presented as part of section setup. |
| 12 | Snap & hit radii | **`R_snap` (snap new point to wall vertex), `R_hit` (select existing point), `R_min_baseline` (degeneracy guard)** — display-pixel based, configurable | no snapping; fixed thresholds | Directly answers the user's "radius" concern: snapping to the same physical corner on both screens makes scale accurate; the baseline guard rejects unreliable (too-close) point pairs before they corrupt the scale. |
| 13 | Connector geometry | **Open polyline (vector line) rasterised as a wall band; ≥2 points; no fill** | (a) closed filled polygon; (b) closed outline polygon | User asked for "просто векторные линии". The floor mesh is **walls-only** (`build_mesh_from_mask` extrudes walls, no slab/ceiling), so a connector must be wall pixels. A *filled* polygon → solid plug; a *closed outline* → walls across the corridor's open ends (blocks the doorways into sections). An *open polyline* lets the operator trace exactly the corridor side walls (a corridor = 2 lines), leaving the ends open — a real passage — and composites/extrudes identically to a normal wall. |
| 14 | Control points vs transition points | **Two completely separate concepts and tools. This feature adds *control points* (registration) and does NOT touch the existing transition system (`TransitionGroup`/`TransitionPoint`/`FloorTransition`)** | fold control points into the transition editor; one unified "point" type | User: "Переходные точки это совсем другой инструмент… стоит его оставить таким, какой он есть." Transition points exist to build the routing super-graph and jump between plans (per-plan, used in navigation). Control points exist only to match a section's scale+position onto the floor. Different lifecycle (control points are consumed by the solver; transitions persist for routing), different storage, different screens. Keeping them separate avoids regressing the navigation feature and matches the user's mental model. |
| 15 | Floor artifact frame (forward hook) | **Build the floor GLB in a clean *local metric frame*: origin at the master-canvas corner, units = metres via `floors.pixels_per_meter`, walls only. Floor stores its metric scale now; vertical elevation + building world-origin are added later as a pure parent transform** | bake an absolute world position into the floor mesh now | The user wants horizontal floors to later stack vertically and several buildings to sit in one 3D scene. A floor that is self-consistent in a local metric frame can be placed by a parent `(translate elevation, translate building-origin)` with **no re-mesh**. Baking world coordinates in now would force a rebuild when stacking. `pixels_per_meter` (ADR-7) is the one metric hook this feature already needs and already persists, so vertical alignment reuses it for free. |
| 16 | Minimum control points | **Strictly ≥3 matched points per section to solve** | (a) ≥2 (mathematical minimum); (b) ≥2 with a "below 3" warning | For a 3-DOF uniform similarity (`s,tx,ty`), 2 points barely overdetermine the fit, so a mis-clicked point can pass with a low residual. 3 well-spread points make the residual (06 §2.4) isolate a single bad point and reliably surface collinearity. User confirmed "строго 3" once it was clear 3 is sufficient. |
| 17 | Floor build persistence | **Two-step preview → confirm: `build-mesh` writes a preview GLB and returns a `glb_file_id` without touching `floors.mesh_file_glb`; `confirm-mesh` promotes that GLB to the persisted floor** | build-mesh persists immediately (auto-cache); rebuild overwrites | User chose "Превью → подтверждение, потом сохранить". Prevents an unreviewed rebuild from clobbering a good saved floor; the operator inspects the 3D preview and explicitly commits. Stateless confirm (carries the `glb_file_id`) keeps the API clean and avoids a rebuild on confirm. |
| 18 | Canvas sizing | **Fixed to the master-schema crop dims; no section-driven upscaling. One uniform memory-guard downscale (`MAX_FLOOR_CANVAS_PX`) only** | two-step auto-resize (upscale to the highest-res section, then cap) | User chose "Фиксированный размер холста". The master schema is the floor's reference frame, so it also sets the pixel resolution; if sharper sections are needed the operator uploads a higher-res master. Simpler and predictable: `ppm_floor` carries no resolution factor. The memory guard is a single scalar applied to all transforms/ppm/connectors together → no shape distortion (06 §5.2). |
| 19 | Auth / ownership scope for the new endpoints | **Scope-out: the new endpoints mirror the existing routers' (decorative) auth and add NO ownership/IDOR check** | (a) wire a real `get_current_user` for the new mutating endpoints; (b) real auth + floor→building→owner scoping | A round-2 security review found that auth is decorative *codebase-wide* — `api/floors.py` etc. inject `HTTPBearer` credentials but never decode the token, and `deps.get_current_user` is a TODO stub returning a fake `id:1`; no model carries a usable owner edge (IDOR). This is a **pre-existing, system-wide** gap, not introduced by floor-stitching. The system is a single-operator diploma project, so the user chose to scope it out here rather than partially fix auth inside one feature (which would be inconsistent and misleading). **This feature must not *expand* the gap** (no new public/unauthenticated surface beyond what mirroring floors.py already implies). A proper auth+scoping pass is a separate, codebase-wide ticket (candidate: `refactor-core` / a dedicated security task). |

## Detailed note — why uniform scale cannot shift a cabinet (ADR-1 + ADR-4 + ADR-9)

Let a section element (cabinet corner) be at normalised `(u,v)` over the section
crop `(Wₛ,Hₛ)`. Its section-pixel position is `(u·Wₛ, v·Hₛ)`. The solved warp is
`X = s·x + tx`, `Y = s·y + ty` (same `s` on both axes). For any two points in the
section, their distance scales by exactly `s` and their relative angle is
unchanged ⇒ the cabinet's shape is similar (congruent up to scale) and its
position **relative to its own walls** is identical. Because every element of a
section shares one `(s,tx,ty)`, nothing inside the section moves relative to
anything else. The only difference between sections is each having its own `s` —
which is correct, since each section maps to a different physical region. And
since `vectorization_data` is never rewritten (ADR-9), the section's stored
coordinates stay byte-for-byte identical; the transform is applied only to
**copies** used for the floor map/labels.

If we had solved in normalised space (rejected, ADR-4), the implicit mapping
would be `U = sx·u + …`, `V = sy·v + …` with `sx = s·Wₘ/Wₛ`, `sy = s·Hₘ/Hₛ` —
unequal whenever the aspect ratios differ, i.e. a hidden anisotropic stretch that
*would* deform cabinets. Solving in pixel space removes this trap.

## Risks

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Operator places control points imprecisely → wrong scale | High (whole section mis-sized) | Snap-to-vertex (`R_snap`); residual_rms reported per section; degeneracy + short-baseline rejection; **require ≥3** spread-out points (ADR-16) so a single mis-click shows in the residual |
| Sections imply inconsistent ppm (bad points) | Med (floor scale off) | Anchor-section ppm + cross-section ppm spread warning (`PPM_WARN_RATIO`) |
| Large floor canvas → memory blow-up on warp | Med | Cap canvas at `MAX_FLOOR_CANVAS_PX`; downscale master dims proportionally |
| Low-res master schema (phone photo) downsamples a section below its native detail | Med (coarse walls for that section) | Fixed canvas is kept (ADR-18); emit a **non-fatal** warning when a section's solved `scale < DETAIL_WARN_SCALE` so the operator can re-shoot the master at higher resolution if needed; build still proceeds |
| Seams/gaps between sections | Med (visual holes) | Connecting lines bridge corridors; overlaps merge via OR; document that perfect raster match is not expected |
| Master schema pixel dims unavailable / crop missing | Med | Read dims from the schema image file; if no crop, use full image dims |
| `build_mesh_from_mask` rejects combined mask (white_ratio>0.5 etc.) | Low | Composited walls remain thin; reuse existing sanity logging; surface 422 on empty contours |
| Existing buggy endpoints nearby (research Gap list) | Low | Out of scope; do not touch `route/multi`, broken buildings recon list, etc. |
| Decorative auth + IDOR on the new (mutating) endpoints | Med (any user could mutate another's floor once auth is real elsewhere) | **Accepted / scoped-out** (ADR-19): pre-existing codebase-wide gap, single-operator system; do not expand it; defer a real auth+ownership pass to a separate ticket |

## Open Questions

- [x] Uniform vs anisotropic scale? → **Uniform** (ADR-1), confirmed by the
  user's "shapes must not change / no coordinate shift" requirement.
- [x] Match by ID or spatially? → **By ID + active-point picker** (ADR-3).
- [x] Mesh-concat vs map-stitch? → **Map-stitch** (ADR-5), per "сшитая карта этажа".
- [x] **Old `/stitching/` system** → user confirmed it doesn't fit; the new feature
  shares **no code** with it (ADR-10). Removal is a separate cleanup task, not this
  feature.
- [x] **Connector shape** → **open vector polylines as wall bands** (ADR-13), per
  user's "векторные линии"; no fill (floor mesh is walls-only).
- [x] **Control vs transition points** → separate tools; transition system
  untouched (ADR-14).
- [x] **When to place control points** → at section-plan upload (ADR-11).
- [x] **Scope** → horizontal now + forward hooks (ADR-15 + §Forward compatibility);
  vertical stacking / air bridges / multi-building scene are later features.
- [x] **Minimum control points** → **strictly ≥3** (ADR-16). 3 well-spread points
  overdetermine `s,tx,ty` enough to isolate a single mis-click in the residual; 2 is
  mathematically enough but too fragile.
- [x] **Floor preview = on-the-fly build or cached GLB** → **preview → confirm**
  (ADR-17). `build-mesh` returns a preview GLB without persisting; `confirm-mesh`
  promotes it to `floors.mesh_file_glb`. A rebuild never silently overwrites a saved
  floor.
- [x] **Small section map / "растянуть"** → **fixed canvas = master-schema crop dims**
  (ADR-18). No section-driven upscaling; the master schema defines the floor's pixel
  resolution. A single uniform memory-guard downscale (`MAX_FLOOR_CANVAS_PX`) is the
  only adjustment, applied to everything at once so shapes are unaffected (06 §5.2).

## Forward compatibility (future features — designed-for, NOT built now)

This feature is the **horizontal half** of building assembly. Per the user, the next
features stack these floors vertically, add air bridges, and show several buildings
in one 3D scene. The design leaves clean seams for each — without implementing them.

### A. Vertical stitching (floors stacked into a building)

- **Reuse the solver as-is.** `processing.registration.solve_similarity` takes plain
  point arrays; it has no idea whether it's matching section→floor or floor→floor.
  Vertical registration (place floor *N+1*'s control points over floor *N*) calls
  the *same* pure function. The friend's process sketch (control points on the
  lowest floor, then the same IDs on each floor above) is exactly this, one level up.
- **Stack via a parent transform, no re-mesh (ADR-15).** Each floor GLB lives in a
  local metric frame. Vertical stacking adds `Floor.base_elevation_m` (a nullable
  column, added by that feature) and places floor *k* at `y = Σ heights below`. The
  horizontal mesh is reused untouched.
- **Metric continuity.** `floors.pixels_per_meter` (already persisted here) is the
  shared metric that lets two floors agree on real-world size when stacked.

### B. Multi-building 3D scene (whole-route view)

- The floor (and later building) mesh is built at a **local origin**; world placement
  is a parent `Object3D` transform in the viewer. Showing N buildings = N parented
  subtrees in one scene — no geometry rebake.
- Implies a future `Building` world-origin (x,y, rotation) — again a pure transform,
  not a re-mesh. Not added now.
- The 3D viewer should keep using `dispose()` discipline and instancing-friendly
  GLBs so a many-building scene stays performant (`threejs_patterns.md`).

### C. Air bridges & vertical transitions (воздушные переходы)

- These are **routing/connection** objects, so they extend the **existing transition
  layer**, not the control-point layer. `TransitionGroup.type` +
  `target_hint_building_id` + `target_hint_floor_number` already model cross-floor
  and cross-building links — an air bridge is a transition group whose endpoints sit
  on different floors/buildings and which is *rendered* as an elevated passage.
- This feature therefore **does not touch transitions** (ADR-14); it only guarantees
  the floor artifact carries enough metric/elevation context (via `pixels_per_meter`
  now, `base_elevation_m` later) for a future air-bridge to be drawn at the right
  height between two assembled floors.
- The connecting *lines* in this feature (ADR-13) are intra-floor corridor walls —
  conceptually distinct from inter-floor air bridges; the names are kept separate to
  avoid confusion.
