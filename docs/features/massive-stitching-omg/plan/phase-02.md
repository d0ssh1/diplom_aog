# Phase 2: Transition processing and routing

phase: 2
layer: processing | service
depends_on: [phase-01]
design: ../README.md

## Goal
Implement the graph-composition helpers and service orchestration needed to validate, store, and route across transition points.

## Context
Phase 1 defines the transition ORM and Pydantic contracts. This phase consumes those types and the existing per-plan nav graph storage format.

## Files to Create

### `backend/app/processing/multi_plan_graph.py`
**Purpose:** Pure helpers for super-graph assembly and multi-plan route search.
**Implementation details:**
- Load and combine multiple per-plan nav graphs.
- Prefix node IDs to avoid collisions.
- Snap transition points to reachable nodes.
- Return a structured multi-plan route result.
- Keep the module free of DB and HTTP imports.

### `backend/app/services/transition_service.py`
**Purpose:** Orchestrate CRUD validation, graph reachability checks, and route building.
**Implementation details:**
- Validate that reconstructions and groups exist before creating points.
- Reject points that cannot snap to a reachable node.
- Delegate persistence to a repository.
- Delegate route assembly to processing helpers.

### `backend/app/db/repositories/transition_repo.py`
**Purpose:** Persist and query transition groups and points.
**Implementation details:**
- Mirror the async commit/refresh pattern used by `ReconstructionRepository`.
- Provide read helpers for reconstruction- and building-scoped point queries.

## Files to Modify

### `backend/app/services/nav_service.py`
**What changes:** Expose a multi-plan route entrypoint or delegate to the new transition service.

## Verification
- [ ] `python -m py_compile backend/app/processing/multi_plan_graph.py` passes
- [ ] `python -m py_compile backend/app/services/transition_service.py` passes
- [ ] `python -m py_compile backend/app/db/repositories/transition_repo.py` passes
- [ ] Processing helpers remain pure and do not import API or DB modules
- [ ] Route search returns a structured no-path result when needed
