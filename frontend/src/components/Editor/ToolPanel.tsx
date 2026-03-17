import React from 'react';
import { Crop, Sparkles, Paintbrush, Eraser } from 'lucide-react';
import { IconButton } from '../UI/IconButton';
import { Slider } from '../UI/Slider';
import styles from './ToolPanel.module.css';

type EditorTool = 'crop' | 'auto' | 'brush' | 'eraser';

interface ToolPanelProps {
  activeTool: EditorTool;
  brushSize: number;
  onToolChange: (tool: EditorTool) => void;
  onBrushSizeChange: (size: number) => void;
}

export const ToolPanel: React.FC<ToolPanelProps> = ({
  activeTool,
  brushSize,
  onToolChange,
  onBrushSizeChange,
}) => {
  return (
    <div className={styles.panel}>
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>// Кадрирование</h3>
        <div className={styles.buttons}>
          <IconButton
            icon={<Crop size={32} />}
            active={activeTool === 'crop'}
            onClick={() => onToolChange('crop')}
            title="Кадрирование"
          />
          <IconButton
            icon={<Sparkles size={32} />}
            active={activeTool === 'auto'}
            onClick={() => onToolChange('auto')}
            title="Авто"
          />
        </div>
      </section>

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>// Редактировать</h3>
        <div className={styles.buttons}>
          <IconButton
            icon={<Paintbrush size={32} />}
            active={activeTool === 'brush'}
            onClick={() => onToolChange('brush')}
            title="Кисть"
          />
          <IconButton
            icon={<Eraser size={32} />}
            active={activeTool === 'eraser'}
            onClick={() => onToolChange('eraser')}
            title="Ластик"
          />
        </div>
      </section>

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>// Толщина</h3>
        <Slider
          value={brushSize}
          min={1}
          max={50}
          onChange={onBrushSizeChange}
          label="px"
        />
      </section>
    </div>
  );
};
