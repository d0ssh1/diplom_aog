# Phase 11: Frontend — Components (Step 1)

phase: 11
layer: frontend
depends_on: [phase-08]
design: ../README.md

## Goal

Implement Step 1 components: plan selection form with building/floor selection and plan cards.

## Context

**Depends on Phase 8 (types).**

**Pattern:** Follow `frontend/src/components/Wizard/StepUpload.tsx` structure.

## Files to Create

### `frontend/src/components/Stitching/PlanSelectionStep.tsx`

**Purpose:** Step 1 form for selecting plans to stitch.

**Implementation details:**
- **Building dropdown:** Select from existing buildings
- **Floor number input:** Numeric input
- **Plan cards:** Grid of available reconstructions with preview, checkbox
- **Validation:** Disable "Далее" if <2 plans selected

**Component interface:**

```typescript
import React, { useState, useEffect } from 'react';
import type { ReconstructionListItem } from '../../types/stitching';

interface PlanSelectionStepProps {
  onNext: (selectedIds: string[], buildingId: string, floorNumber: number) => void;
  onCancel: () => void;
}

export const PlanSelectionStep: React.FC<PlanSelectionStepProps> = ({
  onNext,
  onCancel,
}) => {
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [selectedBuildingId, setSelectedBuildingId] = useState<string>('');
  const [floorNumber, setFloorNumber] = useState<number>(1);
  const [reconstructions, setReconstructions] = useState<ReconstructionListItem[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(false);

  // Load buildings on mount
  useEffect(() => {
    // Fetch buildings from API
  }, []);

  // Load reconstructions when building/floor changes
  useEffect(() => {
    if (!selectedBuildingId) return;
    // Fetch reconstructions for building + floor
  }, [selectedBuildingId, floorNumber]);

  const handleToggleSelection = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleNext = () => {
    if (selectedIds.size < 2) return;
    onNext(Array.from(selectedIds), selectedBuildingId, floorNumber);
  };

  const isNextDisabled = selectedIds.size < 2 || !selectedBuildingId;

  return (
    <div className="plan-selection-step">
      {/* Building dropdown */}
      <div className="form-group">
        <label>Здание</label>
        <select
          value={selectedBuildingId}
          onChange={(e) => setSelectedBuildingId(e.target.value)}
        >
          <option value="">Выберите здание</option>
          {buildings.map((b) => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </select>
      </div>

      {/* Floor number input */}
      <div className="form-group">
        <label>Номер этажа</label>
        <input
          type="number"
          value={floorNumber}
          onChange={(e) => setFloorNumber(parseInt(e.target.value, 10))}
          min={0}
        />
      </div>

      {/* Plan cards grid */}
      {reconstructions.length === 0 && !isLoading && (
        <div className="empty-state">
          <p>Для сшивания нужно минимум 2 обработанных плана</p>
          <button onClick={() => window.location.href = '/wizard'}>
            Загрузить план
          </button>
        </div>
      )}

      {reconstructions.length > 0 && (
        <div className="plan-cards-grid">
          {reconstructions.map((recon) => (
            <div
              key={recon.id}
              className={`plan-card ${selectedIds.has(String(recon.id)) ? 'selected' : ''}`}
              onClick={() => handleToggleSelection(String(recon.id))}
            >
              <input
                type="checkbox"
                checked={selectedIds.has(String(recon.id))}
                onChange={() => {}}
              />
              <img src={recon.preview_url} alt={recon.name} />
              <div className="plan-card-info">
                <h4>{recon.name}</h4>
                <p>{recon.rooms_count} комнат, {recon.walls_count} стен</p>
                <p className="date">{new Date(recon.created_at).toLocaleDateString()}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Navigation buttons */}
      <div className="step-navigation">
        <button onClick={onCancel} className="btn-secondary">
          Отмена
        </button>
        <button
          onClick={handleNext}
          disabled={isNextDisabled}
          className="btn-primary"
        >
          &gt; Далее
        </button>
      </div>
    </div>
  );
};
```

**Styling:** Match existing wizard steps (dark theme, orange accent `#E8593C`).

**Reference:** Ticket section "Шаг 1 — Форма выбора" (lines 29-42) and `frontend/src/components/Wizard/StepUpload.tsx`

## Files to Modify

None.

## Verification

- [ ] `npx tsc --noEmit` passes
- [ ] Component renders without errors
- [ ] Building dropdown loads buildings
- [ ] Floor number input accepts numbers
- [ ] Plan cards display with preview images
- [ ] Checkbox selection works
- [ ] "Далее" button disabled when <2 plans selected
- [ ] Empty state shows when no plans available
- [ ] Styling matches existing wizard steps
