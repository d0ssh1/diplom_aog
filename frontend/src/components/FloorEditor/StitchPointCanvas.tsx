// Floor-stitch control-point canvas (Step 6). Distinct from the plan-wizard
// ControlPointCanvas: here the operator marks NUMBERED correspondence points on
// two backdrops —
//   • эталон  : the section's cropped wall mask (raster), drawn opaque;
//   • карта отсеков : the floor's VECTOR wall_polygons drawn over the cropped
//                     schema raster shown faintly (transparency tool).
// Markers are orange discs with the point number inside; the active number is
// emphasised on BOTH canvases so a pair is never confused.
//
// All coordinate maths are reused from ../controlPointCanvasCore (pure, tested).
// The component is presentational: clicks become onSelect (hit a marker) or
// onPlace (miss). The host decides what a click means for the current tool.
// devicePixelRatio-aware so discs/lines stay crisp on HiDPI.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  R_HIT_PX,
  R_SNAP_PX,
  displayRadiusToNorm,
  hitTest,
  nearestWithin,
  toDisplayCoords,
  toImageCoords,
  type CanvasLayout,
} from '../controlPointCanvasCore';
import { bakeCroppedRotated } from './croppedImage';
import { pointLabel } from '../../lib/controlPoints';
import type { CropBbox } from '../../types/hierarchy';
import styles from './StitchPointCanvas.module.css';

export interface StitchPoint {
  id: string;
  x: number;
  y: number;
}

export interface StitchPointCanvasProps {
  /** Raster backdrop drawn OPAQUE (the section эталон mask). Mutually exclusive
   *  with underlayUrl — provide whichever this canvas represents. */
  maskUrl?: string | null;
  /** Raster baked through `crop` and drawn FAINTLY beneath the vector (master). */
  underlayUrl?: string | null;
  crop?: CropBbox | null;
  /** Underlay opacity 0..1 (the transparency tool). Default 0.2. */
  underlayOpacity?: number;
  /** Vector wall polygons (normalised [0,1] over this canvas's frame). */
  polygons?: [number, number][][] | null;
  /** Intrinsic size to fall back to when no raster decodes (e.g. vector-only). */
  fallbackSize?: [number, number] | null;

  points: StitchPoint[];
  activeId: string | null;
  /** Wall vertices (normalised) a freshly-placed point snaps to within R_SNAP. */
  snapTargets?: [number, number][];
  /** Only changes the cursor; click semantics stay generic (host interprets). */
  tool?: 'place' | 'delete';

  /** Miss-click. `id` is the active id (MOVE) or '' when none is active (ADD). */
  onPlace(id: string, x: number, y: number): void;
  /** Click within R_HIT of an existing marker. */
  onSelect(id: string): void;
}

const VECTOR_WALL = '#2563EB';
const MARKER_FILL = '#F05123';
const MARKER_RING = '#ffffff';
const R_MARKER_PX = 11;
const R_MARKER_ACTIVE_PX = 13;

const computeLayout = (
  elementWidth: number,
  elementHeight: number,
  imageWidth: number,
  imageHeight: number,
): CanvasLayout => {
  if (imageWidth <= 0 || imageHeight <= 0 || elementWidth <= 0 || elementHeight <= 0) {
    return { offsetX: 0, offsetY: 0, drawWidth: 0, drawHeight: 0 };
  }
  const scale = Math.min(elementWidth / imageWidth, elementHeight / imageHeight);
  const drawWidth = imageWidth * scale;
  const drawHeight = imageHeight * scale;
  return {
    offsetX: (elementWidth - drawWidth) / 2,
    offsetY: (elementHeight - drawHeight) / 2,
    drawWidth,
    drawHeight,
  };
};

export const StitchPointCanvas: React.FC<StitchPointCanvasProps> = ({
  maskUrl,
  underlayUrl,
  crop,
  underlayOpacity = 0.2,
  polygons,
  fallbackSize,
  points,
  activeId,
  snapTargets,
  tool = 'place',
  onPlace,
  onSelect,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // The decoded backdrop to paint: an opaque mask image OR a faint baked-crop canvas.
  const opaqueImgRef = useRef<HTMLImageElement | null>(null);
  const underlayCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const [imageSize, setImageSize] = useState<{ w: number; h: number } | null>(null);
  const [elementSize, setElementSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });

  // Load whichever raster backdrop this canvas uses. Re-baked when crop changes.
  useEffect(() => {
    let cancelled = false;
    opaqueImgRef.current = null;
    underlayCanvasRef.current = null;

    const url = maskUrl ?? underlayUrl ?? null;
    if (!url) {
      setImageSize(fallbackSize ? { w: fallbackSize[0], h: fallbackSize[1] } : null);
      return;
    }

    const img = new Image();
    img.onload = () => {
      if (cancelled) return;
      if (maskUrl) {
        opaqueImgRef.current = img;
        setImageSize({ w: img.naturalWidth, h: img.naturalHeight });
        return;
      }
      // Master underlay: bake the cropped+rotated region; that also fixes the frame
      // the vector polygons + master points are normalised over.
      const baked = bakeCroppedRotated(img, crop ?? null);
      if (baked && baked.width >= 2 && baked.height >= 2) {
        underlayCanvasRef.current = baked;
        setImageSize({ w: baked.width, h: baked.height });
      } else {
        setImageSize(fallbackSize ? { w: fallbackSize[0], h: fallbackSize[1] } : null);
      }
    };
    img.onerror = () => {
      if (cancelled) return;
      setImageSize(fallbackSize ? { w: fallbackSize[0], h: fallbackSize[1] } : null);
    };
    img.src = url;
    return () => {
      cancelled = true;
    };
  }, [maskUrl, underlayUrl, crop, fallbackSize]);

  // Track the rendered element size (CSS px).
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => {
      const rect = el.getBoundingClientRect();
      setElementSize({ w: rect.width, h: rect.height });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const layout: CanvasLayout = imageSize
    ? computeLayout(elementSize.w, elementSize.h, imageSize.w, imageSize.h)
    : { offsetX: 0, offsetY: 0, drawWidth: 0, drawHeight: 0 };

  // Draw: backdrop → vector walls → numbered markers (DPR-aware).
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const cssW = elementSize.w;
    const cssH = elementSize.h;
    if (cssW <= 0 || cssH <= 0) return;

    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);

    if (layout.drawWidth > 0) {
      // 1) Backdrop.
      if (opaqueImgRef.current) {
        ctx.globalAlpha = 1;
        ctx.drawImage(
          opaqueImgRef.current,
          layout.offsetX, layout.offsetY, layout.drawWidth, layout.drawHeight,
        );
      } else if (underlayCanvasRef.current) {
        ctx.globalAlpha = Math.max(0, Math.min(1, underlayOpacity));
        ctx.drawImage(
          underlayCanvasRef.current,
          layout.offsetX, layout.offsetY, layout.drawWidth, layout.drawHeight,
        );
        ctx.globalAlpha = 1;
      }

      // 2) Vector wall polygons (the карта отсеков itself).
      if (polygons && polygons.length > 0) {
        ctx.strokeStyle = VECTOR_WALL;
        ctx.lineWidth = 1.6;
        ctx.lineJoin = 'round';
        for (const poly of polygons) {
          if (poly.length < 2) continue;
          ctx.beginPath();
          poly.forEach(([nx, ny], i) => {
            const d = toDisplayCoords({ x: nx, y: ny }, layout);
            if (i === 0) ctx.moveTo(d.x, d.y);
            else ctx.lineTo(d.x, d.y);
          });
          ctx.closePath();
          ctx.stroke();
        }
      }
    }

    // 3) Numbered orange markers; active is larger with a white halo.
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const point of points) {
      const isActive = point.id === activeId;
      const r = isActive ? R_MARKER_ACTIVE_PX : R_MARKER_PX;
      const { x, y } = toDisplayCoords(point, layout);

      if (isActive) {
        ctx.beginPath();
        ctx.arc(x, y, r + 3, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(240, 81, 35, 0.25)';
        ctx.fill();
      }
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = MARKER_FILL;
      ctx.fill();
      ctx.lineWidth = isActive ? 3 : 2;
      ctx.strokeStyle = MARKER_RING;
      ctx.stroke();

      ctx.fillStyle = '#ffffff';
      ctx.font = `bold ${isActive ? 13 : 12}px system-ui, sans-serif`;
      ctx.fillText(pointLabel(point.id), x, y + 0.5);
    }
  }, [points, activeId, layout, polygons, underlayOpacity, elementSize.w, elementSize.h, imageSize]);

  const handleClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      const el = containerRef.current;
      if (!el || layout.drawWidth <= 0) return;
      const rect = el.getBoundingClientRect();
      const norm = toImageCoords(event.clientX - rect.left, event.clientY - rect.top, layout);
      if (!norm) return;

      // Select an existing marker first (so delete/select land on it).
      const hitRadiusNorm = displayRadiusToNorm(R_HIT_PX, layout.drawWidth);
      const hitId = hitTest(norm, points, hitRadiusNorm);
      if (hitId !== null) {
        onSelect(hitId);
        return;
      }

      // Miss: place. Snap to a wall vertex when one is within reach.
      let placed = norm;
      if (snapTargets && snapTargets.length > 0) {
        const snapRadiusNorm = displayRadiusToNorm(R_SNAP_PX, layout.drawWidth);
        const snapped = nearestWithin(norm, snapTargets, snapRadiusNorm);
        if (snapped) placed = { x: snapped[0], y: snapped[1] };
      }
      onPlace(activeId ?? '', placed.x, placed.y);
    },
    [layout, points, activeId, snapTargets, onPlace, onSelect],
  );

  return (
    <div
      ref={containerRef}
      className={`${styles.container} ${tool === 'delete' ? styles.deleting : ''}`}
      onClick={handleClick}
    >
      <canvas ref={canvasRef} className={styles.canvas} style={{ width: '100%', height: '100%' }} />
    </div>
  );
};
