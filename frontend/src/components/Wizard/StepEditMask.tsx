import React, { useRef, useState } from 'react';
import MaskEditor from '../../components/MaskEditor';
import { ToolPanel } from '../Editor/ToolPanel';
import styles from './StepEditMask.module.css';

type EditorTool = 'crop' | 'auto' | 'brush' | 'eraser';

interface StepEditMaskProps {
  planUrl: string | null;
  maskUrl: string | null;
  onMaskSave: (blob: Blob) => void;
}

export const StepEditMask: React.FC<StepEditMaskProps> = ({ planUrl, maskUrl, onMaskSave }) => {
  const [activeTool, setActiveTool] = useState<EditorTool>('brush');
  const [brushSize, setBrushSize] = useState(6);
  const maskEditorRef = useRef<{ getBlob: () => Promise<Blob> } | null>(null);

  const handleSave = async () => {
    if (maskEditorRef.current) {
      const blob = await maskEditorRef.current.getBlob();
      onMaskSave(blob);
    }
  };

  if (!planUrl) {
    return <div className={styles.empty}>Нет изображения плана</div>;
  }

  return (
    <div className={styles.step}>
      <div className={styles.canvas}>
        <MaskEditor
          planUrl={planUrl}
          maskUrl={maskUrl ?? undefined}
          onSave={handleSave}
        />
      </div>
      <ToolPanel
        activeTool={activeTool}
        brushSize={brushSize}
        onToolChange={setActiveTool}
        onBrushSizeChange={setBrushSize}
      />
    </div>
  );
};
