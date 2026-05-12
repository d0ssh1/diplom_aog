import React, { useRef, useEffect, useCallback, useState } from 'react';
import styles from './WizardStep.module.css';
import overviewStyles from './FloorOverview.module.css';
import { CanvasControls } from './CanvasControls';
import { SectionContextMenu } from './SectionContextMenu';
import { NewSectionDialog } from './NewSectionDialog';
import { getSectionColor } from './sectionColors';
import type { SectionDraft, Point2D } from '../../hooks/useFloorEditorWizard';

interface ContextMenuState {
  x: number;
  y: number;
  sectionIdx: number;
}

interface FloorOverviewProps {
  schemaImageUrl: string | null;
  wallPolygons: Point2D[][] | null;
  sectionDrafts: SectionDraft[];
  isDirty: boolean;
  isLoading: boolean;
  onUpdateSectionDraft: (idx: number, partial: Partial<SectionDraft>) => void;
  onDeleteSectionDraft: (idx: number) => void;
  onSave: () => Promise<void>;
  onSwitchToTable: () => void;
  onSwitchToWizard: () => void;
}

export const FloorOverview: React.FC<FloorOverviewProps> = ({
  schemaImageUrl,
  wallPolygons,
  sectionDrafts,
  isDirty,
  isLoading,
  onUpdateSectionDraft,
  onDeleteSectionDraft,
  onSave,
  onSwitchToTable,
  onSwitchToWizard,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);

  const [zoom, setZoom] = useState(1);
  const [activeIdx, setActiveIdx] = useState<number | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [renameTargetIdx, setRenameTargetIdx] = useState<number | null>(null);
  // Increment this to force re-render when localStorage colors change
  const [colorVersion, setColorVersion] = useState(0);

  const draftsRef = useRef(sectionDrafts);
  useEffect(() => { draftsRef.current = sectionDrafts; }, [sectionDrafts]);

  const getCanvasSize = useCallback(() => {
    const c = containerRef.current;
    return c ? { w: c.clientWidth, h: c.clientHeight } : { w: 800, h: 600 };
  }, []);

  const getImageParams = useCallback((imgW: number, imgH: number, cw: number, ch: number) => {
    const scale = Math.min((cw * zoom) / imgW, (ch * zoom) / imgH);
    const dw = imgW * scale;
    const dh = imgH * scale;
    const dx = (cw - dw) / 2;
    const dy = (ch - dh) / 2;
    return { dx, dy, dw, dh };
  }, [zoom]);

  const toCanvas = useCallback((nx: number, ny: number) => {
    const img = imageRef.current;
    const { w: cw, h: ch } = getCanvasSize();
    if (!img) {
      return { cx: nx * cw, cy: ny * ch };
    }
    const { dx, dy, dw, dh } = getImageParams(img.naturalWidth, img.naturalHeight, cw, ch);
    return { cx: dx + nx * dw, cy: dy + ny * dh };
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
    // Light background
    ctx.fillStyle = '#f9fafb';
    ctx.fillRect(0, 0, cw, ch);

    // Background image
    const img = imageRef.current;
    if (img) {
      const { dx, dy, dw, dh } = getImageParams(img.naturalWidth, img.naturalHeight, cw, ch);
      ctx.globalAlpha = 0.2;
      ctx.drawImage(img, dx, dy, dw, dh);
      ctx.globalAlpha = 1;
    }

    // Wall polygons — dark on light background
    ctx.strokeStyle = '#374151';
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

    // Sections — each has its palette color
    for (let idx = 0; idx < draftsRef.current.length; idx++) {
      const draft = draftsRef.current[idx];
      const pts = draft.geometry.points;
      const isActive = idx === activeIdx;
      const color = getSectionColor(idx, draft.id);

      if (isActive) {
        ctx.fillStyle = `${color}66`; // ~40% opacity for active
        ctx.strokeStyle = color;
        ctx.lineWidth = 2.5;
      } else {
        ctx.fillStyle = `${color}33`; // ~20% opacity for inactive
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
      }

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

      // Centered number label
      const cx = (pts[0][0] + pts[1][0] + pts[2][0] + pts[3][0]) / 4;
      const cy = (pts[0][1] + pts[1][1] + pts[2][1] + pts[3][1]) / 4;
      const center = toCanvas(cx, cy);
      ctx.fillStyle = color;
      ctx.font = `${isActive ? 'bold ' : ''}13px Courier New`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowColor = 'rgba(255,255,255,0.9)';
      ctx.shadowBlur = 4;
      ctx.fillText(String(draft.number), center.cx, center.cy);
      ctx.shadowBlur = 0;
    }
  }, [getCanvasSize, getImageParams, toCanvas, wallPolygons, activeIdx, colorVersion]); // colorVersion forces redraw

  useEffect(() => { draw(); }, [draw, sectionDrafts, activeIdx]);

  useEffect(() => {
    if (schemaImageUrl) {
      const img = new Image();
      img.src = schemaImageUrl;
      img.onload = () => { imageRef.current = img; draw(); };
    }
    return () => { imageRef.current = null; };
  }, [schemaImageUrl, draw]);

  // Hit test: find section under canvas coordinates
  const hitSection = useCallback((canvX: number, canvY: number): number | null => {
    for (let idx = 0; idx < draftsRef.current.length; idx++) {
      const pts = draftsRef.current[idx].geometry.points;
      const xs = pts.map((p) => toCanvas(p[0], p[1]).cx);
      const ys = pts.map((p) => toCanvas(p[0], p[1]).cy);
      const minX = Math.min(...xs);
      const maxX = Math.max(...xs);
      const minY = Math.min(...ys);
      const maxY = Math.max(...ys);
      if (canvX >= minX && canvX <= maxX && canvY >= minY && canvY <= maxY) {
        return idx;
      }
    }
    return null;
  }, [toCanvas]);

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    const hit = hitSection(cx, cy);
    setActiveIdx(hit);
    setContextMenu(null);
  };

  const handleCanvasContextMenu = (e: React.MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const rect = canvasRef.current!.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    const hit = hitSection(cx, cy);
    if (hit !== null) {
      setActiveIdx(hit);
      setContextMenu({ x: e.clientX, y: e.clientY, sectionIdx: hit });
    }
  };

  const handleRename = () => {
    if (contextMenu !== null) {
      setRenameTargetIdx(contextMenu.sectionIdx);
      setRenameDialogOpen(true);
    }
    setContextMenu(null);
  };

  const handleDelete = () => {
    if (contextMenu !== null) {
      const idx = contextMenu.sectionIdx;
      const section = sectionDrafts[idx];
      if (window.confirm(`Удалить отсек №${section.number}? Действие нельзя отменить без перезагрузки`)) {
        onDeleteSectionDraft(idx);
        setActiveIdx(null);
      }
    }
    setContextMenu(null);
  };

  const handleRenameConfirm = (num: number, _description: string, _color: string) => {
    if (renameTargetIdx !== null) {
      onUpdateSectionDraft(renameTargetIdx, { number: num });
    }
    setRenameDialogOpen(false);
    setRenameTargetIdx(null);
  };

  const boundCount = sectionDrafts.filter((d) => d.reconstruction_id !== null).length;
  const takenNumbers = sectionDrafts
    .filter((_, i) => i !== renameTargetIdx)
    .map((d) => d.number);

  return (
    <div className={styles.layout}>
      {/* Top bar: title + view toggle */}
      <div className={overviewStyles.topBar}>
        <span className={overviewStyles.topBarTitle}>Итоговая схема этажа</span>
        <div className={overviewStyles.viewToggles}>
          <button
            className={`${overviewStyles.viewToggle} ${overviewStyles.viewToggleActive}`}
            type="button"
            disabled
            aria-current="true"
          >
            ▦ Схема
          </button>
          <button
            className={overviewStyles.viewToggle}
            onClick={onSwitchToTable}
            type="button"
          >
            ☰ Таблица
          </button>
        </div>
      </div>

      <div className={styles.body}>
        {/* Left: colored section list */}
        <aside className={styles.sidebar}>
          <div className={styles.sidebarTitle}>Отсеки на схеме</div>
          <div className={styles.sectionList}>
            {sectionDrafts.map((d, idx) => {
              const color = getSectionColor(idx, d.id);
              return (
                <button
                  key={idx}
                  className={`${styles.sectionItem} ${idx === activeIdx ? styles.sectionItemActive : ''}`}
                  onClick={() => setActiveIdx(idx)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setActiveIdx(idx);
                    const rect = (e.target as HTMLElement).getBoundingClientRect();
                    setContextMenu({ x: rect.right, y: rect.top, sectionIdx: idx });
                  }}
                  type="button"
                >
                  <span
                    className={styles.sectionDot}
                    style={{
                      background: color,
                      borderRadius: '2px',
                    }}
                  />
                  {idx === activeIdx ? (
                    <span style={{ flex: 1 }}>Отсек {d.number}</span>
                  ) : (
                    <span style={{ flex: 1 }}>Отсек {d.number}</span>
                  )}
                  {d.reconstruction_id !== null && (
                    <span style={{ fontSize: '0.625rem', color: idx === activeIdx ? '#fff' : '#22c55e' }}>✓</span>
                  )}
                </button>
              );
            })}
          </div>
        </aside>

        {/* Canvas — light background */}
        <div className={styles.canvasArea} ref={containerRef}>
          <canvas
            ref={canvasRef}
            className={styles.canvas}
            onClick={handleCanvasClick}
            onContextMenu={handleCanvasContextMenu}
            style={{ cursor: 'pointer' }}
          />
          <CanvasControls
            onZoomIn={() => setZoom((z) => Math.min(z + 0.25, 4))}
            onZoomOut={() => setZoom((z) => Math.max(z - 0.25, 0.25))}
            onReset={() => setZoom(1)}
          />
          {isLoading && (
            <div className={styles.spinnerOverlay}>
              <div className={styles.spinner} />
              <span className={styles.spinnerText}>Сохранение...</span>
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <footer className={styles.footer}>
        <button className={styles.btnBack} onClick={onSwitchToWizard} type="button">
          ← Назад
        </button>
        <div className={styles.statsRow}>
          <span className={styles.statItem}>
            Всего отсеков: <strong className={styles.statValue}>{sectionDrafts.length}</strong>
          </span>
          <span className={styles.statItem}>
            Привязано: <strong className={styles.statValue}>{boundCount}</strong>
          </span>
        </div>
        <button
          className={styles.btnSave}
          onClick={() => void onSave()}
          disabled={isLoading || !isDirty}
          type="button"
        >
          Сохранить изменения
        </button>
      </footer>

      {/* Context menu */}
      {contextMenu && (
        <SectionContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          sectionNumber={sectionDrafts[contextMenu.sectionIdx]?.number ?? 0}
          sectionId={sectionDrafts[contextMenu.sectionIdx]?.id}
          sectionIdx={contextMenu.sectionIdx}
          onRename={handleRename}
          onDelete={handleDelete}
          onColorChange={() => setColorVersion((v) => v + 1)}
          onClose={() => setContextMenu(null)}
        />
      )}

      {/* Rename dialog */}
      <NewSectionDialog
        open={renameDialogOpen}
        initialNumber={renameTargetIdx !== null ? sectionDrafts[renameTargetIdx]?.number ?? null : null}
        takenNumbers={takenNumbers}
        onConfirm={handleRenameConfirm}
        onCancel={() => { setRenameDialogOpen(false); setRenameTargetIdx(null); }}
      />
    </div>
  );
};
