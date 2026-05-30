// REST client for the Floor Stitching endpoints (section/master control points,
// solve-transforms, connectors, build/confirm preview mesh, assembly read).
// See docs/features/floor-stitching/05-api-contract.md
//
// Base URL already includes /api/v1 (apiService interceptor adds the auth header).
// The control-points routes live on the reconstruction router, hence the
// /reconstruction/reconstructions/... prefix; the rest are /floors/... .

import apiClient from './apiService';
import type {
  BuildFloorPreviewResponse,
  ConfirmMeshResponse,
  ConnectorInput,
  ConnectorsResponse,
  ControlPoint,
  ControlPointsResponse,
  FloorAssemblyResponse,
  MasterControlPoint,
  SectionControlPointsResponse,
  SolveTransformsResponse,
} from '../types/floorAssembly';

export const floorAssemblyApi = {
  // GET /api/v1/reconstructions/{id}/control-points — section-local points (UC1)
  getReconstructionControlPoints: (
    reconstructionId: number,
  ): Promise<ControlPointsResponse> =>
    apiClient
      .get(`/reconstruction/reconstructions/${reconstructionId}/control-points`)
      .then((r) => r.data as ControlPointsResponse),

  // PUT /api/v1/reconstructions/{id}/control-points — replace section-local points
  saveReconstructionControlPoints: (
    reconstructionId: number,
    points: ControlPoint[],
  ): Promise<ControlPointsResponse> =>
    apiClient
      .put(`/reconstruction/reconstructions/${reconstructionId}/control-points`, {
        points,
      })
      .then((r) => r.data as ControlPointsResponse),

  // PUT /api/v1/floors/{id}/sections/{sid}/control-points — master points (UC2)
  saveMasterControlPoints: (
    floorId: number,
    sectionId: number,
    points: MasterControlPoint[],
  ): Promise<SectionControlPointsResponse> =>
    apiClient
      .put(`/floors/${floorId}/sections/${sectionId}/control-points`, { points })
      .then((r) => r.data as SectionControlPointsResponse),

  // POST /api/v1/floors/{id}/solve-transforms — solve every section (UC3)
  solveTransforms: (floorId: number): Promise<SolveTransformsResponse> =>
    apiClient
      .post(`/floors/${floorId}/solve-transforms`)
      .then((r) => r.data as SolveTransformsResponse),

  // GET /api/v1/floors/{id}/connectors — list connector polylines (UC4)
  getConnectors: (floorId: number): Promise<ConnectorsResponse> =>
    apiClient
      .get(`/floors/${floorId}/connectors`)
      .then((r) => r.data as ConnectorsResponse),

  // PUT /api/v1/floors/{id}/connectors — atomic replace of all connectors (UC4)
  replaceConnectors: (
    floorId: number,
    connectors: ConnectorInput[],
  ): Promise<ConnectorsResponse> =>
    apiClient
      .put(`/floors/${floorId}/connectors`, { connectors })
      .then((r) => r.data as ConnectorsResponse),

  // POST /api/v1/floors/{id}/build-mesh — assemble a preview GLB (UC5 build)
  buildFloorMesh: (floorId: number): Promise<BuildFloorPreviewResponse> =>
    apiClient
      .post(`/floors/${floorId}/build-mesh`)
      .then((r) => r.data as BuildFloorPreviewResponse),

  // POST /api/v1/floors/{id}/confirm-mesh — promote a preview to the floor model
  confirmFloorMesh: (
    floorId: number,
    glbFileId: string,
  ): Promise<ConfirmMeshResponse> =>
    apiClient
      .post(`/floors/${floorId}/confirm-mesh`, { glb_file_id: glbFileId })
      .then((r) => r.data as ConfirmMeshResponse),

  // GET /api/v1/floors/{id}/assembly — single read powering the Floor Editor
  getFloorAssembly: (floorId: number): Promise<FloorAssemblyResponse> =>
    apiClient
      .get(`/floors/${floorId}/assembly`)
      .then((r) => r.data as FloorAssemblyResponse),
};
