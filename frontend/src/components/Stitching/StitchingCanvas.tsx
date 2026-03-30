import React, { useRef, useEffect } from 'react';
import type { LayerData } from '../../types/stitching';
import { useStitchingCanvas } from '../../hooks/useStitchingCanvas';
import styles from './StitchingCanvas.module.css';

interface StitchingCanvasProps {
  layers: LayerData[];
  activeTool: "move" | "rotate" | "rect_crop" | "polygon_clip";
  onLayerUpdate: (layerId: string, updates: Partial<LayerData>) => void;
  onSnapshotPush: (snapshot: unknown) => void;
  onUndo: () => void;
  onRedo: () => void;
}

export const StitchingCanvas: React.FC<StitchingCanvasProps> = ({
  layers,
  onLayerUpdate,
  onSnapshotPush,
  onUndo,
  onRedo,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  const { loadPlanToCanvas } = useStitchingCanvas({
    containerRef,
    layers,
    onLayerUpdate,
    onSnapshotPush,
  });

  // Load plans to canvas when layers change
  useEffect(() => {
    if (layers.length > 0) {
      layers.forEach((layer) => {
        loadPlanToCanvas(layer);
      });
    }
  }, [layers.length]); // Only trigger when number of layers changes

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        onUndo();
      } else if (e.ctrlKey && e.shiftKey && e.key === 'Z') {
        e.preventDefault();
        onRedo();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onUndo, onRedo]);

  return (
    <div ref={containerRef} className={styles.stitchingCanvasContainer}>
      <canvas id="stitching-canvas" />
      <div className={styles.canvasHint}>
        Пробел + мышь = перемещение холста
      </div>
    </div>
  );
};
