# Floor Stitching — UI Reference

date: 2026-05-29
status: draft
parent: [README.md](README.md)

> This document grounds the front-end design in the operator's hand-drawn
> mock-ups (the "Редактор точек" screen and its surroundings). It is a
> **reference, not a pixel spec** — match the *information architecture* and the
> *interaction model* shown here; visual polish (exact spacing, fonts, shadows)
> is left to the implementer. Where a mock-up detail conflicts with an ADR, the
> ADR wins and the conflict is called out explicitly below.

---

## 1. Where these screens live in the flow

The mock-ups depict **one combined editor screen — "Редактор точек"** — that is
reached from the per-section context (breadcrumb `← Корпус D > Отсек 4`). Two
point tools share that screen:

| Tool (button)            | Concern                         | Data home                                  | This feature?         |
|--------------------------|---------------------------------|--------------------------------------------|-----------------------|
| **Опорная точка**        | Registration (geometry)         | section / floor control points (NEW)       | ✅ floor-stitching     |
| **Переходная точка**     | Routing (navigation graph)      | existing transition-point system           | ❌ untouched (ADR-14)  |

**Reconciliation with [ADR-14](03-decisions.md) (control points ≠ transition
points).** The data models, solver and persistence stay fully separate — control
points feed the scale+shift registration, transition points feed pathfinding.
The mock-up only co-locates their *editing tools* on a single screen for operator
convenience. That is allowed: one screen, two independent tools, two independent
data stores. floor-stitching owns **only** the "Опорная точка" tool and its
counters; the "Переходная точка" tool is rendered by the existing system and is
out of scope for this feature's backend.

**Open flow questions raised on the mock-up** (annotated by the author, to resolve
during plan/implementation, not now):
- *"какой экран до / после"* — what precedes and follows "Редактор точек".
- *"где это в системе"* — its exact placement in the wizard / floor editor nav.

Working assumption (consistent with [02-behavior.md](02-behavior.md) UC1–UC2),
to be confirmed when the plan is written:
- **Before:** the per-section wizard, right after binarization (the section's
  mask exists, so corners can be snapped to). This is where **section-local**
  control points are placed (AC1).
- **After:** the Floor Editor, where the operator re-marks the *same* IDs on the
  floor **master schema** (AC2), then solves → previews → confirms (AC3–AC7).

So the same "Редактор точек" layout is used in **two passes** — once per section
(section image as backdrop) and once on the floor (master schema as backdrop).
The shared layout is intentional; the backdrop and the meaning of a placed point
differ between passes.

---

## 2. Screen anatomy — "Редактор точек"

```
┌──────────────────────────────────────────────────────────────────────────┐
│  ← Корпус D  ›  Отсек 4                                      [ Редактор точек ] │  header / breadcrumb
├───────────┬──────────────────────────────────────────────┬────────────────┤
│  Этажи    │                                              │  Инструменты    │
│           │                                              │                │
│   ▣ 9     │                                              │ [⊕ Опорная     │
│   ▣ 8     │              ┌─────────────────┐             │     точка ]     │
│   ▣ 7     │              │                 │             │                │
│   ▣ 6     │              │   план / схема  │ ✛           │ [⊕ Переходная  │
│   ▣ 5     │              │   (backdrop)    │      ✛      │     точка ]     │
│   ◉ 4 ←   │              │       ✛         │             │                │
│   ▣ 3     │              │            ✛    │             │  ── вид ──      │
│   ▣ 2     │              └─────────────────┘             │  ◉ Фото        │
│   ▣ 1     │                                              │  ○ Маска       │
│           │   Прозрачность ▭▭▭▭▭▭▭░░░  67%                │  ○ Инверт.     │
├───────────┴──────────────────────────────────────────────┴────────────────┤
│  Опорные точки: 8/10        Переходные точки: Чётно            [  Далее  ▸ ] │  status bar / CTA
└──────────────────────────────────────────────────────────────────────────┘
```

### 2.1 Header / breadcrumb
- Back affordance + breadcrumb `Корпус D › Отсек 4` (building › section). Title
  "Редактор точек".
- The breadcrumb tells the operator *which section's* points are being edited.

### 2.2 Left rail — "Этажи" (floors)
- Vertical list of floors **9 → 1** (top-to-bottom = high-to-low).
- Each entry carries a **state icon** (e.g. has-schema / has-sections /
  ready-to-build / built). The **active** floor (4) is highlighted.
- Purpose: let the operator switch the floor context. In the per-section pass
  this is mostly informational; in the floor pass it selects the floor being
  assembled.
- *Implementation note:* state icons should map to real floor state
  (`schema_image_id?`, sections bound?, last build confirmed?) — see
  [05-api-contract.md](05-api-contract.md) `GET …/assembly` for the source data.

### 2.3 Center — plan canvas
- The backdrop image fills the canvas: **section plan** (per-section pass) or
  **master schema** (floor pass).
- **View toggle** (right panel, see §2.4) switches the backdrop between **Фото /
  Маска / Инвертированная маска**.
- **Прозрачность (opacity) slider**, shown at **67%**, cross-fades the active
  overlay (mask over photo) so the operator can line a point up against both the
  photographed landmark and the binarised wall corner. This realises AC1's
  "toggles photo ↔ binarised mask with an opacity slider".
- **Control-point markers** are **orange crosshairs (✛)** placed by clicking the
  canvas. Each marker is labelled with its **stable ID**. Markers are
  draggable for fine-positioning and may **snap to the nearest wall corner
  within a radius** (AC1) when the mask view is active.
- Coordinates captured here are normalised **[0,1]** over the backdrop image
  (section-local in pass 1, master in pass 2) — never raw pixels in the payload.

### 2.4 Right panel — tools + view
- **[⊕ Опорная точка]** — activates control-point placement (this feature).
- **[⊕ Переходная точка]** — activates transition-point placement (existing
  system, out of scope).
- Only one tool is active at a time; the active tool is visually emphasised.
- **Вид (view) radio:** Фото / Маска / Инвертированная маска — drives the
  center backdrop. Pairs with the opacity slider.
- *Active-point picker (AC2):* in the **floor pass**, this panel also hosts the
  list of section control-point IDs to re-mark on the master schema; selecting an
  ID makes the next master-canvas click set *that ID's* master coordinate, and the
  section thumbnail highlights the same point. (The mock-up shows the tool
  buttons; the per-ID picker is the floor-pass elaboration of the same panel.)

### 2.5 Bottom status bar + CTA
- **"Опорные точки: 8/10"** — count of placed control points vs a soft target.
  - Reconcile with [ADR-16](03-decisions.md): the **hard minimum is 3**. `8/10`
    is a *soft guidance target* shown to encourage a well-spread set, not a cap
    and not the floor. The "Далее" CTA must be enabled at **≥3** valid points,
    not gated on reaching 10. `MAX_CONTROL_POINTS = 20` (see
    [06-pipeline-spec.md](06-pipeline-spec.md) §7) is the real upper bound; a
    `/10` target is fine as a display hint but must not block at 10.
- **"Переходные точки: Чётно"** — parity check for the transition system
  (out of scope; rendered by that system).
- **[ Далее ▸ ]** — primary CTA (orange). Advances the flow (section pass →
  next section / floor pass → solve & preview). Disabled until the active tool's
  minimum is satisfied (≥3 control points for the floor-stitching path).

---

## 3. Visual language (lean-on, not pixel-spec)

| Token            | Mock-up cue                                  | Guidance                                              |
|------------------|----------------------------------------------|-------------------------------------------------------|
| Accent / primary | Orange CTA + orange crosshair markers        | Reuse the app's existing primary accent; keep CTA and active control-point markers the same accent so the eye ties "place point" to "proceed". |
| Point marker     | Crosshair (✛) with ID label                  | Crosshair (not a filled dot) so the precise center is visible against busy plan lines. Label = stable ID. |
| Layout           | 3-pane: floor rail │ canvas │ tools          | Keep the 3-pane split; canvas is the dominant region. |
| View control     | Фото / Маска / Инверт. + opacity 67%         | Three discrete backdrop modes + continuous opacity cross-fade. |
| Status counters  | "8/10", "Чётно"                              | Left = control-point progress (this feature), right = transition parity (existing). Keep them visually distinct so the two concerns don't read as one. |

The author's note — *"необязательно повторять их в абсолютной точности… просто
хорошо опирался"* — means: preserve the **structure and interactions** above;
do not invent extra panels or flows beyond what the mock-ups and ACs imply.

---

## 4. Mapping to acceptance criteria

| AC (README) | Screen element |
|-------------|----------------|
| AC1 (place ≥3 named CPs on a section; photo↔mask toggle + opacity; corner snap) | §2.3 canvas markers, §2.4 view toggle + opacity, §2.5 "Опорные точки" counter |
| AC2 (re-mark same IDs on master; by ID; thumbnail highlight) | §2.4 active-point picker (floor pass), §2.3 master backdrop |
| AC3/AC4 (solve uniform scale+shift; residual; reject <3) | Result of pressing **Далее** in the floor pass → [02-behavior.md](02-behavior.md) UC3 |
| AC5 (connecting lines) | A separate floor-editor drawing tool (not in these "точки" mock-ups) — see [02-behavior.md](02-behavior.md) UC4 |
| AC7 (preview → confirm) | Downstream of **Далее**: 3D preview + explicit "Сохранить этаж" — see [02-behavior.md](02-behavior.md) UC5 / [ADR-17](03-decisions.md) |

---

## 5. Open items to settle in the plan (not now)

1. **Exact nav placement** of "Редактор точек" (the author's *"где это в
   системе"*) — confirm the route in the per-section wizard and in the Floor
   Editor.
2. **Before/after screens** (*"какой экран до/после"*) — confirm predecessors
   and successors for each of the two passes.
3. **`8/10` target semantics** — confirm the soft target value (10?) and that the
   gate is `≥3`, the cap is `MAX_CONTROL_POINTS=20`.
4. **Connecting-line tool surface** — where the AC5 polyline tool lives relative
   to this screen (likely a sibling mode in the Floor Editor).
