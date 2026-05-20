import json
import pytest
from unittest.mock import AsyncMock, MagicMock

from app.services.reconstruction_service import ReconstructionService, STATUS_DISPLAY
from app.models.domain import VectorizationResult


def _make_svc() -> ReconstructionService:
    repo = AsyncMock()
    storage = AsyncMock()
    return ReconstructionService(repo=repo, storage=storage)


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


@pytest.mark.asyncio
async def test_get_vectorization_data_returns_vector_model():
    svc = _make_svc()
    mock_rec = MagicMock()
    mock_rec.vectorization_data = json.dumps(_minimal_vectorization_dict())
    svc._repo.get_by_id.return_value = mock_rec

    result = await svc.get_vectorization_data(1)

    assert result is not None
    assert result.model_dump()["rooms"] == []
    assert result.rotation_angle == 0


@pytest.mark.asyncio
async def test_get_vectorization_data_invalid_json_returns_none():
    svc = _make_svc()
    mock_rec = MagicMock()
    mock_rec.vectorization_data = "not valid json"
    svc._repo.get_by_id.return_value = mock_rec

    result = await svc.get_vectorization_data(1)

    assert result is None


@pytest.mark.asyncio
async def test_update_vectorization_data_saves_json():
    svc = _make_svc()
    svc._repo.update_vectorization_data.return_value = MagicMock()
    vr = VectorizationResult(**_minimal_vectorization_dict())

    result = await svc.update_vectorization_data(1, vr)

    assert result is True
    saved = json.loads(svc._repo.update_vectorization_data.call_args[0][1])
    assert saved["image_size_original"] == [800, 600]
