# Phase 9: Frontend — Hooks (History)

phase: 9
layer: frontend
depends_on: [phase-08]
design: ../README.md

## Goal

Implement undo/redo hook for canvas state management. Snapshot-based with FIFO limit of 50.

## Context

**Depends on Phase 8 (types).**

**Pattern:** Custom hook with state management, no side effects.

## Files to Create

### `frontend/src/hooks/useStitchingHistory.ts`

**Purpose:** Undo/redo state management for canvas.

**Implementation details:**
- **Snapshot-based:** Store full state after each action (not delta)
- **FIFO limit:** Max 50 snapshots, remove oldest when exceeded
- **Undo/redo:** Navigate through history array

**Hook interface:**

```typescript
import { useState, useCallback } from 'react';
import type { StitchingSnapshot } from '../types/stitching';

interface UseStitchingHistoryReturn {
  pushState: (snapshot: StitchingSnapshot) => void;
  undo: () => StitchingSnapshot | null;
  redo: () => StitchingSnapshot | null;
  canUndo: boolean;
  canRedo: boolean;
  clear: () => void;
}

export const useStitchingHistory = (
  maxSteps: number = 50
): UseStitchingHistoryReturn => {
  const [history, setHistory] = useState<StitchingSnapshot[]>([]);
  const [currentIndex, setCurrentIndex] = useState<number>(-1);

  const pushState = useCallback((snapshot: StitchingSnapshot) => {
    setHistory((prev) => {
      // Cut off "future" if we're not at the end
      const newHistory = prev.slice(0, currentIndex + 1);

      // Add new snapshot
      newHistory.push(snapshot);

      // FIFO: remove oldest if > maxSteps
      if (newHistory.length > maxSteps) {
        newHistory.shift();
        setCurrentIndex(newHistory.length - 1);
      } else {
        setCurrentIndex(newHistory.length - 1);
      }

      return newHistory;
    });
  }, [currentIndex, maxSteps]);

  const undo = useCallback((): StitchingSnapshot | null => {
    if (currentIndex <= 0) return null;

    const newIndex = currentIndex - 1;
    setCurrentIndex(newIndex);
    return history[newIndex];
  }, [currentIndex, history]);

  const redo = useCallback((): StitchingSnapshot | null => {
    if (currentIndex >= history.length - 1) return null;

    const newIndex = currentIndex + 1;
    setCurrentIndex(newIndex);
    return history[newIndex];
  }, [currentIndex, history]);

  const clear = useCallback(() => {
    setHistory([]);
    setCurrentIndex(-1);
  }, []);

  const canUndo = currentIndex > 0;
  const canRedo = currentIndex < history.length - 1;

  return {
    pushState,
    undo,
    redo,
    canUndo,
    canRedo,
    clear,
  };
};
```

**Reference:** 02-behavior.md "Canvas Tool State" and ticket section "Undo/Redo" (lines 148-174)

## Files to Modify

None.

## Verification

- [ ] `npx tsc --noEmit` passes
- [ ] Hook follows React hooks rules (no conditional calls)
- [ ] FIFO limit enforced (max 50 snapshots)
- [ ] Undo/redo navigation correct
- [ ] canUndo/canRedo flags correct
- [ ] Clear resets state
- [ ] No memory leaks (snapshots properly garbage collected)
