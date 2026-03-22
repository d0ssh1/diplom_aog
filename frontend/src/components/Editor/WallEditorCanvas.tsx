import { useEffect, useRef, useImperativeHandle, forwardRef, useCallback, useState } from 'react';
import { fabric } from 'fabric';
import type { RoomAnnotation, DoorAnnotation, CropRect } from '../../types/wizard';
import styles from './WallEditorCanvas.module.css';

export interface WallEditorCanvasRef {
  getBlob: () => Promise<Blob>;
  getAnnotations: () => { rooms: RoomAnnotation[]; doors: DoorAnnotation[] };
  getCanvasState: () => any;
}

type ActiveTool = 'wall' | 'eraser' | 'room' | 'staircase' | 'elevator' | 'corridor' | 'door' | 'erase_markup';

interface WallEditorCanvasProps {
  maskUrl: string;
  activeTool: ActiveTool;
  brushSize: number;
  eraserMode?: 'brush' | 'select';
  onRoomPopupRequest: (
    rect: { x: number; y: number; w: number; h: number },
    onConfirm: (name: string) => void,
    onCancel: () => void,
  ) => void;
  planUrl?: string;
  planCropRect?: CropRect | null;
  planRotation?: number;
  overlayEnabled?: boolean;
  overlayOpacity?: number;
  initialRooms?: RoomAnnotation[];
  initialDoors?: DoorAnnotation[];
  initialCanvasState?: any;
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
  ({ maskUrl, activeTool, brushSize, eraserMode = 'brush', onRoomPopupRequest, planUrl, planCropRect, planRotation, overlayEnabled, overlayOpacity = 0.4, initialRooms, initialDoors, initialCanvasState }, ref) => {
    const canvasElRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const fabricRef = useRef<fabric.Canvas | null>(null);
    const roomsRef = useRef<RoomAnnotation[]>([]);
    const doorsRef = useRef<DoorAnnotation[]>([]);
    const tempObjectsRef = useRef<fabric.Object[]>([]);
    const [displayPlanUrl, setDisplayPlanUrl] = useState<string | null>(null);
    const [bgDims, setBgDims] = useState({ left: 0, top: 0, width: 0, height: 0 });

    // A5: state for HTML erase selection buttons
    const [eraseSelection, setEraseSelection] = useState<{
      left: number; top: number; width: number; height: number;
      fabricRect: fabric.Rect;
    } | null>(null);

    useEffect(() => {
      if (!planUrl) { setDisplayPlanUrl(null); return; }

      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const rot = planRotation ?? 0;
        const swap = rot === 90 || rot === 270;
        const rCanvas = document.createElement('canvas');
        rCanvas.width = swap ? img.height : img.width;
        rCanvas.height = swap ? img.width : img.height;
        const rCtx = rCanvas.getContext('2d')!;
        rCtx.translate(rCanvas.width / 2, rCanvas.height / 2);
        rCtx.rotate((rot * Math.PI) / 180);
        rCtx.drawImage(img, -img.width / 2, -img.height / 2);

        if (planCropRect) {
          const cx = Math.round(planCropRect.x * rCanvas.width);
          const cy = Math.round(planCropRect.y * rCanvas.height);
          const cw = Math.round(planCropRect.width * rCanvas.width);
          const ch = Math.round(planCropRect.height * rCanvas.height);
          const cropCanvas = document.createElement('canvas');
          cropCanvas.width = cw;
          cropCanvas.height = ch;
          cropCanvas.getContext('2d')!.drawImage(rCanvas, cx, cy, cw, ch, 0, 0, cw, ch);
          setDisplayPlanUrl(cropCanvas.toDataURL());
        } else {
          setDisplayPlanUrl(rCanvas.toDataURL());
        }
      };
      img.src = planUrl;
    }, [planUrl, planCropRect, planRotation]);

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
        backgroundColor: 'transparent',
      });
      fabricRef.current = canvas;

      if (initialCanvasState) {
        canvas.loadFromJSON(initialCanvasState, () => {
          canvas.forEachObject((obj) => {
            obj.selectable = false;
            obj.evented = false;
          });
          canvas.renderAll();
          
          // Re-trigger active tool handlers so they can selectively enable evented if needed
          canvas.fire('canvas:restored');
        });
      }

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
    }, []);

    // Update mask background when maskUrl changes
    useEffect(() => {
      if (!maskUrl) return;
      fabric.Image.fromURL(
        maskUrl,
        (img) => {
          if (!img || !fabricRef.current) return;
          const c = fabricRef.current;
          const scaleX = c.getWidth() / (img.width ?? 1);
          const scaleY = c.getHeight() / (img.height ?? 1);
          const scale = Math.min(scaleX, scaleY);
          const scaledW = (img.width ?? 0) * scale;
          const scaledH = (img.height ?? 0) * scale;
          const offsetX = (c.getWidth() - scaledW) / 2;
          const offsetY = (c.getHeight() - scaledH) / 2;
          img.set({ scaleX: scale, scaleY: scale, originX: 'left', originY: 'top', left: offsetX, top: offsetY });
          c.setBackgroundImage(img, () => {
            c.renderAll();
            setBgDims({ left: offsetX, top: offsetY, width: scaledW, height: scaledH });
          });
        },
        { crossOrigin: 'anonymous' },
      );
    }, [maskUrl]);

    // Restore annotations when returning to this step
    useEffect(() => {
      const canvas = fabricRef.current;
      if (!canvas) return;

      const restore = () => {
        if (initialCanvasState) {
          if (initialRooms && initialRooms.length > 0 && roomsRef.current.length === 0) {
            roomsRef.current = [...initialRooms];
          }
          if (initialDoors && initialDoors.length > 0 && doorsRef.current.length === 0) {
            doorsRef.current = [...initialDoors];
          }
        } else {
          if (initialRooms && initialRooms.length > 0 && roomsRef.current.length === 0) {
            roomsRef.current = [...initialRooms];
            for (const room of initialRooms) {
              const x = room.x * canvas.getWidth();
              const y = room.y * canvas.getHeight();
              const w = room.width * canvas.getWidth();
              const h = room.height * canvas.getHeight();
              const roomType = room.room_type || 'room';
              const rect = new fabric.Rect({
                width: w, height: h,
                fill: ROOM_FILL[roomType] ?? 'rgba(255,255,255,0.1)',
                stroke: ROOM_STROKE[roomType] ?? '#fff',
                strokeWidth: 1,
              });
              const text = new fabric.Text(room.name || '', {
                fontSize: 12,
                fill: ROOM_STROKE[roomType] ?? '#fff',
                fontFamily: 'Courier New',
                left: 4, top: 4,
              });
              const group = new fabric.Group([rect, text], {
                left: x, top: y, selectable: false, evented: false,
              });
              (group as unknown as { data: { id: string; type: string } }).data = { id: room.id, type: 'annotation' };
              canvas.add(group);
            }
          }

          if (initialDoors && initialDoors.length > 0 && doorsRef.current.length === 0) {
            doorsRef.current = [...initialDoors];
            for (const door of initialDoors) {
              const cx = (door.x1 + door.x2) / 2 * canvas.getWidth();
              const cy = (door.y1 + door.y2) / 2 * canvas.getHeight();
              const circle = new fabric.Circle({
                left: cx, top: cy, radius: 3, fill: '#4CAF50',
                originX: 'center', originY: 'center', selectable: false, evented: false,
                padding: 15,
              });
              (circle as unknown as { data: { id: string; type: string } }).data = { id: door.id, type: 'door' };
              canvas.add(circle);
            }
          }
        }

        canvas.renderAll();
      };

      // Background image may still be loading — wait for it
      if (canvas.backgroundImage) {
        restore();
      } else {
        setTimeout(restore, 150);
      }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [maskUrl]);

    // Tool switching
    const activeToolRef = useRef(activeTool);
    const brushSizeRef = useRef(brushSize);
    const eraserModeRef = useRef(eraserMode);
    useEffect(() => { activeToolRef.current = activeTool; }, [activeTool]);
    useEffect(() => { brushSizeRef.current = brushSize; }, [brushSize]);
    useEffect(() => { eraserModeRef.current = eraserMode; }, [eraserMode]);

    // A5: stable ref for setEraseSelection to use inside callbacks
    const setEraseSelectionRef = useRef(setEraseSelection);
    useEffect(() => { setEraseSelectionRef.current = setEraseSelection; }, []);

    // Fix 4: ref to track pending erase confirmation (avoids stale closure issues)
    const pendingEraseRef = useRef(false);

    const bringAnnotationsToFront = useCallback(() => {
      const canvas = fabricRef.current;
      if (!canvas) return;
      canvas.getObjects().forEach(o => {
        const data = (o as unknown as { data?: { type?: string } }).data;
        if (data && (data.type === 'annotation' || data.type === 'door')) {
          canvas.bringToFront(o);
        }
      });
      canvas.renderAll();
    }, []);

    const attachToolHandlers = useCallback(() => {
      const canvas = fabricRef.current;
      if (!canvas) return;

      // Reset — remove all temporary objects (zombie fix)
      tempObjectsRef.current.forEach((obj) => canvas.remove(obj));
      tempObjectsRef.current = [];

      // Reset — clear HTML erase selection buttons
      setEraseSelectionRef.current(null);
      pendingEraseRef.current = false;

      canvas.isDrawingMode = false;
      canvas.off('mouse:down');
      canvas.off('mouse:move');
      canvas.off('mouse:up');
      canvas.off('path:created'); // A2: clean up path:created handler

      // A1+A6: Always block interactivity of all objects when any tool is active
      canvas.forEachObject((obj) => {
        obj.selectable = false;
        obj.evented = false;
      });
      canvas.discardActiveObject();
      canvas.renderAll();

      const tool = activeToolRef.current;

      if (tool === 'eraser') {
        if (eraserModeRef.current === 'brush') {
          canvas.isDrawingMode = true;
          canvas.freeDrawingBrush = new fabric.PencilBrush(canvas);
          canvas.freeDrawingBrush.color = 'black';
          canvas.freeDrawingBrush.width = brushSizeRef.current;

          // A2: mark eraser paths as non-selectable immediately after creation
          canvas.on('path:created', (e: fabric.IEvent & { path?: fabric.Path }) => {
            const path = e.path;
            if (!path) return;
            path.selectable = false;
            path.evented = false;
            (path as unknown as { data: { type: string } }).data = { type: 'eraser-stroke' };
            bringAnnotationsToFront();
          });

          // Custom cursor — orange dashed circle sized to brush
          const size = brushSizeRef.current;
          const cursorCanvas = document.createElement('canvas');
          cursorCanvas.width = size + 4;
          cursorCanvas.height = size + 4;
          const ctx = cursorCanvas.getContext('2d');
          if (ctx) {
            ctx.strokeStyle = '#FF5722';
            ctx.lineWidth = 2;
            ctx.setLineDash([3, 3]);
            ctx.beginPath();
            ctx.arc((size + 4) / 2, (size + 4) / 2, size / 2, 0, Math.PI * 2);
            ctx.stroke();
          }
          const cursorUrl = cursorCanvas.toDataURL();
          const offset = Math.round((size + 4) / 2);
          canvas.freeDrawingCursor = `url(${cursorUrl}) ${offset} ${offset}, crosshair`;
        } else {
          // Select-erase mode
          canvas.defaultCursor = 'crosshair';
          let isDrawing = false;
          let startX = 0;
          let startY = 0;
          let selRect: fabric.Rect | null = null;

          const onMouseDown = (opt: fabric.IEvent<MouseEvent>) => {
            // Fix 4: block new drag while confirmation is pending
            if (pendingEraseRef.current) return;
            const pointer = canvas.getPointer(opt.e);
            isDrawing = true;
            startX = pointer.x;
            startY = pointer.y;
            selRect = new fabric.Rect({
              left: startX, top: startY, width: 0, height: 0,
              fill: 'rgba(255,0,0,0.2)',
              stroke: '#FF5722', strokeWidth: 1, strokeDashArray: [4, 4],
              selectable: false, evented: false,
            });
            canvas.add(selRect);
            tempObjectsRef.current.push(selRect);
          };

          const onMouseMove = (opt: fabric.IEvent<MouseEvent>) => {
            if (!isDrawing || !selRect) return;
            const pointer = canvas.getPointer(opt.e);
            const w = pointer.x - startX;
            const h = pointer.y - startY;
            selRect.set({
              left: w < 0 ? pointer.x : startX,
              top: h < 0 ? pointer.y : startY,
              width: Math.abs(w),
              height: Math.abs(h),
            });
            canvas.renderAll();
          };

          const onMouseUp = () => {
            if (!isDrawing || !selRect) return;
            isDrawing = false;
            const w = selRect.width ?? 0;
            const h = selRect.height ?? 0;
            if (w < 5 || h < 5) {
              canvas.remove(selRect);
              tempObjectsRef.current = tempObjectsRef.current.filter((o) => o !== selRect);
              selRect = null;
              canvas.renderAll();
              return;
            }

            // Fix 4: mark pending so new drag is blocked until confirm/cancel
            pendingEraseRef.current = true;

            // A5: store selection in state to render HTML buttons
            const capturedRect = selRect;
            setEraseSelectionRef.current({
              left: capturedRect.left ?? 0,
              top: capturedRect.top ?? 0,
              width: w,
              height: h,
              fabricRect: capturedRect,
            });
          };

          canvas.on('mouse:down', onMouseDown);
          canvas.on('mouse:move', onMouseMove);
          canvas.on('mouse:up', onMouseUp);
        }
        return;
      }

      if (tool === 'erase_markup') {
        canvas.defaultCursor = 'crosshair';

        const onMouseDown = (opt: fabric.IEvent<MouseEvent>) => {
          if (!opt.target) return;
          const obj = opt.target;
          const data = (obj as unknown as { data?: { id?: string; type?: string } }).data;
          
          if (data && (data.type === 'annotation' || data.type === 'door')) {
            if (data.id) {
              roomsRef.current = roomsRef.current.filter((r) => r.id !== data.id);
              doorsRef.current = doorsRef.current.filter((d) => d.id !== data.id);
            }
            canvas.remove(obj);
            canvas.renderAll();
          }
        };

        canvas.on('mouse:down', onMouseDown);

        // Make markup objects clickable specifically for this tool
        canvas.forEachObject((obj) => {
          const data = (obj as unknown as { data?: { type?: string } }).data;
          if (data && (data.type === 'annotation' || data.type === 'door')) {
            obj.evented = true;
            obj.hoverCursor = 'pointer';
          }
        });
        return;
      }

      if (tool === 'wall' || tool === 'door') {
        let startPoint: { x: number; y: number } | null = null;
        let previewLine: fabric.Line | null = null;

        const onMouseDown = (opt: fabric.IEvent<MouseEvent>) => {
          const pointer = canvas.getPointer(opt.e);

          if (tool === 'door') {
            // SINGLE CLICK FOR DOOR
            const cx = pointer.x;
            const cy = pointer.y;

            const id = crypto.randomUUID();
            const circle = new fabric.Circle({
              left: cx,
              top: cy,
              radius: 3,
              fill: '#4CAF50',
              originX: 'center',
              originY: 'center',
              selectable: false,
              evented: false,
              padding: 15,
            });
            (circle as unknown as { data: { id: string; type: string } }).data = {
              id,
              type: 'door',
            };

            const doorMidX = cx / canvas.getWidth();
            const doorMidY = cy / canvas.getHeight();
            let closestRoomId: string | null = null;
            let minDist = Infinity;
            for (const room of roomsRef.current) {
              const roomCx = room.x + room.width / 2;
              const roomCy = room.y + room.height / 2;
              const dist = Math.hypot(roomCx - doorMidX, roomCy - doorMidY);
              if (dist < minDist) {
                minDist = dist;
                closestRoomId = room.id;
              }
            }
            doorsRef.current.push({
              id,
              x1: doorMidX,
              y1: doorMidY,
              x2: doorMidX,
              y2: doorMidY,
              room_id: closestRoomId,
            });

            canvas.add(circle);
            canvas.renderAll();
            return;
          }

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
            tempObjectsRef.current.push(previewLine);
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
              tempObjectsRef.current = tempObjectsRef.current.filter((o) => o !== previewLine);
              previewLine = null;
            }

            const id = crypto.randomUUID();
            const width = brushSizeRef.current;

            const line = new fabric.Line([startPoint.x, startPoint.y, endX, endY], {
              stroke: 'white',
              strokeWidth: width,
              selectable: false,
              evented: false,
            });
            (line as unknown as { data: { id: string; type: string } }).data = {
              id,
              type: 'wall',
            };

            canvas.add(line);
            bringAnnotationsToFront();
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
                selectable: false,
                evented: false,
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

    // A4: add eraserMode to dependencies so handlers re-attach on mode change
    useEffect(() => {
      attachToolHandlers();

      const canvas = fabricRef.current;
      if (!canvas) return;

      const handleRestored = () => attachToolHandlers();
      canvas.on('canvas:restored', handleRestored);
      return () => {
        canvas.off('canvas:restored', handleRestored);
      };
    }, [activeTool, brushSize, eraserMode, attachToolHandlers]);

    // A5: confirm erase — draw black rect, clear selection state
    const handleConfirmErase = useCallback(() => {
      const canvas = fabricRef.current;
      if (!canvas || !eraseSelection) return;
      const { left, top, width, height, fabricRect } = eraseSelection;
      const eraseRect = new fabric.Rect({
        left, top, width, height,
        fill: 'black', selectable: false, evented: false,
      });
      canvas.remove(fabricRect);
      tempObjectsRef.current = tempObjectsRef.current.filter((o) => o !== fabricRect);
      canvas.add(eraseRect);
      bringAnnotationsToFront();
      canvas.renderAll();
      pendingEraseRef.current = false;
      setEraseSelection(null);
      attachToolHandlers();
    }, [eraseSelection, attachToolHandlers]);

    // A5: cancel erase — remove selection rect, clear state
    const handleCancelErase = useCallback(() => {
      const canvas = fabricRef.current;
      if (!canvas || !eraseSelection) return;
      canvas.remove(eraseSelection.fabricRect);
      tempObjectsRef.current = tempObjectsRef.current.filter((o) => o !== eraseSelection.fabricRect);
      canvas.renderAll();
      pendingEraseRef.current = false;
      setEraseSelection(null);
      attachToolHandlers();
    }, [eraseSelection, attachToolHandlers]);

    useImperativeHandle(ref, () => ({
      getBlob: () =>
        new Promise<Blob>((resolve) => {
          const canvas = fabricRef.current;
          if (!canvas) {
            resolve(new Blob());
            return;
          }
          // Temporarily set black background so export has correct mask background
          const origBg = canvas.backgroundColor;
          canvas.backgroundColor = 'black';
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
          canvas.backgroundColor = origBg;
          canvas.renderAll();
          fetch(dataUrl)
            .then((r) => r.blob())
            .then(resolve);
        }),
      getAnnotations: () => ({
        rooms: roomsRef.current,
        doors: doorsRef.current,
      }),
      getCanvasState: () => {
        const canvas = fabricRef.current;
        return canvas ? canvas.toJSON(['data']) : null;
      },
    }));

    return (
      <div ref={containerRef} className={styles.container}>
        <canvas ref={canvasElRef} className={styles.canvas} />
        {overlayEnabled && displayPlanUrl && overlayOpacity > 0 && (
          <img
            src={displayPlanUrl}
            alt=""
            className={styles.planOverlay}
            style={{
              opacity: overlayOpacity,
              left: bgDims.left + 'px',
              top: bgDims.top + 'px',
              width: bgDims.width + 'px',
              height: bgDims.height + 'px',
            }}
          />
        )}
        {/* A5: HTML confirm/cancel buttons for select-erase */}
        {eraseSelection && (
          <div
            className={styles.eraseButtons}
            style={{
              left: Math.min(
                eraseSelection.left + eraseSelection.width + 12,
                (containerRef.current?.clientWidth ?? 800) - 90
              ),
              top: Math.min(
                eraseSelection.top + eraseSelection.height - 40,
                (containerRef.current?.clientHeight ?? 400) - 50,
              ),
            }}
          >
            <button
              className={styles.eraseConfirm}
              onClick={handleConfirmErase}
              title="Подтвердить удаление"
            >
              ✓
            </button>
            <button
              className={styles.eraseCancel}
              onClick={handleCancelErase}
              title="Отменить"
            >
              ✕
            </button>
          </div>
        )}
      </div>
    );
  },
);

WallEditorCanvas.displayName = 'WallEditorCanvas';

export { WallEditorCanvas };
