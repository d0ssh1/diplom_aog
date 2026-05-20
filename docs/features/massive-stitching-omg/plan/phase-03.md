# Phase 3: Transition APIs

phase: 3
layer: api
depends_on: [phase-02]
design: ../README.md

## Goal
Expose transition CRUD endpoints and a dedicated multi-plan route endpoint through FastAPI.

## Context
Phase 2 provides the transition service and repository behavior. This phase wires those behaviors into HTTP endpoints.

## Files to Create

### `backend/app/api/transitions.py`
**Purpose:** CRUD endpoints for transition groups and points.
**Implementation details:**
- Keep the router thin: validate input, call service, return response models.
- Use dependency injection for service access.
- Return explicit request/response shapes from Phase 1.

## Files to Modify

### `backend/app/api/navigation.py`
**What changes:** Replace the stub route endpoint with the multi-plan route endpoint.

### `backend/app/api/__init__.py`
**What changes:** Register the new transitions router.

### `backend/app/api/deps.py`
**What changes:** Add repository and service providers for transitions.

## Verification
- [ ] `python -m py_compile backend/app/api/transitions.py` passes
- [ ] API router remains thin and contains no business logic
- [ ] HTTP status codes match the API contract
- [ ] Multi-plan route endpoint returns the documented response shapes
