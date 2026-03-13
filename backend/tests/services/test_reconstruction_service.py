import pytest
import numpy as np
import cv2
from unittest.mock import AsyncMock, MagicMock
from app.services.reconstruction_service import ReconstructionService


@pytest.mark.asyncio
async def test_build_mesh_valid_inputs_returns_done_reconstruction(tmp_path):
    (tmp_path / "masks").mkdir()
    (tmp_path / "models").mkdir()
    mask = np.zeros((100, 100), dtype=np.uint8)
    cv2.rectangle(mask, (10, 10), (90, 90), 255, thickness=5)
    cv2.imwrite(str(tmp_path / "masks" / "mask-id.png"), mask)

    repo = AsyncMock()
    repo.create_reconstruction.return_value = MagicMock(id=1)
    repo.update_mesh.return_value = MagicMock(id=1, status=3)

    svc = ReconstructionService(repo=repo, upload_dir=str(tmp_path))
    result = await svc.build_mesh("plan-id", "mask-id", user_id=1)
    assert result.status == 3, "On successful generation status must be 3 (Done)"
    repo.update_mesh.assert_called_once()


@pytest.mark.asyncio
async def test_build_mesh_missing_mask_returns_error_status(tmp_path):
    (tmp_path / "models").mkdir()
    repo = AsyncMock()
    repo.create_reconstruction.return_value = MagicMock(id=1)
    repo.update_mesh.return_value = MagicMock(id=1, status=4)
    svc = ReconstructionService(repo=repo, upload_dir=str(tmp_path))
    result = await svc.build_mesh("plan-id", "mask-id", user_id=1)
    assert result.status == 4, "On missing mask status must be 4 (Error)"
    repo.update_mesh.assert_called_once()


@pytest.mark.asyncio
async def test_save_reconstruction_valid_id_updates_name():
    repo = AsyncMock()
    # 'name' is a special MagicMock param — set attribute after creation
    mock_rec = MagicMock(id=5)
    mock_rec.name = "My Plan"
    repo.update_name.return_value = mock_rec
    svc = ReconstructionService(repo=repo, upload_dir="/tmp")
    result = await svc.save_reconstruction(5, "My Plan")
    assert result is not None
    assert result.name == "My Plan"


@pytest.mark.asyncio
async def test_save_reconstruction_missing_id_returns_none():
    repo = AsyncMock()
    repo.update_name.return_value = None
    svc = ReconstructionService(repo=repo, upload_dir="/tmp")
    result = await svc.save_reconstruction(99999, "Test")
    assert result is None
