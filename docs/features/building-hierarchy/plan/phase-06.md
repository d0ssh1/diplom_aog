# Phase 06: Frontend Types + API Client

phase: 06
layer: frontend foundation
depends_on: 05
design: ../05-api-contract.md §Frontend types, ../01-architecture.md §3.2

## Goal

TypeScript-типы и axios-клиент для иерархии. Используется всеми последующими frontend-фазами.

## Context from Phase 05

Backend выдаёт REST под `/api/v1/buildings`, `/api/v1/buildings/{id}/floors`, `/api/v1/floors/{id}/sections`, расширенный `/reconstruction/reconstructions/*` (см. 05-api-contract.md).

## Files to Create

### `frontend/src/types/hierarchy.ts`
**Purpose:** Типы, мирорящие Pydantic.

**Implementation:** скопировать целиком из ../05-api-contract.md §Frontend types (Building, Floor, SectionGeometry, ReconstructionBrief, Section, PublicBuilding) + добавить:
```typescript
export interface BuildingBrief { id: number; code: string; name: string; }
export interface FloorWithBuilding extends Floor { building: BuildingBrief; }
export interface SectionPayloadItem {
  number: number;
  geometry: SectionGeometry;
  section_type: number;
  reconstruction_id: number | null;
}
export interface ReplaceSectionsRequest { sections: SectionPayloadItem[]; }
export interface ReconstructionFloor {
  id: number; number: number;
  building: BuildingBrief;
}
```

### `frontend/src/api/buildingsApi.ts`
**Purpose:** Axios-функции для buildings/floors/sections.

**Implementation:** использует существующий `apiClient` (или экземпляр из `apiService.ts`).

```typescript
import { apiClient } from './client';
import type { Building, BuildingDetail, Floor, FloorWithBuilding, Section,
              ReplaceSectionsRequest, PublicBuilding } from '../types/hierarchy';

export const buildingsApi = {
  list: (): Promise<Building[]> => apiClient.get('/api/v1/buildings').then(r => r.data),
  listPublished: (): Promise<PublicBuilding[]> =>
    apiClient.get('/api/v1/buildings?published=true').then(r => r.data),
  getById: (id: number): Promise<BuildingDetail> =>
    apiClient.get(`/api/v1/buildings/${id}`).then(r => r.data),
  create: (req: { code: string; name: string; address?: string }): Promise<Building> =>
    apiClient.post('/api/v1/buildings', req).then(r => r.data),
  update: (id: number, req: { name?: string; address?: string }): Promise<Building> =>
    apiClient.patch(`/api/v1/buildings/${id}`, req).then(r => r.data),
  delete: (id: number): Promise<void> =>
    apiClient.delete(`/api/v1/buildings/${id}`).then(() => void 0),
};

export const floorsApi = {
  listByBuilding: (buildingId: number): Promise<Floor[]> => ...,
  getById: (id: number): Promise<FloorWithBuilding> => ...,
  create: (buildingId: number, req: { number: number }): Promise<Floor> => ...,
  delete: (id: number): Promise<void> => ...,
};

export const sectionsApi = {
  listByFloor: (floorId: number): Promise<Section[]> => ...,
  replace: (floorId: number, req: ReplaceSectionsRequest): Promise<Section[]> => ...,
  delete: (id: number): Promise<void> => ...,
};
```

## Files to Modify

### `frontend/src/api/apiService.ts`
**What changes:**
- `saveReconstruction(id, name, floorId)` — заменить `buildingId`/`floorNumber` на единственный `floor_id: number`
- Добавить `patchReconstructionFloor(id: number, floorId: number): Promise<ReconstructionResponse>` — PATCH `/reconstruction/reconstructions/{id}` (ADR-24)
- `getReconstructions({ floorId?, unbound?, status? })` — обновить фильтры
- `getReconstructionById` — расширенный return type (с `floor` и `section` полями)

### `frontend/src/types/reconstruction.ts`
**What changes:** обновить `ReconstructionResponse` и `ReconstructionListItem` — заменить плоские `building_id`/`floor_number` на nested `floor: ReconstructionFloor | null` + `section: { id: number; number: number } | null`.

## Verification

- [ ] `cd frontend && npm run build` без TS-ошибок
- [ ] `cd frontend && npm run lint` без warnings
- [ ] Никаких `any` типов добавлено
- [ ] Импорты типов через `import type` где возможно
