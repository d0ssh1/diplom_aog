# Phase 12: Frontend — Components (Step 2)

phase: 12
layer: frontend
depends_on: [phase-08, phase-09, phase-10]
design: ../README.md

## Goal

Implement Step 2 components: canvas editor with tools, layers, and properties panels.

## Context

**Depends on Phase 8 (types), Phase 9 (history), and Phase 10 (canvas hook).**

**Pattern:** Follow `frontend/src/components/Editor/` structure.

## Files to Create

### `frontend/src/components/Stitching/StitchingCanvas.tsx`

**Purpose:** Canvas container component.

**Implementation details:**
- Renders canvas element
- Calls useStitchingCanvas hook
- Handles keyboard shortcuts (Ctrl+Z, Ctrl+Shift+Z)

```typescript
import React, { useRef, useEffect } from 'react';
import { useStitchingCanvas } from '../../hooks/useStitchingCanvas';
import type { LayerData } from '../../types/stitching';

interface StitchingCanvasProps {
  layers: LayerData[];
  activeTool: "move" | "rotate" | "rect_crop" | "polygon_clip";
  onLayerUpdate: (layerId: string, updates: Partial<LayerData>) => void;
  onSnapshotPush: (snapshot: any) => void;
  onUndo: () => void;
  onRedo: () => void;
}

export const StitchingCanvas: React.FC<StitchingCanvasProps> = ({
  layers,
  activeTool,
  onLayerUpdate,
  onSnapshotPush,
  onUndo,
  onRedo,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  const {
    canvasRef,
    loadPlanToCanvas,
    exportState,
  } = useStitchingCanvas({
    containerRef,
    layers,
    activeTool,
    onLayerUpdate,
    onSnapshotPush,
  });

  // Load layers to canvas
  useEffect(() => {
    layers.forEach((layer) => {
      loadPlanToCanvas(layer);
    });
  }, [layers, loadPlanToCanvas]);

  // Keyboard shortcuts
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
    <div ref={containerRef} className="stitching-canvas-container">
      <canvas id="stitching-canvas" />
      <div className="canvas-hint">
        Пробел + мышь = перемещение холста
      </div>
    </div>
  );
};
```

### `frontend/src/components/Stitching/ToolPanel.tsx`

**Purpose:** Tool selection panel (right sidebar section 1).

```typescript
import React from 'react';

interface ToolPanelProps {
  activeTool: "move" | "rotate" | "rect_crop" | "polygon_clip";
  onToolChange: (tool: "move" | "rotate" | "rect_crop" | "polygon_clip") => void;
}

export const ToolPanel: React.FC<ToolPanelProps> = ({ activeTool, onToolChange }) => {
  const tools = [
    { id: "move", label: "Перемещение", icon: "↔" },
    { id: "rotate", label: "Вращение", icon: "↻" },
    { id: "rect_crop", label: "Кадрирование", icon: "▭" },
    { id: "polygon_clip", label: "Полигон. обрезка", icon: "⬡" },
  ] as const;

  return (
    <div className="tool-panel">
      <div className="section-header">// ИНСТРУМЕНТЫ</div>
      <div className="tool-buttons">
        {tools.map((tool) => (
          <button
            key={tool.id}
            className={`tool-button ${activeTool === tool.id ? 'active' : ''}`}
            onClick={() => onToolChange(tool.id)}
          >
            <span className="tool-icon">{tool.icon}</span>
            <span className="tool-label">{tool.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
};
```

### `frontend/src/components/Stitching/LayerPanel.tsx`

**Purpose:** Layer list panel (right sidebar section 2).

```typescript
import React from 'react';
import type { LayerData } from '../../types/stitching';

interface LayerPanelProps {
  layers: LayerData[];
  selectedLayerId: string | null;
  onLayerSelect: (layerId: string) => void;
  onLayerMove: (layerId: string, direction: 'up' | 'down') => void;
  onMaskOpacityChange: (layerId: string, opacity: number) => void;
  onShowMaskToggle: (layerId: string) => void;
}

export const LayerPanel: React.FC<LayerPanelProps> = ({
  layers,
  selectedLayerId,
  onLayerSelect,
  onLayerMove,
  onMaskOpacityChange,
  onShowMaskToggle,
}) => {
  return (
    <div className="layer-panel">
      <div className="section-header">// СЛОИ</div>
      <div className="layer-list">
        {layers.map((layer, index) => (
          <div
            key={layer.reconstructionId}
            className={`layer-card ${selectedLayerId === layer.reconstructionId ? 'selected' : ''}`}
            onClick={() => onLayerSelect(layer.reconstructionId)}
          >
            <div className="layer-color" style={{ backgroundColor: layer.color }} />
            <div className="layer-info">
              <div className="layer-name">{layer.name}</div>
              <div className="layer-size">{layer.imageWidth} x {layer.imageHeight} px</div>
            </div>
            <div className="layer-controls">
              <button
                onClick={(e) => { e.stopPropagation(); onLayerMove(layer.reconstructionId, 'up'); }}
                disabled={index === 0}
              >
                ↑
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); onLayerMove(layer.reconstructionId, 'down'); }}
                disabled={index === layers.length - 1}
              >
                ↓
              </button>
            </div>
            <div className="layer-mask-controls">
              <label>
                Маска
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={layer.maskOpacity * 100}
                  onChange={(e) => onMaskOpacityChange(layer.reconstructionId, parseInt(e.target.value) / 100)}
                />
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={layer.showMask}
                  onChange={() => onShowMaskToggle(layer.reconstructionId)}
                />
                Показать маску
              </label>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
```

### `frontend/src/components/Stitching/PropertiesPanel.tsx`

**Purpose:** Layer properties panel (right sidebar section 3).

```typescript
import React from 'react';
import type { LayerData } from '../../types/stitching';

interface PropertiesPanelProps {
  selectedLayer: LayerData | null;
  onPropertyChange: (property: string, value: number) => void;
}

export const PropertiesPanel: React.FC<PropertiesPanelProps> = ({
  selectedLayer,
  onPropertyChange,
}) => {
  if (!selectedLayer) {
    return (
      <div className="properties-panel">
        <div className="section-header">// СВОЙСТВА СЛОЯ</div>
        <div className="no-selection">Выберите слой</div>
      </div>
    );
  }

  return (
    <div className="properties-panel">
      <div className="section-header">// СВОЙСТВА СЛОЯ</div>
      <div className="property-controls">
        <div className="property-row">
          <label>X</label>
          <input
            type="number"
            value={Math.round(selectedLayer.transform.translate_x)}
            onChange={(e) => onPropertyChange('translate_x', parseFloat(e.target.value))}
          />
        </div>
        <div className="property-row">
          <label>Y</label>
          <input
            type="number"
            value={Math.round(selectedLayer.transform.translate_y)}
            onChange={(e) => onPropertyChange('translate_y', parseFloat(e.target.value))}
          />
        </div>
        <div className="property-row">
          <label>Угол</label>
          <input
            type="range"
            min="0"
            max="360"
            value={selectedLayer.transform.rotation_deg}
            onChange={(e) => onPropertyChange('rotation_deg', parseFloat(e.target.value))}
          />
          <span>{Math.round(selectedLayer.transform.rotation_deg)}°</span>
        </div>
        <div className="property-row">
          <label>Масштаб</label>
          <input
            type="range"
            min="50"
            max="200"
            value={selectedLayer.transform.scale_x * 100}
            onChange={(e) => onPropertyChange('scale_x', parseFloat(e.target.value) / 100)}
          />
          <span>{Math.round(selectedLayer.transform.scale_x * 100)}%</span>
        </div>
      </div>
    </div>
  );
};
```

### `frontend/src/components/Stitching/StitchingSidebar.tsx`

**Purpose:** Assemble right sidebar (combines all panels).

```typescript
import React from 'react';
import { ToolPanel } from './ToolPanel';
import { LayerPanel } from './LayerPanel';
import { PropertiesPanel } from './PropertiesPanel';
import type { LayerData } from '../../types/stitching';

interface StitchingSidebarProps {
  activeTool: "move" | "rotate" | "rect_crop" | "polygon_clip";
  onToolChange: (tool: "move" | "rotate" | "rect_crop" | "polygon_clip") => void;
  layers: LayerData[];
  selectedLayerId: string | null;
  onLayerSelect: (layerId: string) => void;
  onLayerMove: (layerId: string, direction: 'up' | 'down') => void;
  onMaskOpacityChange: (layerId: string, opacity: number) => void;
  onShowMaskToggle: (layerId: string) => void;
  onPropertyChange: (layerId: string, property: string, value: number) => void;
}

export const StitchingSidebar: React.FC<StitchingSidebarProps> = (props) => {
  const selectedLayer = props.layers.find((l) => l.reconstructionId === props.selectedLayerId) || null;

  return (
    <div className="stitching-sidebar">
      <ToolPanel
        activeTool={props.activeTool}
        onToolChange={props.onToolChange}
      />
      <LayerPanel
        layers={props.layers}
        selectedLayerId={props.selectedLayerId}
        onLayerSelect={props.onLayerSelect}
        onLayerMove={props.onLayerMove}
        onMaskOpacityChange={props.onMaskOpacityChange}
        onShowMaskToggle={props.onShowMaskToggle}
      />
      <PropertiesPanel
        selectedLayer={selectedLayer}
        onPropertyChange={(property, value) => {
          if (props.selectedLayerId) {
            props.onPropertyChange(props.selectedLayerId, property, value);
          }
        }}
      />
    </div>
  );
};
```

**Reference:** Ticket section "Правая панель — три секции" (lines 88-125)

## Files to Modify

None.

## Verification

- [ ] `npx tsc --noEmit` passes
- [ ] All components render without errors
- [ ] Tool buttons toggle active state
- [ ] Layer cards display with color indicator
- [ ] Layer z-order controls work (up/down arrows)
- [ ] Mask opacity slider updates layer
- [ ] Properties panel updates on layer selection
- [ ] Property sliders update layer transform
- [ ] Styling matches existing editor (dark theme, orange accent)
