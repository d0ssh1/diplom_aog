# Phase 1: Define vector schema

phase: 1
layer: models
depends_on: none
design: ../README.md

## Goal
Define a typed vector payload for edit-plan restore/save so the frontend and backend share the same room and door schema.

## Context
The current code stores vectorization data as JSON and the frontend reads it as `unknown`. The bug comes from the frontend reconstructing rooms from bounding boxes and then saving synthetic rectangles back into the payload.

## Files to Create

### `backend/app/models/reconstruction_vectors.py`
**Purpose:** Define Pydantic models for edit-plan vector payloads.
**Implementation details:**
- Include room geometry fields needed by the edit flow: `id`, `name`, `room_type`, `center`, `polygon`, `area_normalized`.
- Include door fields: `id`, `position`, `width`, `connects`.
- Preserve optional legacy compatibility where it does not break the current payload.
- Use explicit type annotations and Pydantic v2 models.

### `frontend/src/types/reconstructionVectors.ts`
**Purpose:** Define frontend TypeScript interfaces for stored vector payloads.
**Implementation details:**
- Mirror backend vector DTOs.
- Keep exact field names used by the backend JSON.
- Avoid `any`.

## Files to Modify

### `backend/app/api/reconstruction.py`
**What changes:** Wire the vector endpoints to the new typed models.
**Lines affected:** the current `/vectors` read/write handlers.

### `backend/app/services/reconstruction_service.py`
**What changes:** Use the new DTOs when loading and saving vector data.
**Lines affected:** `get_vectorization_data()` and `update_vectorization_data()`.

### `frontend/src/api/apiService.ts`
**What changes:** Replace `unknown` vector helper types with the new interfaces.
**Lines affected:** `getReconstructionVectors()` and `updateVectorizationData()`.

## Verification
- [ ] `python -m py_compile backend/app/models/reconstruction_vectors.py` passes
- [ ] `python -m pytest backend/tests/services/test_reconstruction_service.py -v` passes after later phases
- [ ] Vector DTO field names match the current stored JSON shape
- [ ] No frontend `any` introduced
