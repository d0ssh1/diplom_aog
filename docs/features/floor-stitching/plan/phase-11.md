# Phase 11: Frontend types + api client

phase: 11
layer: frontend/src/types, frontend/src/api
depends_on: 09
design: ../05-api-contract.md; ../01-architecture.md §3.2

## Goal

Mirror the API contract in TypeScript and expose one axios function per endpoint.
No rendering. No `any`.

## Files to Create

### `frontend/src/types/floorAssembly.ts`
Interfaces matching 05-api-contract exactly (mirror existing `types/hierarchy.ts`,
`types/reconstructionVectors.ts` for style):
- `ControlPoint { id: string; x: number; y: number }`
- `MasterControlPoint { point_id: string; x: number; y: number }`
- `SectionTransform { scale; tx; ty; residual_rms_px; n_points; solved_at: string }`
- `Connector { id: number; points: [number, number][]; height_m: number | null; thickness_m: number | null; connects: number[] | null }`
- `ConnectorInput` (Connector without `id`)
- `SolveSectionStatus = "ok" | "needs_points" | "degenerate"`
- `SolveSectionResult`, `SolveTransformsResponse`
- `ControlPointsResponse`, `SectionControlPointsResponse`
- `ConnectorsResponse { floor_id: number; connectors: Connector[] }` (used by `getConnectors`/`replaceConnectors` — declare it; it was missing from this list)
- `BuildFloorPreviewResponse` (incl. `glb_file_id`, `persisted`, `excluded_sections`, `warnings`, `connector_count`, `canvas_size_px`)
- `ConfirmMeshResponse`
- `MasterSchemaInfo`, `AssemblySection`, `FloorAssemblyResponse` (master_schema, sections, connectors)

**Nullability — match the Pydantic models (Phase 02), NOT the always-populated 05
examples:** `image_size_cropped` is `[number, number] | null` in BOTH
`ControlPointsResponse` and `AssemblySection`; `pixels_per_meter` and `mesh_file_glb`
are `... | null`; `transform` on a section is `SectionTransform | null`. The 05 JSON
examples show happy-path values, but the contract allows null — type accordingly.

### `frontend/src/api/floorAssemblyApi.ts`
Mirror `api/floorSchemaApi.ts` / `buildingsApi.ts`: import the default `apiClient`
axios instance from `apiService.ts` (auth header is added by its interceptor; base
URL already includes `/api/v1`) and unwrap with `.then((r) => r.data as T)`. One
function per endpoint:
```ts
getReconstructionControlPoints(reconstructionId: number): Promise<ControlPointsResponse>
saveReconstructionControlPoints(reconstructionId: number, points: ControlPoint[]): Promise<ControlPointsResponse>
saveMasterControlPoints(floorId: number, sectionId: number, points: MasterControlPoint[]): Promise<SectionControlPointsResponse>
solveTransforms(floorId: number): Promise<SolveTransformsResponse>
getConnectors(floorId: number): Promise<ConnectorsResponse>
replaceConnectors(floorId: number, connectors: ConnectorInput[]): Promise<ConnectorsResponse>
buildFloorMesh(floorId: number): Promise<BuildFloorPreviewResponse>
confirmFloorMesh(floorId: number, glbFileId: string): Promise<ConfirmMeshResponse>
getFloorAssembly(floorId: number): Promise<FloorAssemblyResponse>
```

## Business rules
- No `any` — use `unknown` + a type guard if a response needs narrowing.
- Paths exactly as in 05 (`/api/v1` base from the shared client).

## Verification
- [ ] `cd frontend && npx tsc --noEmit` clean.
- [ ] Each api fn returns the typed promise; imported types resolve.
- [ ] ESLint clean (no `any`).
