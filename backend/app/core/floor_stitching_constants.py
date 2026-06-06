"""Tunable constants for the floor-stitching feature (single source of truth).

From 06-pipeline-spec.md §7. The pure ``processing.registration`` /
``processing.floor_assembly`` modules and the ``FloorAssemblyService`` import
these — there is exactly one definition per knob so a tweak lands everywhere.
"""

# ── Control-point picking radii (display px on the client) ──────────────────────
R_SNAP_PX = 12
"""Snap a new control point to the nearest wall vertex within this radius."""

R_HIT_PX = 10
"""Click within this radius selects an existing point instead of adding one."""

# ── Solver geometry ─────────────────────────────────────────────────────────────
R_MIN_BASELINE_FRAC = 0.02
"""Min control-point spread as a fraction of the section image diagonal."""

MIN_CONTROL_POINTS = 3
"""ADR-16 policy floor: a section is only solvable with >= 3 matched points."""

# ── Caps (validated at the request boundary) ────────────────────────────────────
MAX_CONTROL_POINTS = 20
"""Per-section control-point cap."""

MAX_CONNECTORS = 50
"""Per-floor connector cap."""

MAX_CONNECTOR_POINTS = 64
"""Max vertices per connector polyline."""

# ── Canvas / mask assembly ──────────────────────────────────────────────────────
MAX_FLOOR_CANVAS_PX = 4000
"""Long-side cap for the assembled canvas (memory guard, master px)."""

DETAIL_WARN_SCALE = 0.5
"""Warn (non-fatal) when a section's solved scale falls below this — it is
downsampled on a low-res master schema."""

PPM_WARN_RATIO = 0.10
"""Cross-section ppm disagreement that raises a non-fatal warning."""

# ── Extrusion ───────────────────────────────────────────────────────────────────
FLOOR_HEIGHT = 3.0
"""Extrusion height (metres) passed to build_mesh_from_mask."""

# ── Metric (scale-invariant) thresholds ─────────────────────────────────────────
# Derivation note (no longer "magic"): both thresholds below are fixed in METRES
# here (scale-invariant); the service converts them to pixels at runtime using
# ``ppm_floor``. There is intentionally NO ``RESIDUAL_WARN_PX`` constant — the
# threshold is metric.
RESIDUAL_WARN_M = 0.5
"""Solve residual is "loose" above 0.5 m (metric, scale-invariant).

Residual-warning (Phase 07): a section stays ``status:"ok"`` but gets a
non-fatal warning when ``residual_rms_px / ppm_floor > RESIDUAL_WARN_M``
(residual is in master-pixels; dividing by ``ppm_floor`` gives metres). Only
evaluated when ``ppm_floor`` is a positive finite number.
"""

CANVAS_TRUST_RESIDUAL_M = 3.0
"""Max registration residual (metres) for a section to drive the canvas factor k.

The memory-guard factor ``k = 1 / min(section_scale)`` upscales so the most-
detailed section rasterises at ~native resolution. A MIS-REGISTERED section
(points that fit no single similarity) has its least-squares scale spuriously
shrunk toward 0; left in, it would inflate ``k`` and over-upscale the WHOLE floor
(bloating the canvas and the nav-graph skeleton). Sections whose residual exceeds
this metric threshold (``residual_rms_px / ppm_floor > CANVAS_TRUST_RESIDUAL_M``)
are therefore excluded from the ``min``-scale estimate that sets ``k`` — they
still build, they just do not drive the floor's resolution. Set well above
``RESIDUAL_WARN_M`` (0.5 m) so a merely-loose section still counts; only badly-
broken ones are dropped. If every section is untrusted, all are used (no worse
than the un-guarded ``min``).
"""

DEFAULT_CONNECTOR_THICKNESS_M = 0.15
"""Default connector wall thickness when a line omits ``thickness_m``.

Connector default thickness (Phase 08):
``CONNECTOR_WALL_THICKNESS_PX = DEFAULT_CONNECTOR_THICKNESS_M * ppm_floor``
(master-pixel scale), then k-scaled and floored to >= 1 when handed to the
assembler (see Phase 08).
"""

MIN_CONNECTOR_THICKNESS_PX = 3
"""Visible-minimum raster thickness for a connector wall band.

At low ``ppm_floor`` (e.g. a coarse solve where ``ppm`` ~ 8 px/m), the metric
thickness rounds to ~1 px and the extruded connector becomes a hairline that
is invisible next to the multi-px section walls. This pixel floor keeps a
connector readable on any floor regardless of scale; at normal ppm the
metric calculation already exceeds it, so this is a no-op.
"""
