"""Consistency cross-check — the "no shifts" / drift guard (Phase 04, ADR-9).

``FloorNavService`` recomputes ``k`` / canvas / effective-ppm INDEPENDENTLY of
``FloorAssemblyService.build_floor_mesh`` (no shared method). This test pins the
nav service's geometry to the SAME deterministic formula both code paths use, so
any future drift in either path (e.g. a changed ``k`` clamp) fails here.

Driving ``build_floor_mesh`` end-to-end is heavyweight (trimesh GLB export + file
IO), so — as the plan permits — this asserts the nav service reproduces the
documented ``k`` / canvas arithmetic exactly, for a known ``master_w/h`` +
``min_scale``. The formula under test is identical to
``floor_assembly_service.py`` (``k = min(max(1, 1/min_scale),
MAX_FLOOR_CANVAS_PX/long_side)`` ; ``canvas = round(master * k)`` ; effective ppm
= ``ppm * k``).
"""

import json

import numpy as np
import pytest
from unittest.mock import AsyncMock, MagicMock

from app.core.floor_stitching_constants import (
    CANVAS_TRUST_RESIDUAL_M,
    MAX_FLOOR_CANVAS_PX,
)
from app.processing.floor_assembly import compute_canvas_factor
from app.services.floor_nav_service import FloorNavService


def _expected_k(master_w: int, master_h: int, min_scale: float) -> float:
    long_side = max(master_w, master_h)
    return min(max(1.0, 1.0 / min_scale), MAX_FLOOR_CANVAS_PX / long_side)


@pytest.mark.asyncio
async def test_nav_canvas_and_ppm_match_floor_assembly_build(tmp_path, monkeypatch):
    """nav canvas_size_px + effective ppm == the documented k/canvas formula."""
    master_w, master_h = 200, 150
    ppm = 50.0
    # A small section scale (< 1) forces k = 1/min_scale (the upscale branch) — the
    # exact behaviour build_floor_mesh uses for low-res master schemas.
    min_scale = 0.5

    mask = np.zeros((master_h, master_w), dtype=np.uint8)
    mask[0:4, :] = 255
    mask[-4:, :] = 255
    mask[:, 0:4] = 255
    mask[:, -4:] = 255

    floor = MagicMock()
    floor.id = 1
    floor.pixels_per_meter = ppm
    floor.schema_image_id = "schema-1"
    floor.schema_crop_bbox = None

    section = MagicMock()
    section.id = 10
    section.transform = {"scale": min_scale, "tx": 0.0, "ty": 0.0}
    recon = MagicMock()
    recon.id = 100
    recon.mask_file_id = "mask-100"
    recon.vectorization_data = json.dumps({"rooms": []})
    section.reconstruction = recon

    floor_repo = AsyncMock()
    floor_repo.get_by_id.return_value = floor
    section_repo = AsyncMock()
    section_repo.list_by_floor.return_value = [section]
    connector_repo = AsyncMock()
    connector_repo.list_by_floor.return_value = []
    storage = MagicMock()
    storage.find_file.return_value = "/fake/path.png"

    svc = FloorNavService(
        floor_repo=floor_repo,
        section_repo=section_repo,
        connector_repo=connector_repo,
        storage=storage,
        upload_dir=str(tmp_path),
    )
    # The schema-dims read AND the section-mask load both decode to ``mask`` — so
    # the master canvas is (master_w, master_h) and min_scale comes from transform.
    monkeypatch.setattr(
        "app.services.floor_nav_service.cv2.imread", lambda *a, **k: mask
    )

    result = await svc.build_floor_nav_graph(1)

    k = _expected_k(master_w, master_h, min_scale)
    expected_canvas = [round(master_w * k), round(master_h * k)]
    expected_eff_ppm = ppm * k
    expected_scale_factor = round(1.0 / expected_eff_ppm, 6)

    assert result["canvas_size_px"] == expected_canvas, (
        "nav canvas must equal round(master * k) — drift vs build_floor_mesh"
    )
    # scale_factor = 1 / (ppm * k) — same effective ppm as the GLB build.
    assert result["scale_factor"] == pytest.approx(expected_scale_factor, abs=1e-6)
    # Recover effective ppm from the reported scale_factor and confirm it matches.
    recovered_eff_ppm = 1.0 / result["scale_factor"]
    assert recovered_eff_ppm == pytest.approx(expected_eff_ppm, rel=1e-4)


@pytest.mark.asyncio
async def test_nav_canvas_excludes_misregistered_section(tmp_path, monkeypatch):
    """A mis-registered section (high residual) does NOT bloat the nav canvas:
    build_floor_nav_graph derives k from the SAME robust helper as
    build_floor_mesh (ADR-9), excluding the bad section from the min-scale."""
    master_w, master_h = 200, 150
    ppm = 12.0

    mask = np.zeros((master_h, master_w), dtype=np.uint8)
    mask[0:4, :] = 255
    mask[-4:, :] = 255
    mask[:, 0:4] = 255
    mask[:, -4:] = 255

    floor = MagicMock()
    floor.id = 1
    floor.pixels_per_meter = ppm
    floor.schema_image_id = "schema-1"
    floor.schema_crop_bbox = None

    def _sec(sid: int, scale: float, residual: float) -> MagicMock:
        s = MagicMock()
        s.id = sid
        s.transform = {
            "scale": scale, "rotation_rad": 0.0, "tx": 0.0, "ty": 0.0,
            "residual_rms_px": residual,
        }
        recon = MagicMock()
        recon.id = sid * 10
        recon.mask_file_id = f"mask-{sid}"
        recon.vectorization_data = json.dumps({"rooms": []})
        s.reconstruction = recon
        return s

    good = _sec(10, 0.8, 6.0)    # 0.5 m → trusted
    bad = _sec(20, 0.1, 480.0)   # 40 m → mis-registered, excluded from k

    floor_repo = AsyncMock()
    floor_repo.get_by_id.return_value = floor
    section_repo = AsyncMock()
    section_repo.list_by_floor.return_value = [good, bad]
    connector_repo = AsyncMock()
    connector_repo.list_by_floor.return_value = []
    storage = MagicMock()
    storage.find_file.return_value = "/fake/path.png"

    svc = FloorNavService(
        floor_repo=floor_repo,
        section_repo=section_repo,
        connector_repo=connector_repo,
        storage=storage,
        upload_dir=str(tmp_path),
    )
    monkeypatch.setattr(
        "app.services.floor_nav_service.cv2.imread", lambda *a, **k: mask
    )

    result = await svc.build_floor_nav_graph(1)

    # Robust k excludes the bad section: k = 1/0.8 = 1.25 (NOT 1/0.1 = 10).
    expected_k = compute_canvas_factor(
        [(0.8, 6.0), (0.1, 480.0)],
        max(master_w, master_h),
        ppm,
        MAX_FLOOR_CANVAS_PX,
        CANVAS_TRUST_RESIDUAL_M,
    )
    assert expected_k == pytest.approx(1.25)
    assert result["canvas_size_px"] == [
        round(master_w * expected_k),
        round(master_h * expected_k),
    ]
