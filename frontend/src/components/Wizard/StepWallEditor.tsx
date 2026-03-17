import React, { useEffect, useRef, useState } from 'react';
import { Pencil, Eraser, Square, ArrowUpDown, ArrowUp, StretchHorizontal, DoorOpen } from 'lucide-react';
import { ToolPanelV2 } from '../Editor/ToolPanelV2';
import { WallEditorCanvas } from '../Editor/WallEditorCanvas';
import type { WallEditorCanvasRef } from '../Editor/WallEditorCanvas';
import { RoomPopup } from '../Editor/RoomPopup';
import { reconstructionApi } from '../../api/apiService';
import type { CropRect } from '../../types/wizard';
import styles from './StepWallEditor.module.css';

type ActiveTool = 'wall' | 'eraser' | 'room' | 'staircase' | 'elevator' | 'corridor' | 'door';

interface PopupState {
  position: { x: number; y: number };
  roomType: 'room' | 'staircase' | 'elevator' | 'corridor';
  onConfirm: (name: string) => void;
  onCancel: () => void;
}

interface StepWallEditorProps {
  maskUrl: string;
  planFileId: string | null;
  cropRect: CropRect | null;
  rotation: number;
  blockSize: number;
  thresholdC: number;
  canvasRef: React.RefObject<WallEditorCanvasRef>;
  onBlockSizeChange: (v: number) => void;
  onThresholdCChange: (v: number) => void;
}

const SECTIONS = [
  {
    title: '// РЕДАКТОР СТЕН',
    tools: [
      { id: 'wall', label: 'Нарисовать стену', icon: <Pencil size={20} /> },
      { id: 'eraser', label: 'Стереть', icon: <Eraser size={20} /> },
    ],
  },
  {
    title: '// РАЗМЕТКА',
    tools: [
      { id: 'room', label: 'Кабинет', icon: <Square size={20} /> },
      { id: 'staircase', label: 'Лестница', icon: <ArrowUpDown size={20} /> },
      { id: 'elevator', label: 'Лифт', icon: <ArrowUp size={20} /> },
      { id: 'corridor', label: 'Коридор', icon: <StretchHorizontal size={20} /> },
      { id: 'door', label: 'Дверь', icon: <DoorOpen size={20} /> },
    ],
  },
];

export const StepWallEditor: React.FC<StepWallEditorProps> = ({
  maskUrl,
  planFileId,
  cropRect,
  rotation,
  blockSize,
  thresholdC,
  canvasRef,
  onBlockSizeChange,
  onThresholdCChange,
}) => {
  const [activeTool, setActiveTool] = useState<ActiveTool>('wall');
  const [brushSize, setBrushSize] = useState(6);
  const [popupState, setPopupState] = useState<PopupState | null>(null);
  const [currentMaskUrl, setCurrentMaskUrl] = useState(maskUrl);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const previewUrlRef = useRef<string | null>(null);

  // Debounced preview on slider change
  useEffect(() => {
    if (!planFileId) return;

    const timer = setTimeout(async () => {
      setIsPreviewLoading(true);
      try {
        const url = await reconstructionApi.previewMask(
          planFileId, cropRect, rotation, blockSize, thresholdC,
        );
        if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
        previewUrlRef.current = url;
        setCurrentMaskUrl(url);
      } catch (err) {
        console.error('Preview failed:', err);
      } finally {
        setIsPreviewLoading(false);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [blockSize, thresholdC, planFileId, cropRect, rotation]);

  // Cleanup blob URL on unmount
  useEffect(() => {
    return () => {
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    };
  }, []);

  const handleToolChange = (id: string) => {
    setActiveTool(id as ActiveTool);
  };

  const handleRoomPopupRequest = (
    rect: { x: number; y: number; w: number; h: number },
    onConfirm: (name: string) => void,
    onCancel: () => void,
  ) => {
    const roomType = activeTool as 'room' | 'staircase' | 'elevator' | 'corridor';
    setPopupState({
      position: { x: rect.x, y: rect.y },
      roomType,
      onConfirm,
      onCancel,
    });
  };

  const handlePopupConfirm = (name: string) => {
    if (!popupState) return;
    popupState.onConfirm(name);
    setPopupState(null);
  };

  const handlePopupCancel = () => {
    if (!popupState) return;
    popupState.onCancel();
    setPopupState(null);
  };

  const blockSizePct = ((blockSize - 7) / (51 - 7)) * 100;
  const thresholdCPct = ((thresholdC - 2) / (20 - 2)) * 100;

  return (
    <div className={styles.step}>
      <div className={styles.canvasArea}>
        <div className={styles.gridBg} />
        <div className={styles.canvasBox}>
          <WallEditorCanvas
            ref={canvasRef}
            maskUrl={currentMaskUrl}
            activeTool={activeTool}
            brushSize={brushSize}
            onRoomPopupRequest={handleRoomPopupRequest}
          />
          {popupState && (
            <RoomPopup
              position={popupState.position}
              roomType={popupState.roomType}
              onConfirm={handlePopupConfirm}
              onCancel={handlePopupCancel}
            />
          )}
        </div>
      </div>

      <ToolPanelV2
        sections={SECTIONS}
        activeTool={activeTool}
        onToolChange={handleToolChange}
        brushSize={brushSize}
        onBrushSizeChange={setBrushSize}
        extraContent={
          <div className={styles.paramSection}>
            <h4 className={styles.paramSectionTitle}>// НАСТРОЙКА</h4>

            <div className={styles.paramRow}>
              <span className={styles.paramLabel}>Чувствительность</span>
              <div className={styles.sliderRow}>
                <input
                  type="range"
                  className={styles.sliderInput}
                  min={7} max={51} step={2}
                  value={blockSize}
                  onChange={(e) => onBlockSizeChange(Number(e.target.value))}
                  style={{ background: `linear-gradient(to right, #FF5722 ${blockSizePct}%, #3a3a3a ${blockSizePct}%)` }}
                />
                <span className={styles.sliderValue}>{blockSize}</span>
              </div>
            </div>

            <div className={styles.paramRow}>
              <span className={styles.paramLabel}>Контраст</span>
              <div className={styles.sliderRow}>
                <input
                  type="range"
                  className={styles.sliderInput}
                  min={2} max={20} step={1}
                  value={thresholdC}
                  onChange={(e) => onThresholdCChange(Number(e.target.value))}
                  style={{ background: `linear-gradient(to right, #FF5722 ${thresholdCPct}%, #3a3a3a ${thresholdCPct}%)` }}
                />
                <span className={styles.sliderValue}>{thresholdC}</span>
              </div>
            </div>

            {isPreviewLoading && <div className={styles.previewSpinner}>Обновление...</div>}
          </div>
        }
      />
    </div>
  );
};
