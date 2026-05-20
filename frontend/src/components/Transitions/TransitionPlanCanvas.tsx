import React, { useRef } from 'react';
import type { FloorTransition, TransitionEditorMode } from '../../types/transitions';
import styles from './TransitionPlanCanvas.module.css';

type ActiveTool = 'pan' | 'teleport' | 'delete';

interface TransitionPlanCanvasProps {
  imageUrl: string;
  transitions: FloorTransition[];
  reconstructionId: number;
  mode: TransitionEditorMode;
  activeTool?: ActiveTool;
  onCanvasClick: (x: number, y: number) => void;
  onDeleteTransition?: (id: number) => void;
}

export const TransitionPlanCanvas: React.FC<TransitionPlanCanvasProps> = ({
  imageUrl,
  transitions,
  reconstructionId,
  mode,
  activeTool = 'pan',
  onCanvasClick,
  onDeleteTransition,
}) => {
  const imgRef = useRef<HTMLImageElement>(null);

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (activeTool === 'delete') return;
    const img = imgRef.current;
    if (!img) return;
    const rect = img.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    onCanvasClick(x, y);
  };

  const fromPoints = transitions.filter((t) => t.from_reconstruction_id === reconstructionId);
  const toPoints = transitions.filter((t) => t.to_reconstruction_id === reconstructionId);

  const isCrosshair = mode.type !== 'idle' || activeTool === 'teleport';
  const isDeleteMode = activeTool === 'delete';

  return (
    <div
      className={`${styles.wrapper} ${isCrosshair ? styles.wrapperCrosshair : ''} ${isDeleteMode ? styles.wrapperDefault : ''}`}
      onClick={handleClick}
    >
      <img
        ref={imgRef}
        src={imageUrl}
        alt="Plan"
        className={styles.image}
        draggable={false}
      />
      <div className={styles.markersLayer}>
        {fromPoints.map((t) => (
          <div
            key={`from-${t.id}`}
            className={`${styles.marker} ${styles.markerFrom} ${isDeleteMode ? styles.markerDelete : ''}`}
            style={{ left: `${t.from_x * 100}%`, top: `${t.from_y * 100}%` }}
            title={isDeleteMode ? `Удалить: ${t.name}` : `FROM: ${t.name}`}
            onClick={
              isDeleteMode && onDeleteTransition
                ? (e) => { e.stopPropagation(); onDeleteTransition(t.id); }
                : undefined
            }
          >
            <span className={styles.markerLabel}>{t.name}</span>
          </div>
        ))}
        {toPoints.map((t) => (
          <div
            key={`to-${t.id}`}
            className={`${styles.marker} ${styles.markerTo} ${isDeleteMode ? styles.markerDelete : ''}`}
            style={{ left: `${t.to_x * 100}%`, top: `${t.to_y * 100}%` }}
            title={isDeleteMode ? `Удалить: ${t.name}` : `TO: ${t.name}`}
            onClick={
              isDeleteMode && onDeleteTransition
                ? (e) => { e.stopPropagation(); onDeleteTransition(t.id); }
                : undefined
            }
          >
            <span className={styles.markerLabel}>{t.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
};
