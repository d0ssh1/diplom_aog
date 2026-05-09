import React, { useRef, useEffect, useCallback, useState } from 'react';
import styles from './WizardStep.module.css';
import { CanvasControls } from './CanvasControls';
import type { Point2D } from '../../hooks/useFloorEditorWizard';

type DrawingTool = 'pen' | 'rect';

interface Step3WallExtractionProps {
  schemaImageUrl: string | null;
  wallPolygons: Point2D[][] | null;
  isLoading: boolean;
  onTriggerExtraction: () => Promise<void>;
  onSetWallPolygons: (polygons: Point2D[][]) => void;
  onNext: () => Promise<void>;
  onBack: () => void;
}

export const Step3WallExtraction: React.FC<Step3WallExtractionProps> = ({
  schemaImageUrl,
  wallPolygons,
  isLoading,
  onTriggerExtraction,
  onSetWallPolygons,
  onNext,
  onBack,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);

  const [tool, setTool] = useState<DrawingTool>('pen');
  const [zoom, setZoom] = useState(1);
  const [offset] = useState({ x: 0, y: 0 });
  const [localPolygons, setLocalPolygons] = useState<Point2D[][]>(wallPolygons ?? []);
  const [currentPoints, setCurrentPoints] = useState<Point2D[]>([]);
  const [dragStart, setDragStart] = useState<Point2D | null>(null);
  const [dragCur, setDragCur] = useState<Point2D | null>(null);

  const localRef = useRef(localPolygons);
  useEffect(() => { localRef.current = localPolygons; }, [localPolygons]);
  const curRef = useRef(currentPoints);
  useEffect(() => { curRef.current = currentPoints; }, [currentPoints]);

  // Sync from props when server returns polygons
  useEffect(() => {
    if (wallPolygons !== null) {
      setLocalPolygons(wallPolygons);
    }
  }, [wallPolygons]);

  // Auto-trigger extraction on mount if no polygons
  const extractionStarted = useRef(false);
  useEffect(() => {
    if (wallPolygons === null && !extractionStarted.current) {
      extractionStarted.current = true;
      void onTriggerExtraction();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const getCanvasSize = useCallback(() => {
    const c = containerRef.current;
    if (!c) return { w: 800, h: 600 };
    return { w: c.clientWidth, h: c.clientHeight };
  }, []);

  const getImageParams = useCallback((imgW: number, imgH: number, cw: number, ch: number) => {
    const scale = Math.min((cw * zoom) / imgW, (ch * zoom) / imgH);
    const dw = imgW * scale;
    const dh = imgH * scale;
    const dx = (cw - dw) / 2 + offset.x;
    const dy = (ch - dh) / 2 + offset.y;
    return { dx, dy, dw, dh };
  }, [zoom, offset]);

  const toCanvas = useCallback((nx: number, ny: number) => {
    const img = imageRef.current;
    if (!img) return { cx: 0, cy: 0 };
    const { w: cw, h: ch } = getCanvasSize();
    const { dx, dy, dw, dh } = getImageParams(img.naturalWidth, img.naturalHeight, cw, ch);
    return { cx: dx + nx * dw, cy: dy + ny * dh };
  }, [getCanvasSize, getImageParams]);

  const toNorm = useCallback((cx: number, cy: number) => {
    const img = imageRef.current;
    if (!img) return { nx: 0, ny: 0 };
    const { w: cw, h: ch } = getCanvasSize();
    const { dx, dy, dw, dh } = getImageParams(img.naturalWidth, img.naturalHeight, cw, ch);
    return { nx: (cx - dx) / dw, ny: (cy - dy) / dh };
  }, [getCanvasSize, getImageParams]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const { w: cw, h: ch } = getCanvasSize();
    canvas.width = cw;
    canvas.height = ch;
    ctx.clearRect(0, 0, cw, ch);
    ctx.fillStyle = '#e8e9ec';
    ctx.fillRect(0, 0, cw, ch);

    // Draw image watermark
    const img = imageRef.current;
    if (img) {
      const { dx, dy, dw, dh } = getImageParams(img.naturalWidth, img.naturalHeight, cw, ch);
      ctx.globalAlpha = 0.3;
      ctx.drawImage(img, dx, dy, dw, dh);
      ctx.globalAlpha = 1;
    }

    // Draw polygons
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 2;
    for (const poly of localRef.current) {
      if (poly.length < 2) continue;
      ctx.beginPath();
      const first = toCanvas(poly[0].x, poly[0].y);
      ctx.moveTo(first.cx, first.cy);
      for (let i = 1; i < poly.length; i++) {
        const p = toCanvas(poly[i].x, poly[i].y);
        ctx.lineTo(p.cx, p.cy);
      }
      ctx.stroke();
    }

    // Draw in-progress line or rect
    if (curRef.current.length > 0) {
      ctx.strokeStyle = '#ff4500';
      ctx.lineWidth = 2;
      ctx.beginPath();
      const f = toCanvas(curRef.current[0].x, curRef.current[0].y);
      ctx.moveTo(f.cx, f.cy);
      for (let i = 1; i < curRef.current.length; i++) {
        const p = toCanvas(curRef.current[i].x, curRef.current[i].y);
        ctx.lineTo(p.cx, p.cy);
      }
      ctx.stroke();
    }

    // Rect preview
    if (dragStart && dragCur) {
      const s = toCanvas(dragStart.x, dragStart.y);
      const e = toCanvas(dragCur.x, dragCur.y);
      ctx.strokeStyle = '#ff4500';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.strokeRect(s.cx, s.cy, e.cx - s.cx, e.cy - s.cy);
      ctx.setLineDash([]);
    }
  }, [getCanvasSize, getImageParams, toCanvas, dragStart, dragCur]);

  useEffect(() => { draw(); }, [draw, localPolygons, currentPoints]);

  useEffect(() => {
    if (schemaImageUrl) {
      const img = new Image();
      img.src = schemaImageUrl;
      img.onload = () => { imageRef.current = img; draw(); };
    }
    return () => {
      if (canvasRef.current) {
        const ctx = canvasRef.current.getContext('2d');
        ctx?.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
      }
    };
  }, [schemaImageUrl, draw]);

  const getPos = (e: React.MouseEvent<HTMLCanvasElement>): Point2D => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const { nx, ny } = toNorm(e.clientX - rect.left, e.clientY - rect.top);
    return { x: Math.max(0, Math.min(1, nx)), y: Math.max(0, Math.min(1, ny)) };
  };

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (tool !== 'pen') return;
    const pt = getPos(e);
    setCurrentPoints((prev) => [...prev, pt]);
  };

  const handleCanvasDblClick = () => {
    if (tool !== 'pen' || currentPoints.length < 2) return;
    const newPoly = [...currentPoints];
    const updated = [...localPolygons, newPoly];
    setLocalPolygons(updated);
    onSetWallPolygons(updated);
    setCurrentPoints([]);
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (tool !== 'rect') return;
    const pt = getPos(e);
    setDragStart(pt);
    setDragCur(pt);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (tool === 'rect' && dragStart) {
      setDragCur(getPos(e));
    }
  };

  const handleMouseUp = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (tool === 'rect' && dragStart) {
      const end = getPos(e);
      const x1 = Math.min(dragStart.x, end.x);
      const y1 = Math.min(dragStart.y, end.y);
      const x2 = Math.max(dragStart.x, end.x);
      const y2 = Math.max(dragStart.y, end.y);
      if (Math.abs(x2 - x1) > 0.01 && Math.abs(y2 - y1) > 0.01) {
        const rect: Point2D[] = [
          { x: x1, y: y1 }, { x: x2, y: y1 },
          { x: x2, y: y2 }, { x: x1, y: y2 }, { x: x1, y: y1 },
        ];
        const updated = [...localPolygons, rect];
        setLocalPolygons(updated);
        onSetWallPolygons(updated);
      }
      setDragStart(null);
      setDragCur(null);
    }
  };

  const handleClearAll = () => {
    if (window.confirm('Очистить все стены?')) {
      setLocalPolygons([]);
      onSetWallPolygons([]);
    }
  };

  return (
    <div className={styles.layout}>
      <div className={styles.body}>
        <aside className={styles.sidebar}>
          <h3 className={styles.sidebarTitle}>Инструменты</h3>
          <button
            className={`${styles.toolBtn} ${tool === 'pen' ? styles.toolBtnActive : ''}`}
            onClick={() => setTool('pen')}
            type="button"
          >
            Выделение стен
          </button>
          <button
            className={`${styles.toolBtn} ${tool === 'rect' ? styles.toolBtnActive : ''}`}
            onClick={() => { setTool('rect'); setCurrentPoints([]); }}
            type="button"
          >
            Прямоугольник
          </button>
          <button
            className={`${styles.toolBtn} ${styles.toolBtnDanger}`}
            onClick={handleClearAll}
            type="button"
          >
            Очистить всё
          </button>
        </aside>

        <div className={styles.canvasArea} ref={containerRef}>
          <canvas
            ref={canvasRef}
            className={styles.canvas}
            onClick={handleCanvasClick}
            onDoubleClick={handleCanvasDblClick}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            style={{ cursor: tool === 'pen' ? 'crosshair' : 'crosshair' }}
          />
          {tool === 'pen' && currentPoints.length > 0 && (
            <span className={styles.canvasHint}>
              Двойной клик для завершения полигона
            </span>
          )}
          {tool === 'rect' && (
            <span className={styles.canvasHint}>
              Нарисуйте прямоугольник мышью
            </span>
          )}
          <CanvasControls
            onZoomIn={() => setZoom((z) => Math.min(z + 0.25, 4))}
            onZoomOut={() => setZoom((z) => Math.max(z - 0.25, 0.25))}
            onReset={() => setZoom(1)}
          />
          {isLoading && (
            <div className={styles.spinnerOverlay}>
              <div className={styles.spinner} />
              <span className={styles.spinnerText}>Извлечение стен...</span>
            </div>
          )}
        </div>
      </div>

      <footer className={styles.footer}>
        <button className={styles.btnBack} onClick={onBack} type="button">
          ← Назад
        </button>
        <span className={styles.footerHint}>Выделите стены отсека</span>
        <button
          className={styles.btnNext}
          onClick={() => void onNext()}
          disabled={isLoading}
          type="button"
        >
          Далее →
        </button>
      </footer>
    </div>
  );
};
