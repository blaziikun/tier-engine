// src/export/picture.ts  (tier-engine/export): one picture, drawn for an export
// ─────────────────────────────────────────────────────────────────────────────
//  An item's picture on a canvas the tile's shape, whole or filling it, cropped
//  like on the board. Small pixel art is scaled without smoothing, so it stays crisp.
// ─────────────────────────────────────────────────────────────────────────────

import { cropView, fitPicture } from '../core/tile-box';
import type { ExportLayout } from './layout';
import type { ExportPicture } from './types';

function loadImage(url: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.decoding = 'async';
        if (/^https?:/.test(url)) img.crossOrigin = 'anonymous';
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = url;
    });
}

let pictureCanvas: HTMLCanvasElement | null = null;

/** A picture's pixel size at the chosen detail: `detail` pixels along the tile's longer side. */
export function detailedSize(layout: Pick<ExportLayout, 'tileWidth' | 'tileHeight'>, detail: number): { width: number; height: number } {
    const scale = detail / Math.max(layout.tileWidth, layout.tileHeight);
    return { width: Math.max(1, Math.round(layout.tileWidth * scale)), height: Math.max(1, Math.round(layout.tileHeight * scale)) };
}

/**
 * The picture drawn on a `width` × `height` canvas (the tile's shape). Rejects if it can't be
 * loaded. The canvas is reused: draw it somewhere before the next call.
 */
export async function drawPicture(
    picture: ExportPicture,
    { width, height }: { width: number; height: number },
): Promise<HTMLCanvasElement> {
    const img = await loadImage(picture.src);
    const source = picture.crop
        ? cropView(picture.crop, width / height, picture.fit)
        : { x: 0, y: 0, width: img.naturalWidth || width, height: img.naturalHeight || height };
    pictureCanvas ??= document.createElement('canvas');
    pictureCanvas.width = width;
    pictureCanvas.height = height;
    const g = pictureCanvas.getContext('2d')!;
    g.clearRect(0, 0, width, height);
    const placed = fitPicture(source, { width, height }, picture.fit);
    g.imageSmoothingEnabled = !placed.crisp;
    if (!placed.crisp) g.imageSmoothingQuality = 'high';
    g.drawImage(img, source.x, source.y, source.width, source.height, placed.x, placed.y, placed.width, placed.height);
    return pictureCanvas;
}
