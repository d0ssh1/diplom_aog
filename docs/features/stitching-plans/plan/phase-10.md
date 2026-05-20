# Phase 10: Frontend — Hooks (Canvas)

phase: 10
layer: frontend
depends_on: [phase-08, phase-09]
design: ../README.md

## Goal

Implement Fabric.js canvas logic hook. Handles plan loading, transformations, clip operations, and state export.

## Context

**Depends on Phase 8 (types) and Phase 9 (history).**

**Pattern:** Follow `frontend/src/components/Editor/WallEditorCanvas.tsx` pattern — Fabric.js logic in hook, component only renders container.

## Files to Create

### `frontend/src/hooks/useStitchingCanvas.ts`

**Purpose:** Fabric.js canvas logic for stitching editor.

**Implementation details:**
- **Canvas initialization:** Create fabric.Canvas on mount, dispose on unmount
- **Plan loading:** Load image + vector mask as fabric.Group
- **Transformations:** Handle move, rotate, scale via Fabric.js events
- **Clip operations:** Apply clipPath to groups
- **Export:** Serialize transforms and clip polygons

**Hook interface:**

```typescript
import { useRef, useEffect, useCallback } from 'react';
import { fabric } from 'fabric';
import type { LayerData, Transform, ClipPolygon, StitchingSnapshot } from '../types/stitching';

interface UseStitchingCanvasProps {
  containerRef: React.RefObject<HTMLDivElement>;
  layers: LayerData[];
  activeTool: "move" | "rotate" | "rect_crop" | "polygon_clip";
  onLayerUpdate: (layerId: string, updates: Partial<LayerData>) => void;
  onSnapshotPush: (snapshot: StitchingSnapshot) => void;
}

interface UseStitchingCanvasReturn {
  canvasRef: React.MutableRefObject<fabric.Canvas | null>;
  loadPlanToCanvas: (layer: LayerData) => void;
  removePlanFromCanvas: (layerId: string) => void;
  applyPolygonClip: (layerId: string, polygon: ClipPolygon) => void;
  applyRectCrop: (layerId: string, rect: { x: number; y: number; width: number; height: number }) => void;
  exportState: () => StitchingSnapshot;
  restoreSnapshot: (snapshot: StitchingSnapshot) => void;
}

export const useStitchingCanvas = ({
  containerRef,
  layers,
  activeTool,
  onLayerUpdate,
  onSnapshotPush,
}: UseStitchingCanvasProps): UseStitchingCanvasReturn => {
  const canvasRef = useRef<fabric.Canvas | null>(null);
  const layerObjectsRef = useRef<Map<string, fabric.Group>>(new Map());

  // Initialize canvas
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const canvas = new fabric.Canvas('stitching-canvas', {
      backgroundColor: '#2a2a2a',
      selection: false,
      preserveObjectStacking: true,
    });

    canvas.setWidth(container.clientWidth);
    canvas.setHeight(container.clientHeight);

    canvasRef.current = canvas;

    // Cleanup
    return () => {
      canvas.dispose();
      canvasRef.current = null;
    };
  }, [containerRef]);

  // Load plan to canvas
  const loadPlanToCanvas = useCallback((layer: LayerData) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Load image
    fabric.Image.fromURL(layer.imageUrl, (img) => {
      // Create vector mask objects (walls, rooms, doors)
      const maskObjects = createMaskObjects(layer.vectorModel, layer.color, layer.maskOpacity);

      // Create group
      const group = new fabric.Group([img, ...maskObjects], {
        left: layer.transform.translate_x,
        top: layer.transform.translate_y,
        scaleX: layer.transform.scale_x,
        scaleY: layer.transform.scale_y,
        angle: layer.transform.rotation_deg,
        cornerStyle: 'circle',
        cornerSize: 8,
        borderColor: layer.color,
        borderDashArray: [5, 3],
      });

      // Store reference
      layerObjectsRef.current.set(layer.reconstructionId, group);

      // Add to canvas
      canvas.add(group);
      canvas.renderAll();
    });
  }, []);

  // Handle object modifications
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handleModified = (e: fabric.IEvent) => {
      const obj = e.target as fabric.Group;
      if (!obj) return;

      // Find layer by object
      const layerId = findLayerIdByObject(obj, layerObjectsRef.current);
      if (!layerId) return;

      // Update layer transform
      onLayerUpdate(layerId, {
        transform: {
          translate_x: obj.left || 0,
          translate_y: obj.top || 0,
          scale_x: obj.scaleX || 1,
          scale_y: obj.scaleY || 1,
          rotation_deg: obj.angle || 0,
        },
      });

      // Push snapshot
      onSnapshotPush(exportState());
    };

    canvas.on('object:modified', handleModified);

    return () => {
      canvas.off('object:modified', handleModified);
    };
  }, [onLayerUpdate, onSnapshotPush]);

  // Apply polygon clip
  const applyPolygonClip = useCallback((layerId: string, polygon: ClipPolygon) => {
    const group = layerObjectsRef.current.get(layerId);
    if (!group) return;

    const clipPath = new fabric.Polygon(polygon.points, {
      absolutePositioned: true,
      inverted: true, // Fabric.js 5+: show outside, hide inside
    });

    group.clipPath = clipPath;
    canvasRef.current?.renderAll();
  }, []);

  // Export state
  const exportState = useCallback((): StitchingSnapshot => {
    const layerSnapshots = layers.map((layer) => ({
      reconstructionId: layer.reconstructionId,
      transform: layer.transform,
      clipPolygons: layer.clipPolygons,
      rectCrop: layer.rectCrop,
      zIndex: layer.zIndex,
    }));

    return { layers: layerSnapshots };
  }, [layers]);

  // Restore snapshot
  const restoreSnapshot = useCallback((snapshot: StitchingSnapshot) => {
    // Update all layer transforms from snapshot
    snapshot.layers.forEach((layerSnapshot) => {
      const group = layerObjectsRef.current.get(layerSnapshot.reconstructionId);
      if (!group) return;

      group.set({
        left: layerSnapshot.transform.translate_x,
        top: layerSnapshot.transform.translate_y,
        scaleX: layerSnapshot.transform.scale_x,
        scaleY: layerSnapshot.transform.scale_y,
        angle: layerSnapshot.transform.rotation_deg,
      });

      group.setCoords();
    });

    canvasRef.current?.renderAll();
  }, []);

  return {
    canvasRef,
    loadPlanToCanvas,
    removePlanFromCanvas: (layerId: string) => {
      const group = layerObjectsRef.current.get(layerId);
      if (group) {
        canvasRef.current?.remove(group);
        layerObjectsRef.current.delete(layerId);
      }
    },
    applyPolygonClip,
    applyRectCrop: (layerId: string, rect: { x: number; y: number; width: number; height: number }) => {
      // Implementation similar to applyPolygonClip
    },
    exportState,
    restoreSnapshot,
  };
};

// Helper functions
function createMaskObjects(vectorModel: any, color: string, opacity: number): fabric.Object[] {
  // Create fabric.Line for walls
  // Create fabric.Polygon for rooms
  // Create fabric.Circle for doors
  // Return array of objects
  return [];
}

function findLayerIdByObject(obj: fabric.Object, map: Map<string, fabric.Group>): string | null {
  for (const [id, group] of map.entries()) {
    if (group === obj) return id;
  }
  return null;
}
```

**Reference:** Ticket section "Взаимодействие Fabric.js — детали реализации" (lines 584-683) and `frontend/src/components/Editor/WallEditorCanvas.tsx`

## Files to Modify

None.

## Verification

- [ ] `npx tsc --noEmit` passes
- [ ] Canvas initializes and disposes correctly
- [ ] Plans load as fabric.Group (image + mask)
- [ ] Transformations update layer state
- [ ] Clip operations apply clipPath
- [ ] Export/restore snapshot works
- [ ] No memory leaks (Fabric.js objects disposed)
- [ ] Keyboard shortcuts work (Ctrl+Z for undo)
