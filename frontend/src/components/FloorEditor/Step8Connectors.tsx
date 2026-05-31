// Step 8 (UC4): draw the corridor connector polylines on the master schema. A
// connector is an OPEN polyline (one corridor wall) rendered as a thick band —
// the floor mesh is walls-only, so a line literally extrudes into a wall.
//
// Tools:
//  • Draw: click to add a vertex; double-click / Enter to finish; Esc cancels.
//  • Edit: drag a vertex to move it; Shift+click a segment inserts a vertex;
//    right-click a vertex removes it; the side panel deletes a whole line.
//  • Persist: "Сохранить" → replaceConnectors (atomic replace-all).
//
// Presentational only — the committed connector drafts live in useFloorAssembly;
// the in-progress polyline + drag state are local UI concerns kept here.

import React, { useRef, useEffect, useCallback, useState } from 'react';
import { fitContain } from './croppedImage';
import {
  toImageCoords,
  toDisplayCoords,
  displayRadiusToNorm,
  R_HIT_PX,
  type CanvasLayout,
} from '../controlPointCanvasCore';
import type { ConnectorDraft } from '../../hooks/useFloorAssembly';
import wizardStyles from './WizardStep.module.css';
import styles from './Step8Connectors.module.css';

interface Step8ConnectorsProps {
  // Connectors are drawn on the cropped floor-schema mask (карта отсеков), so their
  // [0,1] coords round-trip with the mesh builder (which de-normalises over the
  // cropped canvas).
  masterMaskUrl: string | null;
  connectorDrafts: ConnectorDraft[];
  isSaving: boolean;
  onChangeDrafts: (drafts: ConnectorDraft[]) => void;
  onSave: () => Promise<void>;
  onBack: () => void;
  onNext: () => void;
}

const BAND_COLOR = '#2563eb';
const DRAFT_COLOR = '#f05123';
const VERTEX_R = 4;

/** Index of the vertex under `norm` (within R_HIT), or null. */
interface VertexHit {
  line: number;
  vertex: number;
}

export const Step8Connectors: React.FC<Step8ConnectorsProps> = ({
  masterMaskUrl,
  connectorDrafts,
  isSaving,
  onChangeDrafts,
  onSave,
  onBack,
  onNext,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const layoutRef = useRef<CanvasLayout>({
    offsetX: 0,
    offsetY: 0,
    drawWidth: 0,
    drawHeight: 0,
  });

  const [drawing, setDrawing] = useState<[number, number][]>([]);
  const [dragging, setDragging] = useState<VertexHit | null>(null);
  // Refs mirror the latest state so the canvas draw + window listeners can read
  // them synchronously without re-binding every render.
  const drawingRef = useRef(drawing);
  const draftsRef = useRef(connectorDrafts);
  useEffect(() => {
    drawingRef.current = drawing;
  }, [drawing]);
  useEffect(() => {
    draftsRef.current = connectorDrafts;
  }, [connectorDrafts]);

  const computeLayout = useCallback((): CanvasLayout => {
    const container = containerRef.current;
    const img = imgRef.current;
    if (!container) return { offsetX: 0, offsetY: 0, drawWidth: 0, drawHeight: 0 };
    const cw = container.clientWidth;
    const ch = container.clientHeight;
    // Size to the cropped floor mask, so connector [0,1] coords match the builder's
    // cropped canvas.
    const iw = img?.naturalWidth ?? cw;
    const ih = img?.naturalHeight ?? ch;
    const { dx, dy, dw, dh } = fitContain(iw, ih, cw, ch, 1);
    return { offsetX: dx, offsetY: dy, drawWidth: dw, drawHeight: dh };
  }, []);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const cw = container.clientWidth;
    const ch = container.clientHeight;
    if (cw <= 0 || ch <= 0) return;
    canvas.width = cw;
    canvas.height = ch;
    ctx.clearRect(0, 0, cw, ch);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, cw, ch);

    const layout = computeLayout();
    layoutRef.current = layout;

    const img = imgRef.current;
    if (img && layout.drawWidth > 0) {
      ctx.save();
      ctx.filter = 'invert(1)'; // mask is white-on-black → black walls on white
      ctx.drawImage(
        img,
        layout.offsetX,
        layout.offsetY,
        layout.drawWidth,
        layout.drawHeight,
      );
      ctx.restore();
    }

    const drawPolyline = (
      pts: [number, number][],
      color: string,
      band: boolean,
    ) => {
      if (pts.length === 0) return;
      // Thick band so the operator sees it like the extruded wall it becomes.
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      if (pts.length >= 2) {
        ctx.beginPath();
        pts.forEach((p, i) => {
          const d = toDisplayCoords({ x: p[0], y: p[1] }, layout);
          if (i === 0) ctx.moveTo(d.x, d.y);
          else ctx.lineTo(d.x, d.y);
        });
        ctx.strokeStyle = color;
        ctx.lineWidth = band ? 10 : 2;
        ctx.globalAlpha = band ? 0.35 : 1;
        ctx.stroke();
        ctx.globalAlpha = 1;
        // Thin centre line for precision.
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
      // Vertices.
      pts.forEach((p) => {
        const d = toDisplayCoords({ x: p[0], y: p[1] }, layout);
        ctx.beginPath();
        ctx.arc(d.x, d.y, VERTEX_R, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
      });
    };

    draftsRef.current.forEach((conn) => drawPolyline(conn.points, BAND_COLOR, true));
    drawPolyline(drawingRef.current, DRAFT_COLOR, false);
  }, [computeLayout]);

  // Load the cropped floor-schema mask backdrop.
  useEffect(() => {
    if (!masterMaskUrl) {
      imgRef.current = null;
      draw();
      return;
    }
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (cancelled) return;
      imgRef.current = img;
      draw();
    };
    img.onerror = () => {
      if (cancelled) return;
      imgRef.current = null;
      draw();
    };
    img.src = masterMaskUrl;
    return () => {
      cancelled = true;
    };
  }, [masterMaskUrl, draw]);

  // Redraw on state change + resize.
  useEffect(() => {
    draw();
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => draw());
    observer.observe(el);
    return () => observer.disconnect();
  }, [draw, connectorDrafts, drawing, dragging]);

  // --- hit testing ---------------------------------------------------------
  const hitVertex = useCallback((norm: { x: number; y: number }): VertexHit | null => {
    const layout = layoutRef.current;
    const radius = displayRadiusToNorm(R_HIT_PX, layout.drawWidth);
    if (radius <= 0) return null;
    let best: VertexHit | null = null;
    let bestDistSq = radius * radius;
    draftsRef.current.forEach((conn, li) => {
      conn.points.forEach((p, vi) => {
        const dx = p[0] - norm.x;
        const dy = p[1] - norm.y;
        const distSq = dx * dx + dy * dy;
        if (distSq <= bestDistSq) {
          bestDistSq = distSq;
          best = { line: li, vertex: vi };
        }
      });
    });
    return best;
  }, []);

  // Nearest segment (line, segIndex) within radius — for Shift+click insert.
  const hitSegment = useCallback(
    (norm: { x: number; y: number }): { line: number; seg: number } | null => {
      const layout = layoutRef.current;
      const radius = displayRadiusToNorm(R_HIT_PX, layout.drawWidth);
      if (radius <= 0) return null;
      let best: { line: number; seg: number } | null = null;
      let bestDist = radius;
      draftsRef.current.forEach((conn, li) => {
        for (let i = 0; i < conn.points.length - 1; i++) {
          const a = conn.points[i];
          const b = conn.points[i + 1];
          const dist = pointSegmentDistance(norm.x, norm.y, a[0], a[1], b[0], b[1]);
          if (dist <= bestDist) {
            bestDist = dist;
            best = { line: li, seg: i };
          }
        }
      });
      return best;
    },
    [],
  );

  const eventToNorm = useCallback(
    (event: React.MouseEvent<HTMLDivElement>): { x: number; y: number } | null => {
      const el = containerRef.current;
      if (!el) return null;
      const rect = el.getBoundingClientRect();
      return toImageCoords(
        event.clientX - rect.left,
        event.clientY - rect.top,
        layoutRef.current,
      );
    },
    [],
  );

  // --- mouse interactions --------------------------------------------------
  const handleMouseDown = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (event.button !== 0) return; // left only
      const norm = eventToNorm(event);
      if (!norm) return;

      // Shift+click a segment → insert a vertex there (edit existing line).
      if (event.shiftKey) {
        const seg = hitSegment(norm);
        if (seg) {
          const next = draftsRef.current.map((c, i) => {
            if (i !== seg.line) return c;
            const pts = [...c.points];
            pts.splice(seg.seg + 1, 0, [norm.x, norm.y]);
            return { ...c, points: pts };
          });
          onChangeDrafts(next);
          return;
        }
      }

      // Grab an existing vertex to drag.
      const vh = hitVertex(norm);
      if (vh) {
        setDragging(vh);
        return;
      }

      // Otherwise extend the in-progress polyline (draw mode).
      setDrawing((prev) => [...prev, [norm.x, norm.y]]);
    },
    [eventToNorm, hitSegment, hitVertex, onChangeDrafts],
  );

  const handleMouseMove = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (!dragging) return;
      const norm = eventToNorm(event);
      if (!norm) return;
      const next = draftsRef.current.map((c, i) => {
        if (i !== dragging.line) return c;
        const pts = c.points.map((p, vi) =>
          vi === dragging.vertex ? ([norm.x, norm.y] as [number, number]) : p,
        );
        return { ...c, points: pts };
      });
      onChangeDrafts(next);
    },
    [dragging, eventToNorm, onChangeDrafts],
  );

  const handleMouseUp = useCallback(() => {
    if (dragging) setDragging(null);
  }, [dragging]);

  // Right-click a vertex → remove it (drops the line if it falls below 2 pts).
  const handleContextMenu = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      const norm = eventToNorm(event);
      if (!norm) return;
      const vh = hitVertex(norm);
      if (!vh) return;
      event.preventDefault();
      const next: ConnectorDraft[] = [];
      draftsRef.current.forEach((c, i) => {
        if (i !== vh.line) {
          next.push(c);
          return;
        }
        const pts = c.points.filter((_, vi) => vi !== vh.vertex);
        if (pts.length >= 2) next.push({ ...c, points: pts });
        // else: line drops entirely.
      });
      onChangeDrafts(next);
    },
    [eventToNorm, hitVertex, onChangeDrafts],
  );

  // Double-click → finish the current polyline.
  const finishDrawing = useCallback(() => {
    setDrawing((prev) => {
      if (prev.length >= 2) {
        onChangeDrafts([...draftsRef.current, { points: prev }]);
      }
      return [];
    });
  }, [onChangeDrafts]);

  const handleDoubleClick = useCallback(() => {
    finishDrawing();
  }, [finishDrawing]);

  // Enter finishes, Esc cancels the in-progress polyline.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        finishDrawing();
      } else if (e.key === 'Escape') {
        setDrawing([]);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [finishDrawing]);

  // End any drag even if the mouse is released outside the canvas.
  useEffect(() => {
    const onUp = () => setDragging(null);
    window.addEventListener('mouseup', onUp);
    return () => window.removeEventListener('mouseup', onUp);
  }, []);

  const deleteLine = useCallback(
    (index: number) => {
      onChangeDrafts(draftsRef.current.filter((_, i) => i !== index));
    },
    [onChangeDrafts],
  );

  return (
    <div className={wizardStyles.layout}>
      <div className={styles.body}>
        {/* Center — master schema draw surface */}
        <div className={styles.canvasPanel}>
          <div
            className={styles.canvasWrap}
            ref={containerRef}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onDoubleClick={handleDoubleClick}
            onContextMenu={handleContextMenu}
          >
            <canvas
              ref={canvasRef}
              style={{ width: '100%', height: '100%', display: 'block' }}
            />
            {!masterMaskUrl && (
              <div className={styles.canvasEmpty}>Нет карты отсеков</div>
            )}
          </div>
        </div>

        {/* Right panel — tools + connector list */}
        <aside className={styles.panel}>
          <div className={styles.panelTitle}>ПЕРЕХОДЫ</div>
          <div className={styles.hint}>
            Клик — добавить вершину. Двойной клик / Enter — завершить линию. Esc —
            отменить. Перетащить вершину — переместить. Shift+клик по линии —
            вставить вершину. ПКМ по вершине — удалить.
          </div>

          {drawing.length > 0 && (
            <div className={styles.drawingBadge}>
              Рисуется линия: {drawing.length} вершин
              <button
                type="button"
                className={styles.miniBtn}
                onClick={() => setDrawing([])}
              >
                Отмена
              </button>
            </div>
          )}

          <div className={styles.connList}>
            {connectorDrafts.map((c, i) => (
              <div key={c.id ?? `draft-${i}`} className={styles.connRow}>
                <span className={styles.connDot} />
                <span className={styles.connName}>
                  Линия {i + 1} · {c.points.length} вершин
                </span>
                <button
                  type="button"
                  className={styles.connDelete}
                  title="Удалить линию"
                  onClick={() => deleteLine(i)}
                >
                  ✕
                </button>
              </div>
            ))}
            {connectorDrafts.length === 0 && (
              <div className={styles.emptyHint}>Нет переходов</div>
            )}
          </div>

          <button
            type="button"
            className={styles.saveBtn}
            onClick={() => void onSave()}
            disabled={isSaving}
          >
            Сохранить переходы
          </button>
        </aside>
      </div>

      <footer className={wizardStyles.footer}>
        <button className={wizardStyles.btnBack} onClick={onBack} type="button">
          ← Назад
        </button>
        <span className={wizardStyles.footerHint} />
        <button className={wizardStyles.btnNext} onClick={onNext} type="button">
          Далее ▸
        </button>
      </footer>
    </div>
  );
};

/** Distance from point (px,py) to segment (ax,ay)-(bx,by), all in [0,1]. */
function pointSegmentDistance(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) {
    return Math.hypot(px - ax, py - ay);
  }
  let t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const cx = ax + t * dx;
  const cy = ay + t * dy;
  return Math.hypot(px - cx, py - cy);
}
