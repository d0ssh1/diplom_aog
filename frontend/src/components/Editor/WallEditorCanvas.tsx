import { useEffect, useRef, useImperativeHandle, forwardRef, useCallback } from 'react';
import { fabric } from 'fabric';
import type { RoomAnnotation, DoorAnnotation } from '../../types/wizard';
import styles from './WallEditorCanvas.module.css';

export interface WallEditorCanvasRef {
  getBlob: () => Promise<Blob>;
  getAnnotations: () => { rooms: RoomAnnotation[]; doors: DoorAnnotation[] };
}

type ActiveTool = 'wall' | 'eraser' | 'room' | 'staircase' | 'elevator' | 'corridor' | 'door';

interface WallEditorCanvasProps {
  maskUrl: string;
  activeTool: ActiveTool;
  brushSize: number;
  onRoomPopupRequest: (
    rect: { x: number; y: number; w: number; h: number },
    onConfirm: (name: string) => void,
    onCancel: () => void,
  ) => void;
}

const ROOM_FILL: Record<string, string> = {
  room: 'rgba(255,87,34,0.15)',
  staircase: 'rgba(244,67,54,0.15)',
  elevator: 'rgba(244,67,54,0.15)',
  corridor: 'rgba(33,150,243,0.15)',
};

const ROOM_STROKE: Record<string, string> = {
  room: '#FF5722',
  staircase: '#F44336',
  elevator: '#F44336',
  corridor: '#2196F3',
};

const WallEditorCanvas = forwardRef<WallEditorCanvasRef, WallEditorCanvasProps>(
  ({ maskUrl, activeTool, brushSize, onRoomPopupRequest }, ref) => {
    const canvasElRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const fabricRef = useRef<fabric.Canvas | null>(null);
    const roomsRef = useRef<RoomAnnotation[]>([]);
    const doorsRef = useRef<DoorAnnotation[]>([]);

    // Stable ref for onRoomPopupRequest to avoid stale closures
    const popupRequestRef = useRef(onRoomPopupRequest);
    useEffect(() => {
      popupRequestRef.current = onRoomPopupRequest;
    }, [onRoomPopupRequest]);

    // Init canvas on mount
    useEffect(() => {
      if (!canvasElRef.current || !containerRef.current) return;

      const { width, height } = containerRef.current.getBoundingClientRect();
      const canvas = new fabric.Canvas(canvasElRef.current, {
        selection: false,
        width,
        height,
      });
      fabricRef.current = canvas;

      // Load mask as background — proportional fit
      fabric.Image.fromURL(
        maskUrl,
        (img) => {
          if (!img || !fabricRef.current) return;
          const c = fabricRef.current;
          const scaleX = c.getWidth() / (img.width ?? 1);
          const scaleY = c.getHeight() / (img.height ?? 1);
          const scale = Math.min(scaleX, scaleY);
          img.set({ scaleX: scale, scaleY: scale, originX: 'left', originY: 'top' });
          c.setBackgroundImage(img, () => c.renderAll());
        },
        { crossOrigin: 'anonymous' },
      );

      // Delete key handler
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key !== 'Delete' && e.key !== 'Backspace') return;
        const c = fabricRef.current;
        if (!c) return;
        const obj = c.getActiveObject();
        if (!obj) return;
        const data = (obj as unknown as { data?: { id?: string; type?: string } }).data;
        if (data?.id) {
          roomsRef.current = roomsRef.current.filter((r) => r.id !== data.id);
          doorsRef.current = doorsRef.current.filter((d) => d.id !== data.id);
        }
        c.remove(obj);
        c.renderAll();
      };
      document.addEventListener('keydown', handleKeyDown);

      return () => {
        document.removeEventListener('keydown', handleKeyDown);
        canvas.dispose();
        fabricRef.current = null;
      };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [maskUrl]);

    // Tool switching
    const activeToolRef = useRef(activeTool);
    const brushSizeRef = useRef(brushSize);
    useEffect(() => { activeToolRef.current = activeTool; }, [activeTool]);
    useEffect(() => { brushSizeRef.current = brushSize; }, [brushSize]);

    const attachToolHandlers = useCallback(() => {
      const canvas = fabricRef.current;
      if (!canvas) return;

      // Reset
      canvas.isDrawingMode = false;
      canvas.off('mouse:down');
      canvas.off('mouse:move');
      canvas.off('mouse:up');

      const tool = activeToolRef.current;

      if (tool === 'eraser') {
        canvas.isDrawingMode = true;
        canvas.freeDrawingBrush = new fabric.PencilBrush(canvas);
        canvas.freeDrawingBrush.color = 'black';
        canvas.freeDrawingBrush.width = brushSizeRef.current;
        return;
      }

      if (tool === 'wall' || tool === 'door') {
        let startPoint: { x: number; y: number } | null = null;
        let previewLine: fabric.Line | null = null;

        const onMouseDown = (opt: fabric.IEvent<MouseEvent>) => {
          const pointer = canvas.getPointer(opt.e);

          if (!startPoint) {
            // First click — set start, add preview line
            startPoint = { x: pointer.x, y: pointer.y };
            previewLine = new fabric.Line(
              [pointer.x, pointer.y, pointer.x, pointer.y],
              {
                stroke: '#FF4500',
                strokeWidth: 2,
                strokeDashArray: [5, 5],
                selectable: false,
                evented: false,
              },
            );
            canvas.add(previewLine);
            canvas.renderAll();
          } else {
            // Second click — finalize
            let endX = pointer.x;
            let endY = pointer.y;

            if (opt.e.shiftKey) {
              const dx = Math.abs(endX - startPoint.x);
              const dy = Math.abs(endY - startPoint.y);
              if (dx > dy) endY = startPoint.y;
              else endX = startPoint.x;
            }

            if (previewLine) {
              canvas.remove(previewLine);
              previewLine = null;
            }

            const id = crypto.randomUUID();
            const color = tool === 'door' ? '#4CAF50' : 'white';
            const width = tool === 'door' ? 3 : brushSizeRef.current;

            const line = new fabric.Line([startPoint.x, startPoint.y, endX, endY], {
              stroke: color,
              strokeWidth: width,
              selectable: true,
              evented: true,
            });
            (line as unknown as { data: { id: string; type: string } }).data = {
              id,
              type: tool === 'door' ? 'door' : 'wall',
            };

            if (tool === 'door') {
              doorsRef.current.push({
                id,
                x1: startPoint.x / canvas.getWidth(),
                y1: startPoint.y / canvas.getHeight(),
                x2: endX / canvas.getWidth(),
                y2: endY / canvas.getHeight(),
              });
            }

            canvas.add(line);
            canvas.renderAll();
            startPoint = null;
          }
        };

        const onMouseMove = (opt: fabric.IEvent<MouseEvent>) => {
          if (!startPoint || !previewLine) return;
          const pointer = canvas.getPointer(opt.e);
          previewLine.set({ x2: pointer.x, y2: pointer.y });
          canvas.renderAll();
        };

        canvas.on('mouse:down', onMouseDown);
        canvas.on('mouse:move', onMouseMove);
        return;
      }

      // Room-type tools: room, staircase, elevator, corridor
      if (['room', 'staircase', 'elevator', 'corridor'].includes(tool)) {
        let isDrawing = false;
        let startX = 0;
        let startY = 0;
        let selectionRect: fabric.Rect | null = null;

        const onMouseDown = (opt: fabric.IEvent<MouseEvent>) => {
          const pointer = canvas.getPointer(opt.e);
          isDrawing = true;
          startX = pointer.x;
          startY = pointer.y;

          selectionRect = new fabric.Rect({
            left: startX,
            top: startY,
            width: 0,
            height: 0,
            fill: ROOM_FILL[tool] ?? 'rgba(255,255,255,0.1)',
            stroke: ROOM_STROKE[tool] ?? '#fff',
            strokeWidth: 1,
            strokeDashArray: [4, 4],
            selectable: false,
            evented: false,
          });
          canvas.add(selectionRect);
        };

        const onMouseMove = (opt: fabric.IEvent<MouseEvent>) => {
          if (!isDrawing || !selectionRect) return;
          const pointer = canvas.getPointer(opt.e);
          const w = pointer.x - startX;
          const h = pointer.y - startY;
          selectionRect.set({
            left: w < 0 ? pointer.x : startX,
            top: h < 0 ? pointer.y : startY,
            width: Math.abs(w),
            height: Math.abs(h),
          });
          canvas.renderAll();
        };

        const onMouseUp = (opt: fabric.IEvent<MouseEvent>) => {
          if (!isDrawing || !selectionRect) return;
          isDrawing = false;

          const pointer = canvas.getPointer(opt.e);
          const rectLeft = selectionRect.left ?? startX;
          const rectTop = selectionRect.top ?? startY;
          const rectW = selectionRect.width ?? 0;
          const rectH = selectionRect.height ?? 0;

          if (rectW < 5 || rectH < 5) {
            canvas.remove(selectionRect);
            selectionRect = null;
            canvas.renderAll();
            return;
          }

          const capturedRect = selectionRect;
          const normalizedRect = {
            x: rectLeft / canvas.getWidth(),
            y: rectTop / canvas.getHeight(),
            w: rectW / canvas.getWidth(),
            h: rectH / canvas.getHeight(),
          };

          const currentTool = activeToolRef.current as 'room' | 'staircase' | 'elevator' | 'corridor';

          popupRequestRef.current(
            { x: pointer.x, y: pointer.y, w: normalizedRect.w, h: normalizedRect.h },
            (name: string) => {
              // onConfirm: replace selection rect with labeled group
              canvas.remove(capturedRect);

              const id = crypto.randomUUID();
              const rect = new fabric.Rect({
                width: rectW,
                height: rectH,
                fill: ROOM_FILL[currentTool] ?? 'rgba(255,255,255,0.1)',
                stroke: ROOM_STROKE[currentTool] ?? '#fff',
                strokeWidth: 1,
              });
              const text = new fabric.Text(name, {
                fontSize: 12,
                fill: ROOM_STROKE[currentTool] ?? '#fff',
                fontFamily: 'Courier New',
                left: 4,
                top: 4,
              });
              const group = new fabric.Group([rect, text], {
                left: rectLeft,
                top: rectTop,
                selectable: true,
                evented: true,
              });
              (group as unknown as { data: { id: string; type: string } }).data = {
                id,
                type: 'annotation',
              };

              roomsRef.current.push({
                id,
                name,
                room_type: currentTool,
                x: normalizedRect.x,
                y: normalizedRect.y,
                width: normalizedRect.w,
                height: normalizedRect.h,
              });

              canvas.add(group);
              canvas.renderAll();
              selectionRect = null;
            },
            () => {
              // onCancel
              canvas.remove(capturedRect);
              canvas.renderAll();
              selectionRect = null;
            },
          );
        };

        canvas.on('mouse:down', onMouseDown);
        canvas.on('mouse:move', onMouseMove);
        canvas.on('mouse:up', onMouseUp);
      }
    }, []);

    // Re-attach handlers when tool or brushSize changes
    useEffect(() => {
      attachToolHandlers();
    }, [activeTool, brushSize, attachToolHandlers]);

    useImperativeHandle(ref, () => ({
      getBlob: () =>
        new Promise<Blob>((resolve) => {
          const canvas = fabricRef.current;
          if (!canvas) {
            resolve(new Blob());
            return;
          }
          const annotations = canvas
            .getObjects()
            .filter(
              (o) => (o as unknown as { data?: { type?: string } }).data?.type === 'annotation',
            );
          annotations.forEach((o) => {
            o.visible = false;
          });
          canvas.renderAll();
          const dataUrl = canvas.toDataURL({ format: 'png' });
          annotations.forEach((o) => {
            o.visible = true;
          });
          canvas.renderAll();
          fetch(dataUrl)
            .then((r) => r.blob())
            .then(resolve);
        }),
      getAnnotations: () => ({
        rooms: roomsRef.current,
        doors: doorsRef.current,
      }),
    }));

    return (
      <div ref={containerRef} className={styles.container}>
        <canvas ref={canvasElRef} className={styles.canvas} />
      </div>
    );
  },
);

WallEditorCanvas.displayName = 'WallEditorCanvas';

export { WallEditorCanvas };
