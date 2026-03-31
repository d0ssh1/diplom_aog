# crop→mask→rooms — Design

date: 2026-03-31
status: draft
research: ../../research/crop→mask→rooms.md

## Business Context
This feature fixes the drift between the cropped/rotated plan image, the generated vector mask, and the saved room/door annotations in the floor editor. Today the plan preview and the mask background are produced through separate transform paths, so the user sees one geometry while the editor stores annotations in another.

The goal is to make the crop, mask, rooms, and doors share one coordinate basis so that the emergency plan image, the vector mask, and the editable annotations stay aligned during editing, saving, and navigation graph generation.

## Acceptance Criteria
1. The cropped/rotated plan preview and the editable mask background render in the same coordinate space for a given reconstruction.
2. Newly created and restored rooms/doors save with coordinates that map back to the same crop/rotation basis as the mask preview.
3. Re-opening an edited plan shows the same room and door positions without visible drift relative to the mask and plan.
4. Navigation graph generation uses room and door positions that correspond to the same shared geometry basis as the edited mask.

## Documents

| File | View | Description |
|------|------|-------------|
| 01-architecture.md | Logical | C4 L1→L2→L3, module dependencies |
| 02-behavior.md | Process | Data flow + sequence diagrams |
| 03-decisions.md | Decision | Design decisions, risks, open questions |
| 04-testing.md | Quality | Test strategy + coverage mapping |
| 05-api-contract.md | API | HTTP API contract for affected payloads |
| 06-pipeline-spec.md | Pipeline | Processing pipeline details |
