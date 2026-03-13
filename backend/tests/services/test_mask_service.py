import os
import tempfile
import shutil
import pytest
import numpy as np
import cv2
from app.services.mask_service import MaskService
from app.core.exceptions import FileStorageError


@pytest.fixture
def ascii_tmp_dir():
    """Provide a temp directory with ASCII-only path (avoids cv2.imread Unicode issues on Windows)."""
    base = tempfile.gettempdir()
    # Use a simple ASCII path under the system temp dir
    dirpath = os.path.join(base, "diplom_tests_mask")
    os.makedirs(os.path.join(dirpath, "plans"), exist_ok=True)
    os.makedirs(os.path.join(dirpath, "masks"), exist_ok=True)
    yield dirpath
    shutil.rmtree(dirpath, ignore_errors=True)


@pytest.mark.asyncio
async def test_calculate_mask_valid_file_returns_filename(ascii_tmp_dir):
    img = np.ones((100, 100, 3), dtype=np.uint8) * 255
    cv2.rectangle(img, (10, 10), (90, 90), (0, 0, 0), thickness=3)
    plan_path = os.path.join(ascii_tmp_dir, "plans", "test-id.jpg")
    cv2.imwrite(plan_path, img)

    svc = MaskService(upload_dir=ascii_tmp_dir)
    result = await svc.calculate_mask("test-id")
    assert result == "test-id.png"
    assert os.path.exists(os.path.join(ascii_tmp_dir, "masks", "test-id.png"))


@pytest.mark.asyncio
async def test_calculate_mask_missing_file_raises_not_found(tmp_path):
    (tmp_path / "plans").mkdir()
    (tmp_path / "masks").mkdir()
    svc = MaskService(upload_dir=str(tmp_path))
    with pytest.raises(FileStorageError):
        await svc.calculate_mask("nonexistent-id")
