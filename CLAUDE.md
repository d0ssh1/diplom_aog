# Diplom3D — Claude Code Instructions

## Project
Система для построения 3D-моделей этажей зданий на основе планов эвакуации.
Stack: Python 3.12 + FastAPI + OpenCV + SQLAlchemy + React + TypeScript + Three.js + SQLite (dev) / PostgreSQL (prod)

## Model Strategy (CRITICAL — saves 10-15x tokens)

Token budget is limited. Use three tiers of models based on task complexity.

### Tier 1: Opus — THINKING (architecture, trade-offs, synthesis)
Use `claude-opus-4-6` for:
- `/research` — Lead agent that synthesizes findings and writes research doc
- `/design_feature` — architecture decisions, C4 diagrams, design synthesis
- Complex debugging when root cause is unclear after Sonnet fails

### Tier 2: Sonnet — DOING (writing code, reviewing with context)
Use `claude-sonnet-4-6` for:
- `/implement` — Lead orchestrator session
- Backend implementer (writes code from detailed plan)
- Frontend implementer (writes code from detailed plan)
- Architect review subagent (checks cross-document consistency — needs to understand context)
- rv-arch (checks architecture rules — needs to understand code context)
- rv-sec (checks security — needs to understand vulnerability patterns)
- `/fix_bug` — straightforward bugs

### Tier 3: Haiku — MECHANICAL (run commands, compare lists, scan files)
Use `claude-haiku-4-5-20251001` for:
- rv-build (runs `pytest`, `flake8`, `tsc` — copies output, no analysis needed)
- rv-plan (compares file list in plan vs actually created files — mechanical check)
- Research subagents / file scanners (reads files, lists functions with file:line — no opinions)

### How to apply in Task tool
When spawning subagents, set model explicitly:
```
# Sonnet for implementers and smart reviewers
Task tool: model: "claude-sonnet-4-6"

# Haiku for mechanical tasks
Task tool: model: "claude-haiku-4-5-20251001"
```

### How to launch sessions
```bash
# Research and Design — Opus (thinking)
claude --model claude-opus-4-6

# Implement and Fix bugs — Sonnet (doing)
claude --model claude-sonnet-4-6
```

### Rule of thumb
- Task requires THINKING (architecture, trade-offs, design) → Opus
- Task requires DOING (code from plan, review with understanding) → Sonnet
- Task requires EXECUTING (run commands, compare lists, scan files) → Haiku
- When in doubt → Sonnet. Escalate to Opus only if Sonnet fails quality gates twice.

---

## Before ANY Task

1. Read `prompts/project_context.md` — always (domain entities, requirements, pipeline, constraints from the VKR thesis)
2. Read `prompts/architecture.md` — always
3. Read relevant style guide (`prompts/python_style.md` or `prompts/frontend_style.md`)
4. Read `prompts/pipeline.md` — if task touches image processing
5. Read `prompts/cv_patterns.md` — if task involves OpenCV/numpy
6. Read `prompts/threejs_patterns.md` — if task involves 3D rendering
7. Read `prompts/testing.md` — if task involves writing tests

## Available Commands

| Command | When to use | Launch model | Subagent models |
|---------|------------|--------------|-----------------|
| `/research {feature}` | Before designing anything new | Opus | Haiku (scanners) |
| `/design_feature {name} {scope} {desc}` | Design before code | Opus | Sonnet (architect review) |
| `/implement {plan-path}` | After design+plan approved | Sonnet | Sonnet (impl, rv-arch, rv-sec) + Haiku (rv-build, rv-plan) |
| `/fix_bug {description}` | Bug investigation and fix | Sonnet | — |

## Agent Team (spawned by /implement)

| Agent | Role | File | Model |
|-------|------|------|-------|
| Lead | Orchestrates, assigns tasks, aggregates reviews. NEVER writes code. | (implement command) | **Sonnet** (session model) |
| backend | Implements Python/FastAPI code from plan | `agents/implementer-backend.md` | **Sonnet** |
| frontend | Implements React/TypeScript code from plan | `agents/implementer-frontend.md` | **Sonnet** |
| rv-build | Runs build, tests, lint — reports output | `agents/rv-build.md` | **Haiku** |
| rv-arch | Checks architecture + standards compliance | `agents/rv-arch.md` | **Sonnet** |
| rv-sec | Checks security vulnerabilities | `agents/rv-sec.md` | **Sonnet** |
| rv-plan | Compares plan vs created files | `agents/rv-plan.md` | **Haiku** |

## Research Subagents (spawned by /research)

| Agent | Role | Model |
|-------|------|-------|
| Lead | Synthesizes findings, writes research doc | **Opus** (session model) |
| File scanner 1 (backend) | Reads files, lists functions with file:line | **Haiku** |
| File scanner 2 (patterns) | Finds similar features, naming patterns | **Haiku** |
| File scanner 3 (integration) | Maps DB, file storage, API boundaries | **Haiku** |

## Workflow for New Features

```
/research {feature-name}                          ← Opus session + Haiku scanners
    ↓ review research doc → human approves
/design_feature {feature-name} {service} {desc}   ← Opus session
    ↓ review design docs → human approves
    ↓ review code plan → human approves
/implement docs/features/{feature}/plan/README.md  ← Sonnet session + Haiku for rv-build/rv-plan
    ↓ each phase: implement → review → gates → commit
    ↓ human reviews final PR
```

**CRITICAL: Wait for human approval between phases. Never proceed to implementation without explicit "approved" / "go" / "ок".**

## Non-Negotiable Rules

- `processing/` functions are PURE — no DB calls, no HTTP, no side effects, no state
- No business logic in `api/` routers — routers are thin (validate → call service → return)
- Every new endpoint has Pydantic request + response models
- TypeScript `any` is forbidden — use `unknown` + type guard
- Tests required for every new function in `processing/`
- Never add `Co-authored-by: Claude` to commits
- Never mutate input `np.ndarray` — always `.copy()` first
- All coordinates after vectorization normalized to [0, 1]
- Three.js objects must have `dispose()` cleanup on unmount

## Current Code State (IMPORTANT — read before research)

The existing codebase has architectural debt that does NOT match the standards in `prompts/`. When doing research, note the actual patterns found vs the intended patterns:

### Backend — current reality:
- `processing/` contains service-classes (BinarizationService, etc.), NOT pure functions
- `reconstruction_service.py` mixes DB access with business logic with file I/O
- No `services/` layer exists yet — business logic is in `processing/` and `api/` routers
- No `repositories/` — direct SQLAlchemy session usage everywhere
- `api/reconstruction.py` is 329 lines — contains business logic
- Uses `print()` instead of `logging`
- Singleton pattern instead of DI

### Frontend — current reality:
- No `hooks/` directory — logic lives in page components
- No `types/` directory — types defined inline
- `AddReconstructionPage.tsx` is 400 lines — mixes logic and rendering

### What DOES work:
- Image upload + binarization pipeline (basic flow)
- Contour detection and wall extraction
- 3D mesh generation from mask (OBJ + GLB export)
- Basic navigation with A* (prototype)
- Auth (JWT)
- Basic CRUD for reconstructions

## Project Structure — Target (not all dirs exist yet)

```
backend/app/
├── api/          ← FastAPI routers (thin layer only)
├── core/         ← config, security, exceptions, logging
├── models/       ← Pydantic models (API contracts + domain)
├── services/     ← business logic, pipeline orchestration
├── processing/   ← pure image processing functions (OpenCV)
└── db/
    ├── models/   ← SQLAlchemy ORM models
    └── repositories/  ← data access layer

frontend/src/
├── api/          ← axios functions per resource
├── components/   ← React components (UI only)
├── hooks/        ← all logic and state
├── pages/        ← page assembly
└── types/        ← TypeScript interfaces

agents/           ← agent role prompts
prompts/          ← project standards
docs/
├── research/     ← results of /research
└── features/     ← architecture documents per feature
.claude/commands/ ← slash commands
```

## Features Backlog (in order)

1. `refactor-core` — привести код в соответствие со стандартами
2. `vectorization-pipeline` — подключить ContourService + BinarizationService к пайплайну
3. `text-removal` — автоудаление текста с планов
4. `3d-builder-upgrade` — улучшение 3D-генерации
5. `floor-editor` — расстановка кабинетов, редактирование комнат
6. `building-assembly` — склейка секций в этаж, сборка этажей в здание
7. `pathfinding-astar` — улучшение A* навигации
8. `vector-editor` — ручная правка векторной маски на фронте

Start each with `/research {feature}`.