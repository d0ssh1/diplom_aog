/**
 * Helpers for rendering the CROPPED + ROTATED portion of the floor schema photo.
 *
 * Backend stores wall_polygons normalised to [0,1] WITHIN the cropped+rotated
 * region (see floor_schema_service.py extract_walls), so the frontend must draw
 * that same region to keep coordinates aligned.
 */

import type { CropBbox } from '../../types/hierarchy';

/**
 * Bake a cropped + rotated image into an offscreen canvas.
 * Returns null if inputs are missing or invalid.
 */
export function bakeCroppedRotated(
  img: HTMLImageElement,
  crop: CropBbox | null,
): HTMLCanvasElement | null {
  if (!img.complete || img.naturalWidth === 0) return null;

  // No crop yet: return the original image as-is (wrapped in a canvas)
  if (!crop) {
    const off = document.createElement('canvas');
    off.width = img.naturalWidth;
    off.height = img.naturalHeight;
    off.getContext('2d')!.drawImage(img, 0, 0);
    return off;
  }

  const { x, y, width, height, rotation } = crop;
  if (width <= 0 || height <= 0) return null;

  const rotated = rotation === 90 || rotation === 270;
  const off = document.createElement('canvas');
  off.width = Math.max(1, Math.round(rotated ? height : width));
  off.height = Math.max(1, Math.round(rotated ? width : height));

  // Defensive: bail out if the resulting canvas has no real area.
  if (off.width < 2 || off.height < 2) return null;

  const ctx = off.getContext('2d');
  if (!ctx) return null;

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.save();
  ctx.translate(off.width / 2, off.height / 2);
  ctx.rotate((rotation * Math.PI) / 180);
  ctx.drawImage(
    img,
    x, y, width, height,        // source rect within original image
    -width / 2, -height / 2,    // destination centered at origin
    width, height,
  );
  ctx.restore();
  return off;
}

/**
 * Fit a (w × h) image into a (cw × ch) container, preserving aspect ratio.
 * Returns the destination rect inside the container.
 */
export function fitContain(
  w: number,
  h: number,
  cw: number,
  ch: number,
  zoom = 1,
): { dx: number; dy: number; dw: number; dh: number } {
  const scale = Math.min(cw / w, ch / h) * zoom;
  const dw = w * scale;
  const dh = h * scale;
  const dx = (cw - dw) / 2;
  const dy = (ch - dh) / 2;
  return { dx, dy, dw, dh };
}
