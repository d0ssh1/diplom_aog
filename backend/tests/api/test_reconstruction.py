import pytest
from unittest.mock import AsyncMock, MagicMock
from datetime import datetime

from main import app
from app.api.deps import get_reconstruction_service, get_mask_service


def _make_mock_reconstruction(id=1, name="Test", status=3):
    r = MagicMock()
    r.id = id
    r.name = name
    r.status = status
    r.created_at = datetime.utcnow()
    r.created_by = 1
    r.error_message = None
    r.mesh_file_id_glb = None
    r.mesh_file_id_obj = None
    return r


@pytest.mark.asyncio
async def test_get_reconstructions_without_auth_returns_403(client):
    response = await client.get("/api/v1/reconstruction/reconstructions")
    assert response.status_code in (401, 403)


@pytest.mark.asyncio
async def test_get_reconstructions_with_auth_returns_200(client, auth_headers):
    mock_svc = AsyncMock()
    mock_svc.get_saved_reconstructions.return_value = []
    mock_svc.build_mesh_url.return_value = None

    app.dependency_overrides[get_reconstruction_service] = lambda: mock_svc
    try:
        response = await client.get(
            "/api/v1/reconstruction/reconstructions",
            headers=auth_headers,
        )
        assert response.status_code == 200
        assert isinstance(response.json(), list)
    finally:
        app.dependency_overrides.pop(get_reconstruction_service, None)


@pytest.mark.asyncio
async def test_get_reconstruction_by_id_existing_returns_200(client, auth_headers):
    from unittest.mock import patch, MagicMock
    mock_rec = _make_mock_reconstruction(id=42)
    mock_svc = AsyncMock()
    mock_svc.get_reconstruction.return_value = mock_rec
    # get_status_display and build_mesh_url are synchronous — must not be coroutines
    mock_svc.get_status_display = MagicMock(return_value="Готово")
    mock_svc.build_mesh_url = MagicMock(return_value=None)

    app.dependency_overrides[get_reconstruction_service] = lambda: mock_svc
    try:
        response = await client.get(
            "/api/v1/reconstruction/reconstructions/42",
            headers=auth_headers,
        )
        assert response.status_code == 200
        assert response.json()["id"] == 42
    finally:
        app.dependency_overrides.pop(get_reconstruction_service, None)


@pytest.mark.asyncio
async def test_get_reconstruction_by_id_missing_returns_404(client, auth_headers):
    mock_svc = AsyncMock()
    mock_svc.get_reconstruction.return_value = None

    app.dependency_overrides[get_reconstruction_service] = lambda: mock_svc
    try:
        response = await client.get(
            "/api/v1/reconstruction/reconstructions/99999",
            headers=auth_headers,
        )
        assert response.status_code == 404
    finally:
        app.dependency_overrides.pop(get_reconstruction_service, None)


@pytest.mark.asyncio
async def test_post_initial_masks_without_auth_returns_403(client):
    response = await client.post(
        "/api/v1/reconstruction/initial-masks",
        json={"file_id": "some-id"},
    )
    assert response.status_code in (401, 403)


@pytest.mark.asyncio
async def test_post_initial_masks_with_auth_returns_200(client, auth_headers):
    mock_svc = AsyncMock()
    mock_svc.calculate_mask.return_value = "some-id.png"

    app.dependency_overrides[get_mask_service] = lambda: mock_svc
    try:
        response = await client.post(
            "/api/v1/reconstruction/initial-masks",
            json={"file_id": "some-id"},
            headers=auth_headers,
        )
        assert response.status_code == 200
        data = response.json()
        assert data["id"] == "some-id"
    finally:
        app.dependency_overrides.pop(get_mask_service, None)


@pytest.mark.asyncio
async def test_post_reconstructions_without_auth_returns_403(client):
    response = await client.post(
        "/api/v1/reconstruction/reconstructions",
        json={"plan_file_id": "p-id", "user_mask_file_id": "m-id"},
    )
    assert response.status_code in (401, 403)


@pytest.mark.asyncio
async def test_delete_reconstruction_missing_id_returns_404(client, auth_headers):
    mock_svc = AsyncMock()
    mock_svc.delete_reconstruction.return_value = False

    app.dependency_overrides[get_reconstruction_service] = lambda: mock_svc
    try:
        response = await client.delete(
            "/api/v1/reconstruction/reconstructions/99999",
            headers=auth_headers,
        )
        assert response.status_code == 404
    finally:
        app.dependency_overrides.pop(get_reconstruction_service, None)
