# Phase 14: Integration

phase: 14
layer: full-stack
depends_on: all
design: ../README.md

## Goal

End-to-end integration testing and final verification of the complete stitching feature.

## Context

**Depends on all previous phases (1-13).**

This phase ensures all components work together correctly.

## Tasks

### 1. Backend Integration

**Verify full pipeline:**

```bash
# Start backend
cd backend
uvicorn app.main:app --reload

# Check Swagger docs
# Open http://localhost:8000/docs
# Verify /api/v1/stitching/ endpoint is listed
```

**Manual API test:**

```bash
# Create test request
curl -X POST http://localhost:8000/api/v1/stitching/ \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer {token}" \
  -d '{
    "name": "Test Merge",
    "building_id": "test-building-uuid",
    "floor_number": 1,
    "source_plans": [
      {
        "reconstruction_id": "1",
        "transform": {
          "translate_x": 0,
          "translate_y": 0,
          "scale_x": 1.0,
          "scale_y": 1.0,
          "rotation_deg": 0
        },
        "clip_polygons": [],
        "rect_crop": null,
        "image_width_px": 1000,
        "image_height_px": 800,
        "z_index": 0
      },
      {
        "reconstruction_id": "2",
        "transform": {
          "translate_x": 500,
          "translate_y": 0,
          "scale_x": 1.0,
          "scale_y": 1.0,
          "rotation_deg": 0
        },
        "clip_polygons": [],
        "rect_crop": null,
        "image_width_px": 1000,
        "image_height_px": 800,
        "z_index": 1
      }
    ]
  }'

# Expected: 201 Created with StitchingResponse
```

### 2. Frontend Integration

**Verify UI flow:**

```bash
# Start frontend
cd frontend
npm start

# Open http://localhost:3000/stitching
```

**Manual UI test:**
1. Navigate to /stitching
2. Select building + floor
3. Select ≥2 plans
4. Click "> Далее"
5. Verify canvas loads with plans
6. Move plan → verify transform updates
7. Rotate plan → verify angle updates
8. Apply polygon clip → verify clip applied
9. Click "> СШИТЬ"
10. Enter name
11. Verify redirect to new reconstruction
12. Verify merged model has all rooms

### 3. End-to-End Test

**Create E2E test script:**

```python
# backend/tests/e2e/test_stitching_e2e.py

import pytest
from httpx import AsyncClient
from app.main import app

@pytest.mark.asyncio
async def test_full_stitching_workflow(client: AsyncClient, db_session):
    """
    Full workflow:
    1. Create 2 reconstructions with rooms
    2. POST /stitching/ to merge
    3. GET /reconstructions/{id} to verify merged
    4. Verify vectorization_data has all rooms
    """
    # Arrange: Create 2 reconstructions
    recon_a = await create_reconstruction(
        db_session,
        name="Plan A",
        rooms=["A301", "A302"],
        walls=[...],
    )
    recon_b = await create_reconstruction(
        db_session,
        name="Plan B",
        rooms=["A303", "A304"],
        walls=[...],
    )

    # Act: Stitch
    request = {
        "name": "Merged Floor 3",
        "building_id": "building-uuid",
        "floor_number": 3,
        "source_plans": [
            {
                "reconstruction_id": str(recon_a.id),
                "transform": {
                    "translate_x": 0,
                    "translate_y": 0,
                    "scale_x": 1.0,
                    "scale_y": 1.0,
                    "rotation_deg": 0,
                },
                "clip_polygons": [],
                "rect_crop": None,
                "image_width_px": 1000,
                "image_height_px": 800,
                "z_index": 0,
            },
            {
                "reconstruction_id": str(recon_b.id),
                "transform": {
                    "translate_x": 500,
                    "translate_y": 0,
                    "scale_x": 1.0,
                    "scale_y": 1.0,
                    "rotation_deg": 0,
                },
                "clip_polygons": [],
                "rect_crop": None,
                "image_width_px": 1000,
                "image_height_px": 800,
                "z_index": 1,
            },
        ],
    }

    response = await client.post("/api/v1/stitching/", json=request)

    # Assert: Response
    assert response.status_code == 201
    data = response.json()
    assert data["name"] == "Merged Floor 3"
    assert data["rooms_count"] == 4
    assert len(data["source_reconstruction_ids"]) == 2

    # Assert: DB
    merged_recon = await db_session.get(Reconstruction, data["id"])
    assert merged_recon is not None

    vectorization = json.loads(merged_recon.vectorization_data)
    assert len(vectorization["rooms"]) == 4

    room_names = {r["name"] for r in vectorization["rooms"]}
    assert room_names == {"A301", "A302", "A303", "A304"}

    # Assert: All coordinates in [0, 1]
    for room in vectorization["rooms"]:
        assert 0.0 <= room["center"]["x"] <= 1.0
        assert 0.0 <= room["center"]["y"] <= 1.0
```

**Reference:** 04-testing.md "Critical End-to-End Tests"

### 4. Performance Test

**Test with large plans:**

```python
@pytest.mark.asyncio
async def test_stitching_performance_large_plans(client: AsyncClient, db_session):
    """
    Test stitching with large plans (1000+ walls each).
    Should complete in <15 seconds.
    """
    import time

    # Create 2 large reconstructions
    recon_a = await create_large_reconstruction(db_session, walls_count=1000)
    recon_b = await create_large_reconstruction(db_session, walls_count=1000)

    request = create_stitching_request([recon_a.id, recon_b.id])

    start = time.time()
    response = await client.post("/api/v1/stitching/", json=request)
    elapsed = time.time() - start

    assert response.status_code == 201
    assert elapsed < 15.0, f"Stitching took {elapsed:.2f}s (expected <15s)"
```

### 5. Error Handling Test

**Test all error cases:**

```python
@pytest.mark.asyncio
async def test_stitching_error_cases(client: AsyncClient):
    """Test all error responses match API contract."""

    # 400: Less than 2 plans
    response = await client.post("/api/v1/stitching/", json={
        "name": "Test",
        "building_id": "uuid",
        "floor_number": 1,
        "source_plans": [{"reconstruction_id": "1", ...}],  # Only 1 plan
    })
    assert response.status_code == 400
    assert "at least 2" in response.json()["detail"].lower()

    # 404: Source not found
    response = await client.post("/api/v1/stitching/", json={
        "name": "Test",
        "building_id": "uuid",
        "floor_number": 1,
        "source_plans": [
            {"reconstruction_id": "nonexistent", ...},
            {"reconstruction_id": "also-nonexistent", ...},
        ],
    })
    assert response.status_code == 404
    assert "not found" in response.json()["detail"].lower()

    # 422: Invalid transform (scale = 0)
    response = await client.post("/api/v1/stitching/", json={
        "name": "Test",
        "building_id": "uuid",
        "floor_number": 1,
        "source_plans": [
            {"reconstruction_id": "1", "transform": {"scale_x": 0, ...}, ...},
            {"reconstruction_id": "2", ...},
        ],
    })
    assert response.status_code == 422
```

## Verification Checklist

### Backend
- [ ] All 51 tests pass: `pytest backend/tests/ -v`
- [ ] Linting passes: `flake8 backend/app/`
- [ ] Type checking passes: `mypy backend/app/`
- [ ] Swagger docs show /api/v1/stitching/ endpoint
- [ ] Manual API test succeeds (201 response)
- [ ] Error responses match 05-api-contract.md

### Frontend
- [ ] TypeScript compiles: `npx tsc --noEmit`
- [ ] No console errors in browser
- [ ] /stitching route accessible
- [ ] Step 1 → Step 2 navigation works
- [ ] Canvas loads plans
- [ ] Transformations update in real-time
- [ ] Undo/redo works
- [ ] Submit succeeds and redirects
- [ ] Styling matches existing pages

### Integration
- [ ] E2E test passes
- [ ] Performance test passes (<15s for large plans)
- [ ] All error cases tested
- [ ] Room names preserved after merge
- [ ] Door positions match walls after transform
- [ ] All coordinates in [0, 1] after normalization

### Documentation
- [ ] All design docs in `docs/features/stitching-plans/`
- [ ] All phase files in `docs/features/stitching-plans/plan/`
- [ ] README.md updated with feature description
- [ ] API contract matches implementation

## Final Steps

1. **Commit all changes:**
   ```bash
   git add .
   git commit -m "feat(stitching): implement plan stitching feature

   - Add processing functions for affine transforms, clipping, merging
   - Add stitching service and API endpoint
   - Add frontend canvas editor with Fabric.js
   - Add two-step workflow (selection + positioning)
   - Add undo/redo with snapshot-based history
   - Add 51 tests (processing, service, API)
   - All tests passing, lint clean

   Closes #06-shivanie-planov"
   ```

2. **Create PR:**
   - Title: "feat(stitching): Plan stitching feature"
   - Description: Link to design docs, list acceptance criteria met
   - Request review

3. **Update requirements.txt:**
   ```bash
   cd backend
   pip freeze > requirements.txt
   ```

4. **Update CHANGELOG.md** (if exists):
   ```markdown
   ## [Unreleased]
   ### Added
   - Plan stitching feature: merge multiple floor plans into unified model
   - Canvas-based positioning editor with Fabric.js
   - Affine transformations (scale, rotate, translate)
   - Polygon clipping for overlap removal
   - Undo/redo with 50-step history
   ```

## Success Criteria Met

All acceptance criteria from `../README.md`:

- [x] User can select ≥2 ready reconstructions
- [x] User can position plans on canvas (move, rotate, scale)
- [x] User can crop overlap zones (rect + polygon)
- [x] System merges vector models with transforms
- [x] System creates new reconstruction with merged model
- [x] All coordinates normalized to [0,1]
- [x] System warns about duplicate rooms
- [x] Stitched reconstruction available for 3D + navigation

**Feature complete and ready for production.**
