# Phase 13: Frontend — Page

phase: 13
layer: frontend
depends_on: [phase-11, phase-12]
design: ../README.md

## Goal

Implement main stitching page that orchestrates the two-step workflow and integrates all components.

## Context

**Depends on Phase 11 (Step 1 components) and Phase 12 (Step 2 components).**

**Pattern:** Follow `frontend/src/pages/WizardPage.tsx` structure.

## Files to Create

### `frontend/src/hooks/useStitching.ts`

**Purpose:** Main state management hook for stitching workflow.

**Implementation details:**
- Manages step navigation (1 → 2)
- Loads reconstructions from API
- Manages layer state
- Handles API call to stitch plans

```typescript
import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import type { StitchingState, LayerData, StitchingRequest } from '../types/stitching';
import { apiService } from '../api/apiService';

interface UseStitchingReturn {
  state: StitchingState;
  loadReconstructions: (buildingId: string, floorNumber: number) => Promise<void>;
  selectPlans: (ids: string[], buildingId: string, floorNumber: number) => void;
  nextStep: () => void;
  prevStep: () => void;
  updateLayer: (layerId: string, updates: Partial<LayerData>) => void;
  submitStitching: (name: string) => Promise<void>;
}

export const useStitching = (): UseStitchingReturn => {
  const navigate = useNavigate();
  const [state, setState] = useState<StitchingState>({
    step: 1,
    selectedReconstructionIds: [],
    buildingId: '',
    floorNumber: 1,
    layers: [],
    activeTool: 'move',
    selectedLayerId: null,
    isLoading: false,
    error: null,
  });

  const loadReconstructions = useCallback(async (buildingId: string, floorNumber: number) => {
    setState((prev) => ({ ...prev, isLoading: true, error: null }));
    try {
      const reconstructions = await apiService.getReadyReconstructions(buildingId, floorNumber);
      // Store reconstructions in state or return them
      setState((prev) => ({ ...prev, isLoading: false }));
    } catch (error) {
      setState((prev) => ({ ...prev, isLoading: false, error: String(error) }));
    }
  }, []);

  const selectPlans = useCallback((ids: string[], buildingId: string, floorNumber: number) => {
    setState((prev) => ({
      ...prev,
      selectedReconstructionIds: ids,
      buildingId,
      floorNumber,
    }));
  }, []);

  const nextStep = useCallback(() => {
    setState((prev) => ({ ...prev, step: 2 as 1 | 2 }));
  }, []);

  const prevStep = useCallback(() => {
    setState((prev) => ({ ...prev, step: 1 as 1 | 2 }));
  }, []);

  const updateLayer = useCallback((layerId: string, updates: Partial<LayerData>) => {
    setState((prev) => ({
      ...prev,
      layers: prev.layers.map((layer) =>
        layer.reconstructionId === layerId ? { ...layer, ...updates } : layer
      ),
    }));
  }, []);

  const submitStitching = useCallback(async (name: string) => {
    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    try {
      const request: StitchingRequest = {
        name,
        building_id: state.buildingId,
        floor_number: state.floorNumber,
        source_plans: state.layers.map((layer) => ({
          reconstruction_id: layer.reconstructionId,
          transform: layer.transform,
          clip_polygons: layer.clipPolygons,
          rect_crop: layer.rectCrop,
          image_width_px: layer.imageWidth,
          image_height_px: layer.imageHeight,
          z_index: layer.zIndex,
        })),
      };

      const response = await apiService.postStitching(request);

      // Navigate to new reconstruction
      navigate(`/reconstructions/${response.id}`);
    } catch (error) {
      setState((prev) => ({ ...prev, isLoading: false, error: String(error) }));
    }
  }, [state, navigate]);

  return {
    state,
    loadReconstructions,
    selectPlans,
    nextStep,
    prevStep,
    updateLayer,
    submitStitching,
  };
};
```

### `frontend/src/pages/StitchingPage.tsx`

**Purpose:** Main page component that orchestrates the workflow.

```typescript
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useStitching } from '../hooks/useStitching';
import { useStitchingHistory } from '../hooks/useStitchingHistory';
import { PlanSelectionStep } from '../components/Stitching/PlanSelectionStep';
import { StitchingCanvas } from '../components/Stitching/StitchingCanvas';
import { StitchingSidebar } from '../components/Stitching/StitchingSidebar';
import { WizardShell } from '../components/Wizard/WizardShell';

export const StitchingPage: React.FC = () => {
  const navigate = useNavigate();
  const stitching = useStitching();
  const history = useStitchingHistory();

  const { state } = stitching;

  const handleNext = () => {
    if (state.step === 1) {
      stitching.nextStep();
    } else if (state.step === 2) {
      const name = prompt('Введите название объединённого плана:');
      if (name) {
        stitching.submitStitching(name);
      }
    }
  };

  const handlePrev = () => {
    if (state.step === 1) {
      navigate('/admin');
    } else if (state.step === 2) {
      if (window.confirm('Вернуться к выбору планов? Все изменения будут потеряны.')) {
        stitching.prevStep();
      }
    }
  };

  const handleUndo = () => {
    const snapshot = history.undo();
    if (snapshot) {
      // Restore snapshot to canvas
    }
  };

  const handleRedo = () => {
    const snapshot = history.redo();
    if (snapshot) {
      // Restore snapshot to canvas
    }
  };

  const isNextDisabled =
    (state.step === 1 && state.selectedReconstructionIds.length < 2) ||
    state.isLoading;

  const nextLabel = state.step === 2 ? '> СШИТЬ' : undefined;

  return (
    <WizardShell
      currentStep={state.step}
      totalSteps={2}
      onNext={handleNext}
      onPrev={handlePrev}
      isNextDisabled={isNextDisabled}
      nextLabel={nextLabel}
      hideFooter={state.step === 2}
    >
      {state.step === 1 && (
        <PlanSelectionStep
          onNext={(ids, buildingId, floorNumber) => {
            stitching.selectPlans(ids, buildingId, floorNumber);
            stitching.nextStep();
          }}
          onCancel={() => navigate('/admin')}
        />
      )}

      {state.step === 2 && (
        <div className="stitching-editor">
          <div className="stitching-canvas-area">
            <div className="stitching-toolbar">
              <button onClick={handleUndo} disabled={!history.canUndo}>
                ↶ Отменить
              </button>
              <button onClick={handleRedo} disabled={!history.canRedo}>
                ↷ Повторить
              </button>
            </div>
            <StitchingCanvas
              layers={state.layers}
              activeTool={state.activeTool}
              onLayerUpdate={stitching.updateLayer}
              onSnapshotPush={history.pushState}
              onUndo={handleUndo}
              onRedo={handleRedo}
            />
          </div>
          <StitchingSidebar
            activeTool={state.activeTool}
            onToolChange={(tool) => {
              // Update active tool
            }}
            layers={state.layers}
            selectedLayerId={state.selectedLayerId}
            onLayerSelect={(id) => {
              // Update selected layer
            }}
            onLayerMove={(id, direction) => {
              // Update z-order
            }}
            onMaskOpacityChange={(id, opacity) => {
              stitching.updateLayer(id, { maskOpacity: opacity });
            }}
            onShowMaskToggle={(id) => {
              const layer = state.layers.find((l) => l.reconstructionId === id);
              if (layer) {
                stitching.updateLayer(id, { showMask: !layer.showMask });
              }
            }}
            onPropertyChange={(id, property, value) => {
              const layer = state.layers.find((l) => l.reconstructionId === id);
              if (layer) {
                stitching.updateLayer(id, {
                  transform: { ...layer.transform, [property]: value },
                });
              }
            }}
          />
          <div className="stitching-footer">
            <button onClick={handlePrev} className="btn-secondary">
              Назад
            </button>
            <button onClick={handleNext} className="btn-primary">
              &gt; СШИТЬ
            </button>
          </div>
        </div>
      )}
    </WizardShell>
  );
};
```

**Reference:** Ticket section "Шаг 2 — Редактор сшивания" (lines 44-50) and `frontend/src/pages/WizardPage.tsx`

## Files to Modify

### `frontend/src/App.tsx`

**Add route:**

```typescript
import { StitchingPage } from './pages/StitchingPage';

// In routes:
<Route path="/stitching" element={<StitchingPage />} />
```

### `frontend/src/api/apiService.ts`

**Add API methods:**

```typescript
export const apiService = {
  // ... existing methods

  getReadyReconstructions: async (
    buildingId?: string,
    floorNumber?: number
  ): Promise<ReconstructionListItem[]> => {
    const params = new URLSearchParams();
    params.append('status', 'ready_for_stitching');
    if (buildingId) params.append('building_id', buildingId);
    if (floorNumber !== undefined) params.append('floor_number', String(floorNumber));

    const response = await fetch(`/api/v1/reconstructions?${params.toString()}`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    });

    if (!response.ok) throw new Error('Failed to load reconstructions');
    return response.json();
  },

  postStitching: async (request: StitchingRequest): Promise<StitchingResponse> => {
    const response = await fetch('/api/v1/stitching/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${getToken()}`,
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Stitching failed');
    }

    return response.json();
  },
};
```

### `frontend/src/components/Layout/Sidebar.tsx`

**Add menu item:**

```typescript
<nav>
  {/* ... existing items */}
  <a href="/stitching">Сшивание планов</a>
</nav>
```

## Verification

- [ ] `npx tsc --noEmit` passes
- [ ] Page renders without errors
- [ ] Step 1 → Step 2 navigation works
- [ ] Step 2 → Step 1 back navigation with confirmation
- [ ] Canvas loads plans on step 2
- [ ] Undo/redo buttons work
- [ ] Submit stitching calls API
- [ ] Success redirects to new reconstruction
- [ ] Error shows toast/message
- [ ] Route registered in App.tsx
- [ ] Menu item added to sidebar
- [ ] Styling matches existing pages (dark theme, orange accent)
