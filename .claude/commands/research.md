# /research — Research Codebase

You are a codebase researcher. Read the project standards first, then investigate.

## Arguments
- `$ARGUMENTS[0]` — feature name or area to research (e.g. `floor-editor`, `vectorization`, `3d-build`)
- `$ARGUMENTS[1]` — (optional) specific question or focus area

If no arguments provided, ask:
> What area of the codebase should I research? (e.g. `floor-editor`, `pathfinding`, `building-assembly`)

---

## Step 1: Read Standards

Read ALL files in `prompts/` to understand what the project SHOULD look like:
- `architecture.md` — layers, dependencies, domain model
- `pipeline.md` — processing chain
- `python_style.md` — naming, patterns
- `frontend_style.md` — React/Three.js patterns
- `cv_patterns.md` — OpenCV rules
- `testing.md` — test structure

Also read `CLAUDE.md` section "Current Code State" — this tells you where reality differs from standards.

---

## Step 2: Spawn Parallel Research Tasks

Launch 2-3 parallel subagents using the Task tool (use `agents/codebase-researcher.md` role).
Each task has a SPECIFIC focus. Do NOT give them broad "look at everything" instructions.

### Task 1: Architecture & Structure Analysis

```
Analyze the architecture relevant to "{feature}" in the Diplom3D codebase:

BACKEND — scan and document:
1. backend/app/api/ — list all routers and endpoints (method, path, handler function) relevant to {feature}
2. backend/app/processing/ — list all functions/classes with signatures, what they do, input/output types
3. backend/app/models/ — list all Pydantic models and their fields
4. backend/app/db/models/ — list all ORM models, their columns, relationships
5. backend/app/services/ — list service classes if they exist (NOTE: this dir may not exist yet)
6. backend/main.py — how the app is assembled, middleware, router registration

FRONTEND — scan and document:
1. frontend/src/components/ — list components relevant to {feature}, their props
2. frontend/src/pages/ — list pages, what components they use
3. frontend/src/api/ — list API client functions
4. frontend/src/hooks/ — list hooks if they exist (NOTE: this dir may not exist yet)

For each item report: file:line, function signature, what it does.
Facts only. No opinions, no suggestions.
```

### Task 2: Pattern Discovery

```
Find implementation patterns relevant to "{feature}" in the Diplom3D codebase:

1. CLOSEST ANALOG — find the most similar existing feature. Document its FULL structure:
   - Which files, in which layers (api/ → services/ → processing/ → db/)
   - How data flows from HTTP request to database and back
   - How it handles errors
   - How it's tested (find test files)

2. REUSABLE COMPONENTS — find existing code that could be reused:
   - Shared utility functions
   - Common Pydantic models
   - Shared OpenCV operations
   - Shared React components or hooks

3. NAMING PATTERNS — how are things named in this project:
   - Router file names, endpoint paths
   - Service class names
   - Processing function names
   - Test file and test function names

Report file:line for everything. Facts only, no opinions.
```

### Task 3: Integration Points (if feature touches multiple modules)

```
Map integration points for "{feature}" in the Diplom3D codebase:

1. DATABASE — which tables/collections are affected:
   - Existing ORM models that will be modified
   - Existing migrations (backend/alembic/versions/)
   - How database sessions are managed (look for async_session_maker usage)

2. FILE STORAGE — how files are stored and accessed:
   - Upload directory structure (settings.UPLOAD_DIR)
   - How images/masks/models are saved and loaded
   - File naming conventions

3. API BOUNDARIES — what the frontend expects:
   - How frontend calls backend (look in frontend/src/api/)
   - What response shapes the frontend parses
   - Auth/token handling

4. PROCESSING PIPELINE — if relevant:
   - Current pipeline order (which function calls which)
   - Where the pipeline is triggered (which endpoint/service)
   - Intermediate file storage (tmp/ directory)

Report file:line for everything. Facts only, no opinions.
```

---

## Step 3: Synthesize and Save

After all tasks complete, create:
```bash
mkdir -p docs/research
```

Save to: `docs/research/$ARGUMENTS[0].md`

The document format:

```markdown
# Research: {Feature Name}
date: YYYY-MM-DD

## Summary
[2-3 paragraphs: what exists, what's relevant, what's missing for this feature]

## Architecture — Current State

### Backend Structure (relevant to {feature})
- `path/to/file.py:line` — description of what this does
- Key functions: `function_name(args) -> return` — purpose

### Frontend Structure (relevant to {feature})
- `path/to/file.tsx:line` — description
- Key components: `ComponentName` — props and purpose

### Database Models
- `ORM Model` (path:line) — columns and relationships

## Closest Analog Feature
[Name of most similar existing feature]
- Files: [list with paths]
- Data flow: [how request flows through layers]
- Test approach: [how it's tested]

## Existing Patterns to Reuse
- [Pattern 1] — found at file:line
- [Pattern 2] — found at file:line

## Integration Points
- Database: [which models/tables affected]
- File storage: [how files are handled]
- API: [existing endpoints that relate]
- Pipeline: [which processing steps relate]

## Gaps (what's missing for this feature)
- [Missing item 1 — e.g. "no services/ layer exists"]
- [Missing item 2 — e.g. "no hooks/ directory in frontend"]
- [Missing item 3 — e.g. "no tests for processing functions"]

## Key Files
- `path/to/file.py` — why it's relevant
```

**Rules for this document:**
- ONLY facts — no opinions, no suggestions, no "I recommend"
- Every finding has file:line reference
- Note where actual code DIFFERS from standards in prompts/
- If something is unclear — write "unclear, needs investigation"

---

## Step 4: Present to User

```
## Research Complete: {feature}

**Key findings:**
- [Finding 1 — what exists]
- [Finding 2 — what's missing]
- [Finding 3 — closest analog feature]

**Gaps identified:** [N items that need to be built]

**Saved to:** docs/research/{feature}.md

**Next step:** `/design_feature {feature} {backend|frontend|fullstack} {description}`
```
