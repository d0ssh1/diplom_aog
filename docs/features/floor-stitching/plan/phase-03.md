# Phase 03: processing.registration (the solver) + tests

phase: 03
layer: processing/ (PURE)
depends_on: 02
design: ../06-pipeline-spec.md §2–3; tests ../04-testing.md §"Unit — solve_similarity"

## Goal

Implement the pure uniform-similarity least-squares solver and its degeneracy
guards. NO DB/IO/Pydantic — plain numpy + a dataclass.

## Files to Create

### `backend/app/processing/registration.py`
```python
from dataclasses import dataclass
import numpy as np

# NOTE: processing/ is the PURE layer — do NOT import from app.core here.
# The solver receives `min_baseline_px` as an argument (the service computes it
# from R_MIN_BASELINE_FRAC). The minimum-count "3" is inlined below as a literal
# (the one intentional duplication of MIN_CONTROL_POINTS) to keep this module
# free of core/ dependencies.

class DegenerateControlPointsError(Exception):
    def __init__(self, reason: str) -> None:
        self.reason = reason
        super().__init__(reason)

@dataclass(frozen=True)
class SimilarityResult:
    scale: float
    tx: float
    ty: float
    residual_rms: float
    n_points: int

def solve_similarity(
    src: np.ndarray,            # (N,2) float64 section-pixel, N>=3
    dst: np.ndarray,            # (N,2) float64 master-pixel, paired by index
    min_baseline_px: float,     # service passes R_MIN_BASELINE_FRAC * hypot(Ws,Hs)
) -> SimilarityResult: ...
```

Algorithm (06 §2.3, exact):
1. Validate shapes: `src.shape == dst.shape`, ndim 2, last dim 2.
2. `N = len(src)`; if `N < 3` (literal — matches `MIN_CONTROL_POINTS`, but the pure module must not import `core`) → `DegenerateControlPointsError("too few points")`.
3. Coincident guard: `max pairwise distance in src < min_baseline_px` → raise `"baseline too short"`. Compute the **true** max pairwise distance (N≤20, so the O(N²) loop is trivially cheap). Do **not** use the bounding-box diagonal as a proxy — for collinear/near-collinear sets (explicitly accepted, §3) the bbox diagonal over-estimates the along-line spread that actually feeds `denom`, so it can pass a set the rule should reject.
4. Centre: `p̄=src.mean(0)`, `q̄=dst.mean(0)`; `p'=src-p̄`, `q'=dst-q̄`.
5. `denom = (p'*p').sum()`; if `denom <= eps` → raise (coincident). 
6. `s = (p'*q').sum() / denom`; `tx = q̄[0]-s*p̄[0]`; `ty = q̄[1]-s*p̄[1]`.
7. Residual: `pred = s*src + [tx,ty]`; `residual_rms = sqrt(mean(sum((dst-pred)**2, axis=1)))`.
8. Non-finite guard: any NaN/Inf in `(s,tx,ty,residual_rms)` → raise `"non-finite"`.
9. Return `SimilarityResult(s, tx, ty, residual_rms, N)`.

**Must NOT mutate `src`/`dst`** (no in-place ops; centring creates new arrays).
Single scalar `s` — structurally impossible to emit `sx≠sy` (the AC4 core).

## Files to Create — tests

### `backend/tests/processing/test_registration.py`
Implement every row from [../04-testing.md](../04-testing.md) §Unit registration:
`test_solve_identity_returns_unit_scale_zero_shift`,
`test_solve_pure_translation_recovers_shift`,
`test_solve_pure_scale_recovers_scale`,
`test_solve_scale_and_shift_recovers_both`,
`test_solve_is_isotropic_ignores_anisotropic_target` (dst = diag(2,3)·src → one scale, residual>0),
`test_solve_three_points_is_sufficient`,
`test_solve_collinear_wellspread_is_accepted`,
`test_solve_reports_residual_rms`,
`test_solve_isolates_single_misclick_in_residual`,
`test_solve_fewer_than_three_points_raises` (1 and 2 pts),
`test_solve_coincident_points_raises`,
`test_solve_does_not_mutate_inputs`.
Plus the non-displacement maths tests that belong here:
`test_uniform_warp_preserves_cabinet_aspect_ratio`,
`test_uniform_warp_preserves_relative_positions` (can live in Phase 04 file if they
need the warp; the pure-scale versions can be asserted on the transform directly).

Use a `make_points(n, scale, shift, noise=0)` fixture (04-testing §Fixtures).

## Verification
- [ ] `cd backend && pytest tests/processing/test_registration.py -q` all pass.
- [ ] `test_solve_scale_and_shift_recovers_both` within 1e-6.
- [ ] `flake8` clean; no DB/IO imports in `registration.py`.
