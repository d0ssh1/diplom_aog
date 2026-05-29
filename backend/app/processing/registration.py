"""Uniform (isotropic) similarity least-squares solver — PURE layer.

Fits a single isotropic scale ``s`` plus translation ``(tx, ty)`` mapping a set
of section-pixel control points onto their master-pixel counterparts::

    X = s * x + tx
    Y = s * y + ty

No rotation, no shear, no per-axis scale (3 DOF). A single scalar ``s`` is applied
to both axes, so it is structurally impossible to emit ``sx != sy`` — this is the
mathematical core of "a square cabinet stays square" (design AC4).

NOTE: ``processing/`` is the PURE layer. This module imports ONLY ``numpy`` and
``dataclasses`` — no core config, no DB/IO/Pydantic/ORM, no OpenCV. The solver
receives ``min_baseline_px`` as an argument (the service computes it from
``R_MIN_BASELINE_FRAC``). ``DegenerateControlPointsError`` is DEFINED here: this
module is its home, and the service imports it from here.
"""

from dataclasses import dataclass

import numpy as np

# The minimum control-point count is the ONE intentional duplication of
# MIN_CONTROL_POINTS (defined in the core constants module). It is inlined as a
# literal here so the PURE layer stays free of any core-config dependency. Keep
# this value in sync with MIN_CONTROL_POINTS (= 3).
_MIN_POINTS = 3

# Guard threshold for the centred source variance (denominator of the scale
# estimate). Anything at or below this is treated as a coincident point set.
_DENOM_EPS = 1e-12


class DegenerateControlPointsError(Exception):
    """Raised when control points cannot determine a stable similarity.

    Reasons: fewer than three points, a near-zero baseline (coincident points),
    or a non-finite numerical result. The service maps this to a ``degenerate``
    section status and surfaces ``reason`` to the operator.
    """

    def __init__(self, reason: str) -> None:
        self.reason = reason
        super().__init__(reason)


@dataclass(frozen=True)
class SimilarityResult:
    """Result of a uniform-similarity fit, in master-pixel space.

    Attributes:
        scale: single isotropic scale factor ``s`` (same on both axes).
        tx: translation in x (master pixels).
        ty: translation in y (master pixels).
        residual_rms: root-mean-square of per-point residuals (master pixels).
        n_points: number of control-point pairs used in the fit.
    """

    scale: float
    tx: float
    ty: float
    residual_rms: float
    n_points: int


def _max_pairwise_distance(points: np.ndarray) -> float:
    """Return the true maximum pairwise Euclidean distance among points.

    Args:
        points: ``(N, 2)`` float64 array.

    Returns:
        Largest distance between any two points; ``0.0`` for ``N < 2``.

    Notes:
        Uses an explicit O(N^2) loop. Control-point sets are capped at 20 points
        (``MAX_CONTROL_POINTS``), so this is trivially cheap. The bounding-box
        diagonal is deliberately NOT used as a proxy: for collinear / near-
        collinear sets (explicitly accepted for a pure scale) the bbox diagonal
        over-estimates the along-line spread that actually feeds the solver's
        denominator, so it could wrongly accept a set the baseline guard must
        reject.
    """
    n = len(points)
    max_dist = 0.0
    for i in range(n):
        for j in range(i + 1, n):
            diff = points[i] - points[j]
            dist = float(np.hypot(diff[0], diff[1]))
            if dist > max_dist:
                max_dist = dist
    return max_dist


def solve_similarity(
    src: np.ndarray,
    dst: np.ndarray,
    min_baseline_px: float,
) -> SimilarityResult:
    """Fit a uniform similarity ``(scale, tx, ty)`` mapping ``src`` onto ``dst``.

    Closed-form least squares for a single isotropic scale plus translation
    (no rotation, no shear). See pipeline spec §2.3.

    Args:
        src: ``(N, 2)`` float64 section-pixel coordinates, ``N >= 3``.
        dst: ``(N, 2)`` float64 master-pixel coordinates, paired with ``src`` by
            index (``src[i]`` and ``dst[i]`` are the same control-point ID).
        min_baseline_px: minimum acceptable maximum-pairwise-distance among
            ``src`` points (the service derives this from the section image
            diagonal via ``R_MIN_BASELINE_FRAC``).

    Returns:
        SimilarityResult with the fitted ``scale``, ``tx``, ``ty``, the
        ``residual_rms`` in master pixels, and ``n_points``.

    Raises:
        DegenerateControlPointsError: if there are fewer than three points, the
            point set has a near-zero baseline (coincident), or the solve yields
            a non-finite value.

    Notes:
        The inputs ``src`` and ``dst`` are never mutated — centring creates new
        arrays. A single scalar ``scale`` is applied to both axes, so per-axis
        scale (``sx != sy``) is structurally impossible (AC4).
    """
    # Step 1 — validate shapes.
    if src.shape != dst.shape:
        raise DegenerateControlPointsError(
            f"src/dst shape mismatch: {src.shape} vs {dst.shape}"
        )
    if src.ndim != 2 or src.shape[1] != 2:
        raise DegenerateControlPointsError(
            f"expected (N, 2) arrays, got shape {src.shape}"
        )

    # Step 2 — too few points. The literal 3 mirrors MIN_CONTROL_POINTS; the
    # pure module must not import core (see module docstring).
    n = len(src)
    if n < _MIN_POINTS:
        raise DegenerateControlPointsError("too few points")

    # Step 3 — coincident / short-baseline guard using the TRUE max pairwise
    # distance (not the bbox diagonal — see _max_pairwise_distance).
    if _max_pairwise_distance(src) < min_baseline_px:
        raise DegenerateControlPointsError("baseline too short")

    # Step 4 — centre both point sets (new arrays; inputs untouched).
    src_mean = src.mean(axis=0)
    dst_mean = dst.mean(axis=0)
    src_centred = src - src_mean
    dst_centred = dst - dst_mean

    # Step 5 — denominator is the total centred variance of the source points.
    denom = float((src_centred * src_centred).sum())
    if denom <= _DENOM_EPS:
        raise DegenerateControlPointsError("baseline too short")

    # Step 6 — closed-form isotropic scale + translation.
    numer = float((src_centred * dst_centred).sum())
    scale = numer / denom
    tx = float(dst_mean[0] - scale * src_mean[0])
    ty = float(dst_mean[1] - scale * src_mean[1])

    # Step 7 — residual RMS in master pixels.
    pred = scale * src + np.array([tx, ty], dtype=np.float64)
    residual_rms = float(np.sqrt(np.mean(((dst - pred) ** 2).sum(axis=1))))

    # Step 8 — non-finite guard (numerical failure).
    if not all(np.isfinite(v) for v in (scale, tx, ty, residual_rms)):
        raise DegenerateControlPointsError("non-finite")

    # Step 9 — return.
    return SimilarityResult(
        scale=scale,
        tx=tx,
        ty=ty,
        residual_rms=residual_rms,
        n_points=n,
    )
