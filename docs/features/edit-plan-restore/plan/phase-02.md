# Phase 2: Preserve vector payloads in backend

phase: 2
layer: service
depends_on: [phase-01]
design: ../README.md

## Goal
Make the backend read and write the edit-plan vector payload using the typed schema without flattening room geometry.

## Context
Phase 1 defines the canonical DTOs. This phase connects those DTOs to the actual reconstruction service and API boundary.

## Files to Modify

### `backend/app/services/reconstruction_service.py`
**What changes:**
- Deserialize stored vector JSON into the new typed vector model.
- Serialize vector data back to JSON without rewriting room geometry.
- Keep legacy fallback behavior for old records where needed.

### `backend/app/api/reconstruction.py`
**What changes:**
- Return typed vector data from the `/vectors` GET endpoint.
- Accept typed vector payloads in the `/vectors` PUT endpoint.
- Keep error responses aligned with existing reconstruction API conventions.

### `backend/app/db/models/reconstruction.py` if needed
**What changes:**
- Only if the current ORM field typing or comments need to reflect the vector payload contract.

## Verification
- [ ] `python -m pytest backend/tests/api/test_reconstruction_vectors_api.py -v` passes after tests are added
- [ ] `python -m pytest backend/tests/services/test_reconstruction_service.py -v` passes after tests are added
- [ ] Stored vector JSON round-trips without changing room polygons
- [ ] API rejects invalid payloads with validation errors
