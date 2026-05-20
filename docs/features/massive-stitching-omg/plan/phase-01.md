# Phase 1: Domain and persistence

phase: 1
layer: models | db
depends_on: none
design: ../README.md

## Goal
Define the persistent transition entities and the API/domain contracts needed to represent transition groups, transition points, and multi-plan route responses.

## Files to Create

### `backend/app/db/models/transition.py`
**Purpose:** ORM tables for transition groups and transition points.
**Implementation details:**
- Group rows represent the logical connector across multiple plans.
- Point rows store normalized coordinates in `[0,1]` and belong to exactly one group and one reconstruction.
- Use SQLAlchemy relationships consistent with existing ORM style in `backend/app/db/models/reconstruction.py`.

### `backend/app/models/transition.py`
**Purpose:** Pydantic request and response schemas for transition CRUD and multi-plan routing.
**Implementation details:**
- Include create/update/response models for groups and points.
- Include route request and route response models with route segments.
- Keep coordinates typed and normalized where applicable.

### `backend/app/tests` files
**Tests from 04-testing.md to implement here:**
- None in this phase; contract and ORM definitions are validated by later service/API tests.

## Files to Modify

### `backend/app/db/models/__init__.py`
**What changes:** Export transition ORM models.

### `backend/app/models/__init__.py`
**What changes:** Export transition Pydantic models if the package exposes model symbols.

## Verification
- [ ] `python -m py_compile backend/app/db/models/transition.py` passes
- [ ] `python -m py_compile backend/app/models/transition.py` passes
- [ ] ORM relationship names match existing SQLAlchemy patterns
- [ ] Transition point coordinate fields are normalized `[0,1]`
