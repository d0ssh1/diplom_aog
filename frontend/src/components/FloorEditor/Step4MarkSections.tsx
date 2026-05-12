import React, { useRef, useEffect, useCallback, useState } from 'react';
import styles from './WizardStep.module.css';
import { CanvasControls } from './CanvasControls';
import { NewSectionDialog } from './NewSectionDialog';
import { getSectionColor } from './sectionColors';
import type { SectionDraft, Point2D } from '../../hooks/useFloorEditorWizard';
import type { SectionGeometry } from '../../types/hierarchy';

interface Step4MarkSectionsProps {
  wallPolygons: Point2D[][] | null;
  sectionDrafts: SectionDraft[];
  onAddSectionDraft: (geometry: SectionGeometry, number: number) => void;
  onDeleteSectionDraft: (idx: number) => void;
  onClearAllDrafts: () => void;
  onNext: () => void;
  onBack: () => void;
  onGoToWalls: () => void;
}

interface PendingRect {
  x1: number; y1: number; x2: number; y2: number;
}

export const Step4MarkSections: React.FC<Step4MarkSectionsProps> = ({
  wallPolygons,
  sectionDrafts,
  onAddSectionDraft,
  onDeleteSectionDraft,
  onClearAllDrafts,
  onNext,
  onBack,
  onGoToWalls,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [zoom, setZoom] = useState(1);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [dragCur, setDragCur] = useState<{ x: number; y: number } | null>(null);
  const [pendingRect, setPendingRect] = useState<PendingRect | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [defaultNumber, setDefaultNumber] = useState(1);

  const draftsRef = useRef(sectionDrafts);
  useEffect(() => { draftsRef.current = sectionDrafts; }, [sectionDrafts]);

  const getCanvasSize = useCallback(() => {
    const c = containerRef.current;
    return c ? { w: c.clientWidth, h: c.clientHeight } : { w: 800, h: 600 };
  }, []);

  const toCanvas = useCallback((nx: number, ny: number) => {
    const { w: cw, h: ch } = getCanvasSize();
    const scale = zoom;
    const dw = cw * scale;
    const dh = ch * scale;
    const dx = (cw - dw) / 2;
    const dy = (ch - dh) / 2;
    return { cx: dx + nx * dw, cy: dy + ny * dh };
  }, [getCanvasSize, zoom]);

  const toNorm = useCallback((cx: number, cy: number) => {
    const { w: cw, h: ch } = getCanvasSize();
    const scale = zoom;
    const dw = cw * scale;
    const dh = ch * scale;
    const dx = (cw - dw) / 2;
    const dy = (ch - dh) / 2;
    return { nx: (cx - dx) / dw, ny: (cy - dy) / dh };
  }, [getCanvasSize, zoom]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const { w: cw, h: ch } = getCanvasSize();
    canvas.width = cw;
    canvas.height = ch;
    ctx.clearRect(0, 0, cw, ch);
    ctx.fillStyle = '#161618';
    ctx.fillRect(0, 0, cw, ch);

    // Draw wall polygons
    ctx.strokeStyle = '#888';
    ctx.lineWidth = 1.5;
    for (const poly of (wallPolygons ?? [])) {
      if (poly.length < 2) continue;
      ctx.beginPath();
      const f = toCanvas(poly[0].x, poly[0].y);
      ctx.moveTo(f.cx, f.cy);
      for (let i = 1; i < poly.length; i++) {
        const p = toCanvas(poly[i].x, poly[i].y);
        ctx.lineTo(p.cx, p.cy);
      }
      ctx.stroke();
    }

    // Draw existing sections with palette colors
    for (let idx = 0; idx < draftsRef.current.length; idx++) {
      const draft = draftsRef.current[idx];
      const pts = draft.geometry.points;
      const color = getSectionColor(idx, draft.id);

      ctx.fillStyle = `${color}55`; // 33% opacity fill
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      const first = toCanvas(pts[0][0], pts[0][1]);
      ctx.moveTo(first.cx, first.cy);
      for (let i = 1; i < 4; i++) {
        const p = toCanvas(pts[i][0], pts[i][1]);
        ctx.lineTo(p.cx, p.cy);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Number label
      const cx = (pts[0][0] + pts[1][0] + pts[2][0] + pts[3][0]) / 4;
      const cy = (pts[0][1] + pts[1][1] + pts[2][1] + pts[3][1]) / 4;
      const center = toCanvas(cx, cy);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 13px Courier New';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      // Shadow for readability
      ctx.shadowColor = 'rgba(0,0,0,0.5)';
      ctx.shadowBlur = 3;
      ctx.fillText(String(draft.number), center.cx, center.cy);
      ctx.shadowBlur = 0;
    }

    // Drag preview
    if (dragStart && dragCur) {
      const s = toCanvas(dragStart.x, dragStart.y);
      const e = toCanvas(dragCur.x, dragCur.y);
      ctx.strokeStyle = '#ff6b1f';
      ctx.lineWidth = 2;
      ctx.fillStyle = 'rgba(255, 107, 31, 0.15)';
      ctx.setLineDash([5, 5]);
      const rx = Math.min(s.cx, e.cx);
      const ry = Math.min(s.cy, e.cy);
      const rw = Math.abs(e.cx - s.cx);
      const rh = Math.abs(e.cy - s.cy);
      ctx.fillRect(rx, ry, rw, rh);
      ctx.strokeRect(rx, ry, rw, rh);
      ctx.setLineDash([]);
    }
  }, [getCanvasSize, toCanvas, wallPolygons, dragStart, dragCur]);

  useEffect(() => { draw(); }, [draw, sectionDrafts]);

  const getPos = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const { nx, ny } = toNorm(e.clientX - rect.left, e.clientY - rect.top);
    return { x: Math.max(0, Math.min(1, nx)), y: Math.max(0, Math.min(1, ny)) };
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const pt = getPos(e);
    setDragStart(pt);
    setDragCur(pt);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!dragStart) return;
    setDragCur(getPos(e));
  };

  const handleMouseUp = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!dragStart) return;
    const end = getPos(e);
    const x1 = Math.min(dragStart.x, end.x);
    const y1 = Math.min(dragStart.y, end.y);
    const x2 = Math.max(dragStart.x, end.x);
    const y2 = Math.max(dragStart.y, end.y);
    setDragStart(null);
    setDragCur(null);

    if (Math.abs(x2 - x1) < 0.02 || Math.abs(y2 - y1) < 0.02) return;

    setPendingRect({ x1, y1, x2, y2 });
    const maxNum = draftsRef.current.reduce((m, d) => Math.max(m, d.number), 0);
    setDefaultNumber(maxNum + 1);
    setDialogOpen(true);
  };

  const handleDialogConfirm = (num: number, _description: string, color: string) => {
    // _description is client-only; backend API doesn't have description field (ADR-29)
    if (!pendingRect) return;
    const { x1, y1, x2, y2 } = pendingRect;
    const geometry: SectionGeometry = {
      points: [[x1, y1], [x2, y1], [x2, y2], [x1, y2]],
    };
    onAddSectionDraft(geometry, num);
    // Persist user-chosen color in localStorage so FloorOverview / FloorSectionsTable
    // pick it up on next render. Keyed by draft index (negative pseudo-id) until saved.
    try {
      localStorage.setItem(`sectionColor:draft:${num}`, color);
    } catch { /* ignore */ }
    setDialogOpen(false);
    setPendingRect(null);
  };

  const handleClearAll = () => {
    if (window.confirm('Очистить все отсеки?')) onClearAllDrafts();
  };

  const takenNumbers = sectionDrafts.map((d) => d.number);

  return (
    <div className={styles.layout}>
      <div className={styles.body}>
        {/* Left sidebar */}
        <aside className={styles.sidebar}>
          <div className={styles.sidebarTitle}>Инструменты</div>
          <button className={styles.toolBtn} onClick={onGoToWalls} type="button">
            ← Стены
          </button>
          <button className={`${styles.toolBtn} ${styles.toolBtnActive}`} type="button">
            ▭ Прямоугольник
          </button>
          <button
            className={`${styles.toolBtn} ${styles.toolBtnDanger}`}
            onClick={handleClearAll}
            type="button"
          >
            🗑 Очистить всё
          </button>

          {sectionDrafts.length > 0 && (
            <>
              <div className={styles.sidebarTitle} style={{ marginTop: '1rem' }}>
                Отсеки
              </div>
              <div className={styles.sectionList}>
                {sectionDrafts.map((d, idx) => (
                  <div key={idx} className={styles.sectionItem}>
                    <span
                      className={styles.sectionDot}
                      style={{ background: getSectionColor(idx, d.id), borderRadius: '2px' }}
                    />
                    Отсек {d.number}
                    <button
                      style={{
                        marginLeft: 'auto',
                        background: 'none',
                        border: 'none',
                        color: '#666',
                        cursor: 'pointer',
                        fontSize: '0.75rem',
                        padding: '0',
                      }}
                      onClick={() => onDeleteSectionDraft(idx)}
                      type="button"
                      title="Удалить отсек"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}
        </aside>

        {/* Canvas — light background */}
        <div className={styles.canvasArea} ref={containerRef}>
          <canvas
            ref={canvasRef}
            className={styles.canvas}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            style={{ cursor: 'crosshair' }}
          />
          <span className={styles.canvasHint}>
            Выделите прямоугольником отсек и задайте номер
          </span>
          <CanvasControls
            onZoomIn={() => setZoom((z) => Math.min(z + 0.25, 4))}
            onZoomOut={() => setZoom((z) => Math.max(z - 0.25, 0.25))}
            onReset={() => setZoom(1)}
          />
        </div>

        {/* Right side panel — only when dialog is open */}
        {dialogOpen && (
          <NewSectionDialog
            open={dialogOpen}
            initialNumber={defaultNumber}
            takenNumbers={takenNumbers}
            onConfirm={handleDialogConfirm}
            onCancel={() => { setDialogOpen(false); setPendingRect(null); }}
          />
        )}
      </div>

      <footer className={styles.footer}>
        <button className={styles.btnBack} onClick={onBack} type="button">
          ← Назад
        </button>
        <span className={styles.footerHint}>Выделите прямоугольником отсек и задайте номер</span>
        <button
          className={styles.btnNext}
          onClick={onNext}
          disabled={sectionDrafts.length === 0}
          type="button"
        >
          Далее →
        </button>
      </footer>
    </div>
  );
};
