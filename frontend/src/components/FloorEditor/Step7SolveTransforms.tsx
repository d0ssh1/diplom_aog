// Step 7 (UC3): solve every bound section's uniform similarity transform and
// review the result. "Решить" runs POST /solve-transforms; each section then
// shows a status chip (green ok / amber ok+warning / red needs_points / red
// degenerate) with its registration residual in METRES, and every ok section's
// warped footprint is overlaid on the master schema in its section colour so the
// operator can eyeball the registration before building.
//
// Residual in metres = transform.residual_rms_px / pixels_per_meter (both from
// the SolveTransformsResponse). pixels_per_meter null/0 → "—" (never NaN/∞).
//
// Presentational only — solve state/actions live in useFloorAssembly.

import React, { useRef, useEffect, useCallback } from 'react';
import { getSectionColor } from './sectionColors';
import { fitContain, bakeCroppedRotated } from './croppedImage';
import type {
  AssemblySection,
  SolveSectionResult,
  SolveTransformsResponse,
} from '../../types/floorAssembly';
import type { CropBbox } from '../../types/hierarchy';
import wizardStyles from './WizardStep.module.css';
import styles from './Step7SolveTransforms.module.css';

interface Step7SolveTransformsProps {
  sections: AssemblySection[];
  masterSchemaUrl: string | null;
  // The warped section overlays map section px → CROPPED master px, so the backdrop
  // + normalisation frame must be the cropped карта отсеков (not the full raster).
  masterCropBbox: CropBbox | null;
  masterWallPolygons: [number, number][][] | null;
  solveResult: SolveTransformsResponse | null;
  isSolving: boolean;
  onSolve: () => Promise<void>;
  onBack: () => void;
  onNext: () => void;
}

type ChipKind = 'ok' | 'warning' | 'error';

const STATUS_LABEL: Record<SolveSectionResult['status'], string> = {
  ok: 'OK',
  needs_points: 'Мало точек',
  degenerate: 'Вырождено',
};

const chipKindFor = (r: SolveSectionResult): ChipKind => {
  if (r.status !== 'ok') return 'error';
  return r.warning ? 'warning' : 'ok';
};

/**
 * Residual in metres, guarded. Returns "—" when no transform or ppm is null/0
 * (never NaN/∞). Pure helper kept local to the step (display-only).
 */
export const residualMetres = (
  r: SolveSectionResult,
  pixelsPerMeter: number | null,
): string => {
  if (r.transform === null) return '—';
  if (pixelsPerMeter === null || pixelsPerMeter <= 0) return '—';
  const metres = r.transform.residual_rms_px / pixelsPerMeter;
  if (!Number.isFinite(metres)) return '—';
  return `${metres.toFixed(3)} м`;
};

export const Step7SolveTransforms: React.FC<Step7SolveTransformsProps> = ({
  sections,
  masterSchemaUrl,
  masterCropBbox,
  masterWallPolygons,
  solveResult,
  isSolving,
  onSolve,
  onBack,
  onNext,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  // Cropped карта-отсеков frame (баked from schema + crop) — the frame the solved
  // transforms map into, so overlays land correctly.
  const bakedRef = useRef<HTMLCanvasElement | null>(null);
  const wallPolyRef = useRef<[number, number][][] | null>(null);

  const sectionIndexById = new Map<number, number>();
  sections.forEach((s, i) => sectionIndexById.set(s.section_id, i));

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

    // The CROPPED master frame is the canvas the transforms map into (master px).
    const baked = bakedRef.current;
    const masterW = baked?.width ?? 0;
    const masterH = baked?.height ?? 0;
    if (!baked || masterW <= 0 || masterH <= 0) return;

    const { dx, dy, dw, dh } = fitContain(masterW, masterH, cw, ch, 1);
    ctx.drawImage(baked, dx, dy, dw, dh);

    // Vector карта отсеков (section outlines) as a faint reference.
    const polys = wallPolyRef.current;
    if (polys) {
      ctx.strokeStyle = 'rgba(37, 99, 235, 0.30)';
      ctx.lineWidth = 1.2;
      ctx.lineJoin = 'round';
      for (const poly of polys) {
        if (poly.length < 2) continue;
        ctx.beginPath();
        poly.forEach(([nx, ny], i) => {
          const cx = dx + nx * dw;
          const cy = dy + ny * dh;
          if (i === 0) ctx.moveTo(cx, cy);
          else ctx.lineTo(cx, cy);
        });
        ctx.closePath();
        ctx.stroke();
      }
    }

    if (solveResult === null) return;

    for (const result of solveResult.sections) {
      if (result.status !== 'ok' || result.transform === null) continue;
      const section = sections.find((s) => s.section_id === result.section_id);
      if (!section) continue;
      const [secW, secH] = section.image_size_cropped ?? [masterW, masterH];
      if (secW <= 0 || secH <= 0) continue;

      const { scale, tx, ty } = result.transform;
      // Warp the section's four px corners → master px → normalised → canvas px.
      const corners: [number, number][] = [
        [0, 0],
        [secW, 0],
        [secW, secH],
        [0, secH],
      ];
      const idx = sectionIndexById.get(section.section_id) ?? 0;
      const color = getSectionColor(idx, section.section_id);

      ctx.beginPath();
      corners.forEach(([px, py], i) => {
        const mx = (scale * px + tx) / masterW; // master-normalised
        const my = (scale * py + ty) / masterH;
        const cx = dx + mx * dw;
        const cy = dy + my * dh;
        if (i === 0) ctx.moveTo(cx, cy);
        else ctx.lineTo(cx, cy);
      });
      ctx.closePath();
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.globalAlpha = 0.12;
      ctx.fillStyle = color;
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }, [solveResult, sections]);

  // Mirror vector polygons into a ref so draw() stays identity-stable.
  useEffect(() => {
    wallPolyRef.current = masterWallPolygons;
    draw();
  }, [masterWallPolygons, draw]);

  // Load master schema backdrop and bake the cropped карта-отсеков frame.
  useEffect(() => {
    if (!masterSchemaUrl) {
      imgRef.current = null;
      bakedRef.current = null;
      draw();
      return;
    }
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (cancelled) return;
      imgRef.current = img;
      bakedRef.current = bakeCroppedRotated(img, masterCropBbox ?? null);
      draw();
    };
    img.onerror = () => {
      if (cancelled) return;
      imgRef.current = null;
      bakedRef.current = null;
      draw();
    };
    img.src = masterSchemaUrl;
    return () => {
      cancelled = true;
    };
  }, [masterSchemaUrl, masterCropBbox, draw]);

  // Redraw on overlay/solve change + on resize.
  useEffect(() => {
    draw();
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => draw());
    observer.observe(el);
    return () => observer.disconnect();
  }, [draw]);

  const resultById = new Map<number, SolveSectionResult>();
  solveResult?.sections.forEach((r) => resultById.set(r.section_id, r));
  const boundSections = sections.filter((s) => s.reconstruction_id !== null);
  const ppm = solveResult?.pixels_per_meter ?? null;
  const okCount = solveResult
    ? solveResult.sections.filter((s) => s.status === 'ok').length
    : 0;

  return (
    <div className={wizardStyles.layout}>
      <div className={styles.body}>
        {/* Center — master schema with warped overlays */}
        <div className={styles.canvasPanel}>
          <div className={styles.canvasWrap} ref={containerRef}>
            <canvas
              ref={canvasRef}
              style={{ width: '100%', height: '100%', display: 'block' }}
            />
            {!masterSchemaUrl && (
              <div className={styles.canvasEmpty}>Нет мастер-схемы</div>
            )}
          </div>
        </div>

        {/* Right panel — solve button + per-section status chips */}
        <aside className={styles.panel}>
          <div className={styles.panelTitle}>РЕШЕНИЕ</div>
          <button
            type="button"
            className={styles.solveBtn}
            onClick={() => void onSolve()}
            disabled={isSolving}
          >
            {isSolving ? 'Расчёт…' : 'Рассчитать преобразования'}
          </button>

          {solveResult && (
            <div className={styles.ppmRow}>
              <span className={styles.ppmLabel}>px / м</span>
              <span className={styles.ppmValue}>
                {ppm !== null && ppm > 0 ? ppm.toFixed(1) : '—'}
              </span>
            </div>
          )}

          <div className={styles.chipList}>
            {boundSections.map((s) => {
              const result = resultById.get(s.section_id);
              const idx = sectionIndexById.get(s.section_id) ?? 0;
              const color = getSectionColor(idx, s.section_id);
              if (!result) {
                return (
                  <div key={s.section_id} className={styles.chipRow}>
                    <span
                      className={styles.chipDot}
                      style={{ background: color }}
                    />
                    <span className={styles.chipName}>Отсек {s.number}</span>
                    <span className={styles.chipPending}>—</span>
                  </div>
                );
              }
              const kind = chipKindFor(result);
              return (
                <div key={s.section_id} className={styles.chipRow}>
                  <span
                    className={styles.chipDot}
                    style={{ background: color }}
                  />
                  <span className={styles.chipName}>Отсек {s.number}</span>
                  <span className={`${styles.chip} ${styles[`chip_${kind}`]}`}>
                    {STATUS_LABEL[result.status]}
                  </span>
                  <span className={styles.chipResidual}>
                    {residualMetres(result, ppm)}
                  </span>
                  {result.warning && (
                    <div className={styles.chipWarning}>{result.warning}</div>
                  )}
                </div>
              );
            })}
            {boundSections.length === 0 && (
              <div className={styles.emptyHint}>Нет отсеков с планами</div>
            )}
          </div>
        </aside>
      </div>

      <footer className={wizardStyles.footer}>
        <button className={wizardStyles.btnBack} onClick={onBack} type="button">
          ← Назад
        </button>
        <span className={wizardStyles.footerHint}>
          {solveResult ? `${okCount} отсек(ов) готово к сборке` : ''}
        </span>
        <button
          className={wizardStyles.btnNext}
          onClick={onNext}
          type="button"
          disabled={okCount === 0}
        >
          Далее ▸
        </button>
      </footer>
    </div>
  );
};
