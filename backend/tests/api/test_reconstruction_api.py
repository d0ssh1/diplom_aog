import json
import pytest
from unittest.mock import AsyncMock, MagicMock
from datetime import datetime

from main import app
from app.api.deps import get_reconstruction_service
from app.models.domain import VectorizationResult


def _minimal_vectorization_result() -> VectorizationResult:
    return VectorizationResult(
        walls=[],
        rooms=[],
        doors=[],
        text_blocks=[],
        image_size_original=(800, 600),
        image_size_cropped=(800, 600),
    )


def _make_mock_svc(vectorization_result=None, update_result=None):
    svc = AsyncMock()
    svc.get_vectorization_data.return_value = vectorization_result
    svc.update_vectorization_data.return_value = update_result
    svc.get_status_display = MagicMock(return_value="Готово")
    svc.build_mesh_url = MagicMock(return_value=None)
    return svc


# --- GET /reconstructions/{id}/vectors ---

@pytest.mark.asyncio
async def test_get_vectors_success(client, auth_headers):
    mock_svc = _make_mock_svc(vectorization_result=_minimal_vectorization_result())
    app.dependency_overrides[get_reconstruction_service] = lambda: mock_svc
    try:
        response = await client.get(
            "/api/v1/reconstruction/reconstructions/1/vectors",
            headers=auth_headers,
        )
        assert response.status_code == 200
        data = response.json()
        assert data["image_size_original"] == [800, 600]
        assert "walls" in data
    finally:
        app.dependency_overrides.pop(get_reconstruction_service, None)


@pytest.mark.asyncio
async def test_get_vectors_not_found(client, auth_headers):
    mock_svc = _make_mock_svc(vectorization_result=None)
    app.dependency_overrides[get_reconstruction_service] = lambda: mock_svc
    try:
        response = await client.get(
            "/api/v1/reconstruction/reconstructions/99/vectors",
            headers=auth_headers,
        )
        assert response.status_code == 404
    finally:
        app.dependency_overrides.pop(get_reconstruction_service, None)


# --- PUT /reconstructions/{id}/vectors ---

@pytest.mark.asyncio
async def test_put_vectors_success(client, auth_headers):
    mock_rec = MagicMock()
    mock_rec.id = 1
    mock_svc = _make_mock_svc(update_result=mock_rec)
    app.dependency_overrides[get_reconstruction_service] = lambda: mock_svc
    try:
        payload = _minimal_vectorization_result().model_dump()
        response = await client.put(
            "/api/v1/reconstruction/reconstructions/1/vectors",
            headers=auth_headers,
            json=payload,
        )
        assert response.status_code == 200
        assert response.json()["message"] == "Vectorization data updated"
    finally:
        app.dependency_overrides.pop(get_reconstruction_service, None)


@pytest.mark.asyncio
async def test_put_vectors_not_found(client, auth_headers):
    mock_svc = _make_mock_svc(update_result=None)
    app.dependency_overrides[get_reconstruction_service] = lambda: mock_svc
    try:
        payload = _minimal_vectorization_result().model_dump()
        response = await client.put(
            "/api/v1/reconstruction/reconstructions/99/vectors",
            headers=auth_headers,
            json=payload,
        )
        assert response.status_code == 404
    finally:
        app.dependency_overrides.pop(get_reconstruction_service, None)
