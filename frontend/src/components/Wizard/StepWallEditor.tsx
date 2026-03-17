import React, { useState } from 'react';
import { Pencil, Eraser, Square, ArrowUpDown, ArrowUp, StretchHorizontal, DoorOpen } from 'lucide-react';
import { ToolPanelV2 } from '../Editor/ToolPanelV2';
import { WallEditorCanvas } from '../Editor/WallEditorCanvas';
import type { WallEditorCanvasRef } from '../Editor/WallEditorCanvas';
import { RoomPopup } from '../Editor/RoomPopup';
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
  canvasRef: React.RefObject<WallEditorCanvasRef>;
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

export const StepWallEditor: React.FC<StepWallEditorProps> = ({ maskUrl, canvasRef }) => {
  const [activeTool, setActiveTool] = useState<ActiveTool>('wall');
  const [brushSize, setBrushSize] = useState(6);
  const [popupState, setPopupState] = useState<PopupState | null>(null);

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

  return (
    <div className={styles.step}>
      <div className={styles.canvasArea}>
        <div className={styles.gridBg} />
        <div className={styles.canvasBox}>
          <WallEditorCanvas
            ref={canvasRef}
            maskUrl={maskUrl}
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
      />
    </div>
  );
};
