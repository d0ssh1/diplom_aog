import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useStitching } from '../hooks/useStitching';
import { useStitchingHistory } from '../hooks/useStitchingHistory';
import { PlanSelectionStep } from '../components/Stitching/PlanSelectionStep';
import { StitchingCanvas } from '../components/Stitching/StitchingCanvas';
import { StitchingSidebar } from '../components/Stitching/StitchingSidebar';
import { WizardShell } from '../components/Wizard/WizardShell';
import type { StitchingSnapshot } from '../types/stitching';

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
      // Restore layers from snapshot
      snapshot.layers.forEach((layerSnapshot) => {
        stitching.updateLayer(layerSnapshot.reconstructionId, {
          transform: layerSnapshot.transform,
          clipPolygons: layerSnapshot.clipPolygons,
          rectCrop: layerSnapshot.rectCrop,
          zIndex: layerSnapshot.zIndex,
        });
      });
    }
  };

  const handleRedo = () => {
    const snapshot = history.redo();
    if (snapshot) {
      // Restore layers from snapshot
      snapshot.layers.forEach((layerSnapshot) => {
        stitching.updateLayer(layerSnapshot.reconstructionId, {
          transform: layerSnapshot.transform,
          clipPolygons: layerSnapshot.clipPolygons,
          rectCrop: layerSnapshot.rectCrop,
          zIndex: layerSnapshot.zIndex,
        });
      });
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
      onClose={() => navigate('/admin')}
      nextDisabled={isNextDisabled}
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
              onSnapshotPush={(snapshot: unknown) => {
                history.pushState(snapshot as StitchingSnapshot);
              }}
              onUndo={handleUndo}
              onRedo={handleRedo}
            />
          </div>
          <StitchingSidebar
            activeTool={state.activeTool}
            onToolChange={stitching.setActiveTool}
            layers={state.layers}
            selectedLayerId={state.selectedLayerId}
            onLayerSelect={stitching.setSelectedLayerId}
            onLayerMove={(id, direction) => {
              const layerIndex = state.layers.findIndex((l) => l.reconstructionId === id);
              if (layerIndex === -1) return;

              const newIndex = direction === 'up' ? layerIndex + 1 : layerIndex - 1;
              if (newIndex < 0 || newIndex >= state.layers.length) return;

              const newLayers = [...state.layers];
              [newLayers[layerIndex], newLayers[newIndex]] = [newLayers[newIndex], newLayers[layerIndex]];

              newLayers.forEach((layer, idx) => {
                stitching.updateLayer(layer.reconstructionId, { zIndex: idx });
              });
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
            <button onClick={handleNext} className="btn-primary" disabled={state.isLoading}>
              &gt; СШИТЬ
            </button>
          </div>
        </div>
      )}
    </WizardShell>
  );
};
