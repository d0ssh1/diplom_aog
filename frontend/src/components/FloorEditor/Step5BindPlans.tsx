import React, { useRef, useEffect, useCallback, useState } from 'react';
import styles from './WizardStep.module.css';
import step5Styles from './Step5BindPlans.module.css';
import { PlanGalleryPicker } from './PlanGalleryPicker';
import { getSectionColor } from './sectionColors';
import type { SectionDraft, Point2D } from '../../hooks/useFloorEditorWizard';
import type { Building } from '../../types/hierarchy';

interface Step5BindPlansProps {
  sectionDrafts: SectionDraft[];
  wallPolygons: Point2D[][] | null;
  buildings: Building[];
  isLoading: boolean;
  onBind: (sectionIdx: number, reconstructionId: number | null) => void;
  onSave: () => Promise<void>;
  onSaveAndExit: () => Promise<void>;
  onBack: () => void;
}

export const Step5BindPlans: React.FC<Step5BindPlansProps> = ({
  sectionDrafts,
  wallPolygons,
  buildings,
  isLoading,
  onBind,
  onSave,
  onSaveAndExit,
  onBack,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [activeIdx, setActiveIdx] = useState(0);

  const getCanvasSize = useCallback(() => {
    const c = containerRef.current;
    return c ? { w: c.clientWidth, h: c.clientHeight } : { w: 200, h: 200 };
  }, []);

  const toCanvas = useCallback((nx: number, ny: number) => {
    const { w: cw, h: ch } = getCanvasSize();
    return { cx: nx * cw, cy: ny * ch };
  }, [getCanvasSize]);

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

    // Wall polygons
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

    // Active section — use palette color
    if (activeIdx < sectionDrafts.length) {
      const draft = sectionDrafts[activeIdx];
      const pts = draft.geometry.points;
      const color = getSectionColor(activeIdx, draft.id);
      ctx.fillStyle = `${color}55`;
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      const f = toCanvas(pts[0][0], pts[0][1]);
      ctx.moveTo(f.cx, f.cy);
      for (let i = 1; i < 4; i++) {
        const p = toCanvas(pts[i][0], pts[i][1]);
        ctx.lineTo(p.cx, p.cy);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Section number label
      const cx = (pts[0][0] + pts[1][0] + pts[2][0] + pts[3][0]) / 4;
      const cy = (pts[0][1] + pts[1][1] + pts[2][1] + pts[3][1]) / 4;
      const center = toCanvas(cx, cy);
      ctx.fillStyle = color;
      ctx.font = 'bold 12px Courier New';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowColor = 'rgba(255,255,255,0.8)';
      ctx.shadowBlur = 3;
      ctx.fillText(String(draft.number), center.cx, center.cy);
      ctx.shadowBlur = 0;
    }
  }, [getCanvasSize, toCanvas, wallPolygons, sectionDrafts, activeIdx]);

  useEffect(() => { draw(); }, [draw]);

  // Cleanup canvas on unmount
  useEffect(() => {
    return () => {
      if (canvasRef.current) {
        const ctx = canvasRef.current.getContext('2d');
        if (ctx) ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
      }
    };
  }, []);

  const activeDraft = sectionDrafts[activeIdx] ?? null;
  const selectedReconId = activeDraft?.reconstruction_id ?? null;

  return (
    <div className={styles.layout}>
      <div className={step5Styles.body}>
        {/* Left: section list with colored chips */}
        <aside className={step5Styles.sectionsPanel}>
          <div className={step5Styles.panelTitle}>Отсеки на схеме</div>
          <div className={step5Styles.sectionList}>
            {sectionDrafts.map((d, idx) => {
              const color = getSectionColor(idx, d.id);
              return (
                <button
                  key={idx}
                  className={`${step5Styles.sectionBtn} ${idx === activeIdx ? step5Styles.sectionBtnActive : ''}`}
                  onClick={() => setActiveIdx(idx)}
                  type="button"
                >
                  <span
                    className={step5Styles.sectionDot}
                    style={{ background: color }}
                  />
                  <span style={{ flex: 1 }}>Отсек {d.number}</span>
                  {d.reconstruction_id !== null && (
                    <span className={step5Styles.checkmark}>✓</span>
                  )}
                </button>
              );
            })}
          </div>
        </aside>

        {/* Center: gallery */}
        <div className={step5Styles.galleryPanel}>
          <div className={step5Styles.panelTitle}>Планы этого этажа</div>
          <PlanGalleryPicker
            buildings={buildings}
            selectedReconstructionId={selectedReconId}
            onSelect={(id) => {
              const newId = id === selectedReconId ? null : id;
              onBind(activeIdx, newId);
            }}
          />
        </div>

        {/* Right: preview */}
        <div className={step5Styles.previewPanel}>
          <div className={step5Styles.panelTitle}>Превью отсека</div>
          <div className={step5Styles.canvasWrap} ref={containerRef}>
            <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />
          </div>
          {activeDraft && (
            <p className={step5Styles.previewLabel}>Отсек {activeDraft.number}</p>
          )}
        </div>
      </div>

      <footer className={styles.footer}>
        <button className={styles.btnBack} onClick={onBack} type="button">
          ← Назад
        </button>
        <span className={styles.footerHint} />
        <button
          className={styles.btnBack}
          onClick={() => void onSaveAndExit()}
          disabled={isLoading}
          type="button"
          style={{ borderColor: '#ff6b1f', color: '#ff6b1f' }}
        >
          Сохранить и выйти
        </button>
        <button
          className={styles.btnSave}
          onClick={() => void onSave()}
          disabled={isLoading}
          type="button"
        >
          Сохранить
        </button>
      </footer>
    </div>
  );
};
