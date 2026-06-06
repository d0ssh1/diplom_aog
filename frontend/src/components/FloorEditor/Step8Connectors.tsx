// Step 8 (UC4): draw the corridor connector walls on the master schema. Each
// connector is an independent straight wall segment rendered as a thick band —
// the floor mesh is walls-only, so a segment literally extrudes into a wall.
//
// Two-click model (mirrors the WallEditorCanvas `wall` tool):
//  • Click 1 anchors the start point (a dot marker appears).
//  • Mouse-move draws a dashed preview line from the anchor to the cursor.
//  • Click 2 commits ONE segment {points:[start,end], thickness_m}; Esc cancels.
//  • Shift on the second click snaps the end to the nearest axis.
//  • Delete a whole segment from the side-panel list.
//
// Thickness is a real metric value (0.1–2.0 m) set by the slider; every NEW
// segment takes the current slider value and keeps it. The canvas preview width
// is purely proportional (max(3, thickness_m * 36)) and drawn as a solid-ish band
// so the WIDTH is what the eye reads — the physical thickness is applied at build
// time (thickness_m * ppm_floor * k). Legacy connectors with >2 points still
// render and persist (only creation is two-click now).
//
// Presentational only — the committed connector drafts live in useFloorAssembly;
// the in-progress start anchor + cursor position are local UI concerns kept here.

import React, { useRef, useEffect, useCallback, useState } from 'react';
import { fitContain } from './croppedImage';
import {
  toImageCoords,
  toDisplayCoords,
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
  /** Metric scale of the master schema — display hint only (optional). */
  pixelsPerMeter?: number | null;
}

const BAND_COLOR = '#2563eb';
const DRAFT_COLOR = '#f05123';
const VERTEX_R = 4;

/** Display multiplier: metres → preview band width in px on the (tiny) schema. */
const PX_PER_METRE = 36;
/** Default wall thickness in metres for new segments. */
const DEFAULT_THICKNESS_M = 0.3;

/** Preview band width in px for a given metric thickness (min 3 px to stay visible). */
const bandWidthPx = (thicknessM: number): number =>
  Math.max(3, thicknessM * PX_PER_METRE);

export const Step8Connectors: React.FC<Step8ConnectorsProps> = ({
  masterMaskUrl,
  connectorDrafts,
  isSaving,
  onChangeDrafts,
  onSave,
  onBack,
  onNext,
  pixelsPerMeter,
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

  // First click anchors here; cleared on second click / Esc.
  const [pendingStart, setPendingStart] = useState<[number, number] | null>(null);
  // Cursor position (normalised) for the live preview line.
  const [mouseNorm, setMouseNorm] = useState<[number, number] | null>(null);
  const [thicknessM, setThicknessM] = useState(DEFAULT_THICKNESS_M);

  // Refs mirror the latest state so the canvas draw + window listeners can read
  // them synchronously without re-binding every render.
  const draftsRef = useRef(connectorDrafts);
  const pendingStartRef = useRef(pendingStart);
  const mouseNormRef = useRef(mouseNorm);
  const thicknessRef = useRef(thicknessM);
  useEffect(() => {
    draftsRef.current = connectorDrafts;
  }, [connectorDrafts]);
  useEffect(() => {
    pendingStartRef.current = pendingStart;
  }, [pendingStart]);
  useEffect(() => {
    mouseNormRef.current = mouseNorm;
  }, [mouseNorm]);
  useEffect(() => {
    thicknessRef.current = thicknessM;
  }, [thicknessM]);

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

    // Render a polyline at a fixed band width. Handles 2 AND >2 points, so legacy
    // multi-vertex connectors still draw correctly.
    const drawPolyline = (
      pts: [number, number][],
      color: string,
      widthPx: number,
      dashed: boolean,
    ) => {
      if (pts.length === 0) return;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      if (pts.length >= 2) {
        ctx.beginPath();
        pts.forEach((p, i) => {
          const d = toDisplayCoords({ x: p[0], y: p[1] }, layout);
          if (i === 0) ctx.moveTo(d.x, d.y);
          else ctx.lineTo(d.x, d.y);
        });
        // The BAND itself is the primary visual — its WIDTH conveys the metric
        // thickness, so draw it solid-ish (the eye reads width, not a centre line).
        ctx.strokeStyle = color;
        ctx.lineWidth = widthPx;
        ctx.globalAlpha = 0.6;
        if (dashed) ctx.setLineDash([6, 5]);
        ctx.stroke();
        ctx.setLineDash([]);
        // Very subtle 1px centre hairline only for precision when reading endpoints.
        ctx.lineWidth = 1;
        ctx.globalAlpha = 0.25;
        if (dashed) ctx.setLineDash([6, 5]);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;
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

    // Saved segments — each at ITS OWN thickness.
    draftsRef.current.forEach((conn) =>
      drawPolyline(conn.points, BAND_COLOR, bandWidthPx(conn.thickness_m), false),
    );

    // Preview line from the anchored start to the cursor (current slider width).
    const start = pendingStartRef.current;
    const cursor = mouseNormRef.current;
    if (start) {
      if (cursor) {
        drawPolyline(
          [start, cursor],
          DRAFT_COLOR,
          bandWidthPx(thicknessRef.current),
          true,
        );
      } else {
        // No cursor yet — just mark the anchor.
        const d = toDisplayCoords({ x: start[0], y: start[1] }, layout);
        ctx.beginPath();
        ctx.arc(d.x, d.y, VERTEX_R, 0, Math.PI * 2);
        ctx.fillStyle = DRAFT_COLOR;
        ctx.fill();
      }
    }
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
  }, [draw, connectorDrafts, pendingStart, mouseNorm, thicknessM]);

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
      if (!norm) return; // click outside the image — ignore

      const start = pendingStartRef.current;
      if (!start) {
        // First click — anchor the start point.
        setPendingStart([norm.x, norm.y]);
        setMouseNorm([norm.x, norm.y]);
        return;
      }

      // Second click — ignore a zero-length (coincident) segment.
      const dx = norm.x - start[0];
      const dy = norm.y - start[1];
      if (Math.hypot(dx, dy) < 1e-4) {
        setPendingStart(null);
        return;
      }

      // Shift snaps the end point to the nearest axis.
      let endX = norm.x;
      let endY = norm.y;
      if (event.shiftKey) {
        if (Math.abs(dx) >= Math.abs(dy)) endY = start[1];
        else endX = start[0];
      }

      onChangeDrafts([
        ...draftsRef.current,
        { points: [start, [endX, endY]], thickness_m: thicknessRef.current },
      ]);
      setPendingStart(null);
    },
    [eventToNorm, onChangeDrafts],
  );

  const handleMouseMove = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      const norm = eventToNorm(event);
      setMouseNorm(norm ? [norm.x, norm.y] : null);
    },
    [eventToNorm],
  );

  // Esc cancels the in-progress start anchor.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPendingStart(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const deleteLine = useCallback(
    (index: number) => {
      onChangeDrafts(draftsRef.current.filter((_, i) => i !== index));
    },
    [onChangeDrafts],
  );

  const ppmHint =
    pixelsPerMeter != null && pixelsPerMeter > 0
      ? `≈ ${(thicknessM * pixelsPerMeter).toFixed(0)} px на эталоне`
      : null;

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

        {/* Right panel — thickness + connector list */}
        <aside className={styles.panel}>
          <div className={styles.panelTitle}>ПЕРЕХОДЫ</div>
          <div className={styles.hint}>
            Клик — начало стены. Второй клик — конец стены. Shift — привязка к оси.
            Esc — отмена.
          </div>

          <div className={styles.paramRow}>
            <span className={styles.paramLabel}>Толщина стены</span>
            <input
              className={styles.slider}
              type="range"
              min={0.1}
              max={2.0}
              step={0.05}
              value={thicknessM}
              onChange={(e) => setThicknessM(Number(e.target.value))}
            />
            <span className={styles.sliderValue}>{thicknessM.toFixed(2)} м</span>
          </div>
          {ppmHint && <div className={styles.paramHint}>{ppmHint}</div>}

          <div className={styles.connList}>
            {connectorDrafts.map((c, i) => (
              <div key={c.id ?? `draft-${i}`} className={styles.connRow}>
                <span className={styles.connDot} />
                <span className={styles.connName}>
                  Линия {i + 1} · {c.thickness_m.toFixed(2)} м
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
