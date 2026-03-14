import json
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from app.services.reconstruction_service import ReconstructionService, STATUS_DISPLAY
from app.models.domain import VectorizationResult


# --- Helpers ---

def _make_svc() -> ReconstructionService:
    repo = AsyncMock()
    with patch("app.services.reconstruction_service.os.makedirs"):
        with patch("app.services.reconstruction_service.ContourService"):
            svc = ReconstructionService(repo=repo, upload_dir="/tmp/fake")
    svc._repo = repo
    return svc


def _minimal_vectorization_dict() -> dict:
    return {
        "walls": [],
        "rooms": [],
        "doors": [],
        "text_blocks": [],
        "image_size_original": [800, 600],
        "image_size_cropped": [800, 600],
        "crop_rect": None,
        "crop_applied": False,
        "rotation_angle": 0,
        "wall_thickness_px": 5.0,
        "estimated_pixels_per_meter": 50.0,
        "rooms_with_names": 0,
        "corridors_count": 0,
        "doors_count": 0,
    }


# --- get_vectorization_data ---

@pytest.mark.asyncio
async def test_get_vectorization_data_found():
    svc = _make_svc()
    mock_rec = MagicMock()
    mock_rec.vectorization_data = json.dumps(_minimal_vectorization_dict())
    svc._repo.get_by_id.return_value = mock_rec

    result = await svc.get_vectorization_data(1)

    assert isinstance(result, VectorizationResult)
    assert result.image_size_original == (800, 600)


@pytest.mark.asyncio
async def test_get_vectorization_data_not_found():
    svc = _make_svc()
    svc._repo.get_by_id.return_value = None

    result = await svc.get_vectorization_data(99)

    assert result is None


@pytest.mark.asyncio
async def test_get_vectorization_data_invalid_json():
    svc = _make_svc()
    mock_rec = MagicMock()
    mock_rec.vectorization_data = "not valid json {"
    svc._repo.get_by_id.return_value = mock_rec

    result = await svc.get_vectorization_data(1)

    assert result is None


# --- update_vectorization_data ---

@pytest.mark.asyncio
async def test_update_vectorization_data_success():
    svc = _make_svc()
    mock_rec = MagicMock()
    svc._repo.update_vectorization_data.return_value = mock_rec

    vr = VectorizationResult(**_minimal_vectorization_dict())
    result = await svc.update_vectorization_data(1, vr)

    assert result is mock_rec
    call_args = svc._repo.update_vectorization_data.call_args
    # first arg is reconstruction_id, second is the JSON string
    assert call_args[0][0] == 1
    saved = json.loads(call_args[0][1])
    assert saved["image_size_original"] == [800, 600]


@pytest.mark.asyncio
async def test_update_vectorization_data_not_found():
    svc = _make_svc()
    svc._repo.update_vectorization_data.return_value = None

    vr = VectorizationResult(**_minimal_vectorization_dict())
    result = await svc.update_vectorization_data(99, vr)

    assert result is None


# --- get_status_display ---

def test_get_status_display_known():
    assert ReconstructionService.get_status_display(1) == STATUS_DISPLAY[1]
    assert ReconstructionService.get_status_display(2) == STATUS_DISPLAY[2]
    assert ReconstructionService.get_status_display(3) == STATUS_DISPLAY[3]
    assert ReconstructionService.get_status_display(4) == STATUS_DISPLAY[4]


def test_get_status_display_unknown():
    assert ReconstructionService.get_status_display(999) == "Неизвестно"


# --- build_mesh_url ---

def test_build_mesh_url_with_glb():
    svc = _make_svc()
    rec = MagicMock()
    rec.id = 7
    rec.mesh_file_id_glb = "some-glb-id"

    url = svc.build_mesh_url(rec)

    assert url == "/api/v1/uploads/models/reconstruction_7.glb"


def test_build_mesh_url_without_glb():
    svc = _make_svc()
    rec = MagicMock()
    rec.mesh_file_id_glb = None

    url = svc.build_mesh_url(rec)

    assert url is None
