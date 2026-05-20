# Massive Stitching / Transition Points — Design

date: 2026-04-16
status: draft
research: ../../research/@tickets/new_tickets/13-massive-stitching-omg.md.md

## Business Context
The current stitching flow solves a different problem: it merges multiple reconstructions into one composite plan. That works for editing combined drawings, but it does not model inter-plan movement. For route finding across floors or buildings, the system needs explicit transition points that connect one reconstruction to another while keeping each plan independent.

This feature introduces a transition-point model for multi-plan routing. Users will be able to mark connected points between plans, group them into logical transition groups such as passage, stairs, or elevator, and ask the system for a route that spans multiple reconstructions without stitching the plans together into one image.

## Acceptance Criteria
1. Users can create, update, list, and delete transition groups and transition points for a building.
2. The system can return a multi-plan route between rooms on different reconstructions by combining per-plan nav graphs with transition links.
3. The current single-plan reconstruction flow remains intact, and stitching can be removed independently.
4. The frontend provides a dedicated transition editor and can visualize multi-plan route segments.

## Documents

| File | View | Description |
|------|------|-------------|
| 01-architecture.md | Logical | C4 L1+L2+L3, module dependencies |
| 02-behavior.md | Process | Data flow + sequence diagrams |
| 03-decisions.md | Decision | Design decisions, risks, open questions |
| 04-testing.md | Quality | Test strategy + coverage mapping |
| 05-api-contract.md | API | HTTP API contract |
| 06-pipeline-spec.md | Pipeline | Processing pipeline details |
| plan/ | Code | Phase-by-phase implementation plan |
