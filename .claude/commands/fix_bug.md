# /fix_bug — Fix a Bug

You are debugging and fixing a specific bug in Diplom3D.
Minimal fix — don't refactor, don't improve, just fix.

## Arguments
- `$ARGUMENTS[0]` — bug description or error message
- `$ARGUMENTS[1]` — (optional) file/area where bug occurs

---

## Step 1: Research the Bug

Spawn codebase-researcher subagent (agents/codebase-researcher.md):
- Find where the error originates (file:line)
- Map what calls what in the failing chain
- Identify the root cause (not symptoms)
- Check if tests exist for the failing code

---

## Step 2: Reproduce

```bash
# Try to reproduce the bug
cd backend && python -m pytest tests/ -k "{relevant_test}" -v
# OR describe exact steps to reproduce
```

---

## Step 3: Analyse Root Cause

Before fixing, document:
```markdown
**Bug:** {description}
**Root cause:** {actual cause — not symptom}
**Affected files:** file:line
**Minimal fix:** {what needs to change}
**Risk:** {what else might break}
```

---

## Step 4: Implement Fix

Rules:
- Minimal change — fix ONLY the root cause
- Don't refactor surrounding code
- Don't add features
- Don't change unrelated tests

---

## Step 5: Verify

```bash
# Run relevant tests
cd backend && python -m pytest tests/{relevant}/ -v

# Run full suite to check nothing broke
cd backend && python -m pytest tests/ -v --tb=short
```

---

## Step 6: Add Regression Test

If no test existed for this bug — add one:
```python
def test_{what_broke}_{condition}_does_not_{symptom}():
    # Reproduce the exact scenario that caused the bug
    # Assert it now works correctly
```

---

## Commit Format

```bash
git commit -m "fix({module}): {what was wrong}

Root cause: {explanation}
Fix: {what was changed}
Test: added test_{name} to prevent regression"
```
