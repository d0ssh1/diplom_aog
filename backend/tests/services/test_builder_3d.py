import numpy as np
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from app.core.exceptions import FileStorageError, ImageProcessingError
from app.db.models.reconstruction import Reconstruction
from app.models.domain import Point2D, Room, VectorizationResult, Wall
from app.services.reconstruction_service import ReconstructionService


# --- Helpers ---

def _make_svc() -> ReconstructionService:
    repo = AsyncMock()
    with patch("app.services.reconstruction_service.os.makedirs"):
        with patch("app.services.reconstruction_service.ContourService"):
            svc = ReconstructionService(repo=repo, upload_dir="/tmp/fake")
    svc._repo = repo
    return svc


def _make_reconstruction(status: int = 2) -> MagicMock:
    rec = MagicMock(spec=Reconstruction)
    rec.id = 1
    rec.status = status
    return rec


_PIPELINE_PATCHES = [
    ("app.services.reconstruction_service.ContourService.extract_elements", [], {}),
    ("app.services.reconstruction_service.compute_wall_thickness", 5.0, {}),
    ("app.services.reconstruction_service.room_detect", [], {}),
    ("app.services.reconstruction_service.classify_rooms", [], {}),
    ("app.services.reconstruction_service.door_detect", [], {}),
    ("app.services.reconstruction_service.normalize_coords", ([], [], []), {}),
    ("app.services.reconstruction_service.compute_scale_factor", 50.0, {}),
    ("app.services.reconstruction_service.assign_room_numbers", [], {}),
    ("app.services.reconstruction_service.os.path.exists", False, {}),
]


# --- Tests ---

@pytest.mark.asyncio
async def test_build_mesh_success_sets_status_3():
    # Arrange
    svc = _make_svc()

    rec_processing = _make_reconstruction(status=2)
    rec_done = _make_reconstruction(status=3)

    svc._repo.create_reconstruction.return_value = rec_processing
    svc._repo.update_vectorization_data.return_value = rec_processing
    svc._repo.update_mesh.return_value = rec_done

    fake_mask = np.zeros((200, 200), dtype=np.uint8)
    fake_mesh = MagicMock()

    with patch("app.services.reconstruction_service.glob.glob", return_value=["/tmp/fake/masks/mask.png"]), \
         patch("app.services.reconstruction_service.cv2.imread", return_value=fake_mask), \
         patch("app.services.reconstruction_service.os.path.exists", return_value=False), \
         patch("app.services.reconstruction_service.ContourService.extract_elements", return_value=[]), \
         patch("app.services.reconstruction_service.compute_wall_thickness", return_value=5.0), \
         patch("app.services.reconstruction_service.room_detect", return_value=[]), \
         patch("app.services.reconstruction_service.classify_rooms", return_value=[]), \
         patch("app.services.reconstruction_service.door_detect", return_value=[]), \
         patch("app.services.reconstruction_service.normalize_coords", return_value=([], [], [])), \
         patch("app.services.reconstruction_service.compute_scale_factor", return_value=50.0), \
         patch("app.services.reconstruction_service.build_mesh_from_vectorization", return_value=fake_mesh):

        # Act
        result = await svc.build_mesh("plan_id", "mask_id", user_id=1)

    # Assert
    assert result.status == 3
    fake_mesh.export.assert_called()


@pytest.mark.asyncio
async def test_build_mesh_mask_not_found_sets_status_4():
    # Arrange
    svc = _make_svc()

    rec_processing = _make_reconstruction(status=2)
    rec_error = _make_reconstruction(status=4)

    svc._repo.create_reconstruction.return_value = rec_processing
    svc._repo.update_mesh.return_value = rec_error

    with patch("app.services.reconstruction_service.glob.glob", return_value=[]):
        # Act
        result = await svc.build_mesh("plan_id", "missing_mask_id", user_id=1)

    # Assert
    assert result.status == 4
    svc._repo.update_mesh.assert_called_once_with(
        rec_processing.id, None, None, status=4, error_message="Ошибка построения модели"
    )


@pytest.mark.asyncio
async def test_build_mesh_processing_error_sets_status_4():
    # Arrange
    svc = _make_svc()

    rec_processing = _make_reconstruction(status=2)
    rec_error = _make_reconstruction(status=4)

    svc._repo.create_reconstruction.return_value = rec_processing
    svc._repo.update_vectorization_data.return_value = rec_processing
    svc._repo.update_mesh.return_value = rec_error

    fake_mask = np.zeros((200, 200), dtype=np.uint8)

    with patch("app.services.reconstruction_service.glob.glob", return_value=["/tmp/fake/masks/mask.png"]), \
         patch("app.services.reconstruction_service.cv2.imread", return_value=fake_mask), \
         patch("app.services.reconstruction_service.os.path.exists", return_value=False), \
         patch("app.services.reconstruction_service.ContourService.extract_elements", return_value=[]), \
         patch("app.services.reconstruction_service.compute_wall_thickness", return_value=5.0), \
         patch("app.services.reconstruction_service.room_detect", return_value=[]), \
         patch("app.services.reconstruction_service.classify_rooms", return_value=[]), \
         patch("app.services.reconstruction_service.door_detect", return_value=[]), \
         patch("app.services.reconstruction_service.normalize_coords", return_value=([], [], [])), \
         patch("app.services.reconstruction_service.compute_scale_factor", return_value=50.0), \
         patch(
             "app.services.reconstruction_service.build_mesh_from_vectorization",
             side_effect=ImageProcessingError(
                 "build_mesh_from_vectorization", "No walls in VectorizationResult"
             ),
         ):

        # Act
        result = await svc.build_mesh("plan_id", "mask_id", user_id=1)

    # Assert
    assert result.status == 4
    svc._repo.update_mesh.assert_called_once_with(
        rec_processing.id, None, None, status=4, error_message="Ошибка построения модели"
    )


@pytest.mark.asyncio
async def test_build_mesh_uses_default_floor_height_3m():
    # Arrange
    svc = _make_svc()

    rec_processing = _make_reconstruction(status=2)
    rec_done = _make_reconstruction(status=3)

    svc._repo.create_reconstruction.return_value = rec_processing
    svc._repo.update_vectorization_data.return_value = rec_processing
    svc._repo.update_mesh.return_value = rec_done

    fake_mask = np.zeros((200, 200), dtype=np.uint8)
    fake_mesh = MagicMock()
    mock_build = MagicMock(return_value=fake_mesh)

    with patch("app.services.reconstruction_service.glob.glob", return_value=["/tmp/fake/masks/mask.png"]), \
         patch("app.services.reconstruction_service.cv2.imread", return_value=fake_mask), \
         patch("app.services.reconstruction_service.os.path.exists", return_value=False), \
         patch("app.services.reconstruction_service.ContourService.extract_elements", return_value=[]), \
         patch("app.services.reconstruction_service.compute_wall_thickness", return_value=5.0), \
         patch("app.services.reconstruction_service.room_detect", return_value=[]), \
         patch("app.services.reconstruction_service.classify_rooms", return_value=[]), \
         patch("app.services.reconstruction_service.door_detect", return_value=[]), \
         patch("app.services.reconstruction_service.normalize_coords", return_value=([], [], [])), \
         patch("app.services.reconstruction_service.compute_scale_factor", return_value=50.0), \
         patch("app.services.reconstruction_service.build_mesh_from_vectorization", mock_build):

        # Act
        await svc.build_mesh("plan_id", "mask_id", user_id=1)

    # Assert
    mock_build.assert_called_once()
    _, kwargs = mock_build.call_args
    assert kwargs.get("floor_height") == 3.0, (
        f"Expected floor_height=3.0, got {kwargs.get('floor_height')}"
    )
