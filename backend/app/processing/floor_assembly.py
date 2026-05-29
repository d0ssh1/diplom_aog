"""Pure mask assembly for the stitched-floor pipeline — PURE layer.

Warps each section wall mask by its solved uniform similarity ``(scale, tx, ty)``,
OR-composites the warped masks into the master-pixel canvas, and rasterises the
floor connectors as OPEN-polyline wall bands. Returns a binary ``{0, 255}`` mask
ready for the unchanged ``build_mesh_from_mask`` (design pipeline spec §5.1).

NOTE: ``processing/`` is the PURE layer. This module imports ONLY ``cv2``,
``numpy`` and ``dataclasses`` — no core config, no DB/IO/Pydantic/ORM, no service.
``SectionWarpInput`` / ``ConnectorRaster`` are plain frozen dataclasses (no
Pydantic, no ORM) so the layer stays pure.

The canvas size and the per-section transforms are decided by the SERVICE: it
knows the master-schema crop dims and the memory-guard factor ``k``
(``MAX_FLOOR_CANVAS_PX``), and passes ``canvas_size`` with the transforms already
pre-multiplied by ``k`` (pipeline spec §5.2). This function only honours the
``canvas_size`` it is handed — it never derives ``k`` or reads any constant.
"""

from dataclasses import dataclass

import cv2
import numpy as np


@dataclass(frozen=True)
class SectionWarpInput:
    """One section's wall mask plus its solved uniform-similarity transform.

    Attributes:
        section_id: id of the source section (for callers; unused by the warp).
        mask: ``(Hs, Ws)`` uint8 binary ``{0, 255}`` section wall mask. Never
            mutated — ``warpAffine`` reads it into a fresh output array.
        scale: single isotropic scale ``s`` (same on both axes).
        tx: translation in x, in master pixels.
        ty: translation in y, in master pixels.
    """

    section_id: int
    mask: np.ndarray
    scale: float
    tx: float
    ty: float


@dataclass(frozen=True)
class ConnectorRaster:
    """One floor connector as an open polyline in master-pixel coordinates.

    Attributes:
        points_px: ``(M, 2)`` int32 master-pixel vertices of an OPEN polyline
            (no implicit closing segment from the last vertex back to the first).
        thickness_px: wall-band thickness in master pixels. MUST be ``>= 1``; the
            caller (service, Phase 08) rounds up, because OpenCV treats
            ``thickness=0`` as a 1px hairline rather than "nothing".
    """

    points_px: np.ndarray
    thickness_px: int


def assemble_floor_mask(
    sections: list[SectionWarpInput],
    canvas_size: tuple[int, int],
    connectors: list[ConnectorRaster],
    default_wall_thickness_px: int,
) -> np.ndarray:
    """Warp + OR-composite section masks and rasterise connectors into one mask.

    Pure assembly per pipeline spec §5.1: each section mask is warped by its
    ``(scale, tx, ty)`` into the master-pixel canvas with ``INTER_NEAREST`` (keeps
    the result strictly binary) and ``borderValue=0`` (out-of-canvas pixels
    contribute nothing); the warped masks are unioned with ``cv2.max`` so seam
    overlaps stay ``255`` (never sum to ``510``); connectors are drawn as OPEN
    polyline wall bands (no fill, no closing segment).

    Args:
        sections: section masks plus their solved transforms. Input masks are
            never mutated.
        canvas_size: ``(Wm, Hm)`` master-pixel dims (width, height) of the floor
            canvas — the master-schema crop dims (already capped by the service).
            NOTE the axis order: a numpy array is ``(rows, cols) = (Hm, Wm)``.
        connectors: open-polyline connectors in master-pixel int coordinates.
        default_wall_thickness_px: fallback wall-band thickness (master pixels)
            used when a connector's own ``thickness_px`` is falsy; expected
            ``>= 1``.

    Returns:
        ``(Hm, Wm)`` uint8 binary mask with values strictly in ``{0, 255}``.

    Notes:
        Normalisation of inputs to strictly binary is the SERVICE's job (Phase 08),
        not this function's: the pure function trusts that section masks are
        already ``{0, 255}``.
    """
    # Step 1 — allocate the canvas. canvas_size is (Wm, Hm) but a numpy array is
    # (rows, cols) = (Hm, Wm); mixing these would transpose the whole floor.
    width_m, height_m = canvas_size
    canvas = np.zeros((height_m, width_m), dtype=np.uint8)

    # Step 2 — warp each section and OR-composite it into the canvas. The input
    # mask is never mutated: warpAffine writes into a fresh output array, and the
    # canvas is itself a fresh array.
    for section in sections:
        affine = np.array(
            [[section.scale, 0.0, section.tx], [0.0, section.scale, section.ty]],
            dtype=np.float64,
        )
        warped = cv2.warpAffine(
            section.mask,
            affine,
            (width_m, height_m),  # dsize is (cols, rows) = (Wm, Hm)
            flags=cv2.INTER_NEAREST,  # preserves binary {0, 255}, no edge bleed
            borderValue=0,  # out-of-canvas pixels contribute nothing
        )
        # Pixel-wise OR for binary masks: overlaps stay 255 (no 510 overflow).
        canvas = cv2.max(canvas, warped)

    # Step 3 — rasterise each connector as an OPEN polyline wall band. No fill and
    # no closing segment (corridor mouths stay passable). max(1, ...) guards
    # against a rounded-down 0 silently degrading to a 1px hairline.
    for connector in connectors:
        thickness = connector.thickness_px or default_wall_thickness_px
        cv2.polylines(
            canvas,
            [connector.points_px],
            isClosed=False,
            color=255,
            thickness=max(1, thickness),
        )

    # Step 4 — return the assembled binary canvas.
    return canvas
