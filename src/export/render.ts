// src/export/render.ts  (tier-engine/export): SVG and PNG
// ─────────────────────────────────────────────────────────────────────────────
//  Draws a layout (layout.ts) as an SVG file or a PNG picture, picture by
//  picture, with progress and a way to stop. Text from the list is escaped in
//  the SVG; nothing from it ever becomes markup.
// ─────────────────────────────────────────────────────────────────────────────

import type { ItemId } from '../core/types';
import { escapeHtml } from '../safe';
import { type ExportLayout, type ExportRow, type ExportText, itemPosition, placeLabel, unrankedHeadingText } from './layout';
import { detailedSize, drawPicture } from './picture';
import { ellipsize, exportFonts } from './text';
import type { ExportInput, ExportRun, SvgRun } from './types';

const nextTick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

/**
 * Goes through the layout, row by row and picture by picture, reporting progress (out of
 * `progressShare` percent) and stopping when the run is cancelled. False if it was. The SVG and
 * PNG renders use it; an app drawing its own format (a PDF) can too.
 */
export async function walkLayout(
    layout: ExportLayout,
    run: Pick<ExportRun, 'progress' | 'cancelled'>,
    drawRow: (row: ExportRow) => void,
    drawItem: (id: ItemId, position: { x: number; y: number }) => Promise<void>,
    progressShare: number,
): Promise<boolean> {
    const total = layout.rows.reduce((count, row) => count + row.tier.items.length, 0);
    let done = 0;
    for (const row of layout.rows) {
        drawRow(row);
        for (const [index, id] of row.tier.items.entries()) {
            if (run.cancelled?.()) return false;
            await drawItem(id, itemPosition(layout, row, index));
            if (++done % 10 === 0) {
                run.progress?.(done, total, (done / total) * progressShare);
                await nextTick();
            }
        }
    }
    return true;
}

// ═════════════════════════════════════════════════════════════════════════════
//  SVG
// ═════════════════════════════════════════════════════════════════════════════

/** The layout as an SVG file (fonts imported, pictures embedded), or null if the run was cancelled. */
export async function renderSvg(layout: ExportLayout, input: ExportInput, run: SvgRun): Promise<Blob | null> {
    const look = input.look;
    const { width, tileWidth, tileHeight } = layout;
    const fullHeight = layout.height;
    const headFamily = escapeHtml(look.headFamily).replace(/'/g, '');
    const uiFamily = escapeHtml(look.uiFamily).replace(/'/g, '');
    const fontImports = (run.fontImports ?? []).map((url) => `@import url('${url.replace(/&/g, '&amp;')}');`).join('');
    const parts: string[] = [
        `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${width}" height="${fullHeight}" viewBox="0 0 ${width} ${fullHeight}">`,
        `<title>${escapeHtml(run.documentTitle)}</title><defs><style>${fontImports}</style></defs><rect width="${width}" height="${fullHeight}" fill="${look.background}"/>`,
    ];
    const captionFont = exportFonts(look).ui(layout.captionSize);
    let rowNumber = 0;
    const text = (placed: ExportText, family: string, weight: number, color: string) =>
        placed.lines
            .map(
                (line, i) =>
                    `<text x="${placed.x}" y="${(placed.top + i * placed.lineHeight).toFixed(1)}"${placed.alignRight ? ' text-anchor="end"' : ''} dominant-baseline="central" font-family="${family}" font-weight="${weight}" font-size="${placed.fontSize}" fill="${color}">${escapeHtml(line)}</text>`,
            )
            .join('');
    if (layout.title) parts.push(text(layout.title, headFamily, look.titleWeight, look.text));

    const drawRow = (row: ExportRow) => {
        const box = `x="${row.x}" y="${row.y}" width="${row.width}" height="${row.height}"`;
        if (row.unranked) {
            parts.push(`<rect ${box} rx="${layout.radius}" fill="${look.panel}"/>`);
            parts.push(text(unrankedHeadingText(row, layout, look), headFamily, look.titleWeight, look.muted));
            return;
        }
        const tier = row.tier;
        const textColor = look.labelTextColor(tier);
        rowNumber++;
        const labelBox = `x="${row.label.x}" y="${row.label.y}" width="${row.label.width}" height="${row.label.height}"`;
        parts.push(
            `<clipPath id="r${rowNumber}"><rect ${box} rx="${layout.radius}"/></clipPath>` +
                `<g clip-path="url(#r${rowNumber})"><rect ${box} fill="${look.rowBackground(tier.color)}"/><rect ${labelBox} fill="${tier.color}"/></g>`,
        );
        const label = placeLabel(row, look);
        const centreX = row.label.x + row.label.width / 2;
        const lines = label.lines
            .map((line, i) => `<tspan x="${centreX}" y="${(label.top + i * label.lineHeight).toFixed(1)}">${escapeHtml(line)}</tspan>`)
            .join('');
        parts.push(
            `<text text-anchor="middle" dominant-baseline="central" font-family="${headFamily}" font-weight="${look.labelWeight}" letter-spacing="${look.letterSpacing}em" font-size="${label.fontSize}" fill="${textColor}">${lines}</text>`,
        );
        if (tier.subtitle) {
            const subtitleY = (label.top + label.lines.length * label.lineHeight - label.lineHeight / 2 + 9).toFixed(1);
            parts.push(
                `<text x="${centreX}" y="${subtitleY}" text-anchor="middle" dominant-baseline="central" font-family="${uiFamily}" font-weight="${look.uiWeight}" font-size="9" fill="${textColor}" opacity=".8">${escapeHtml(tier.subtitle)}</text>`,
            );
        }
    };

    const size = detailedSize(layout, run.detail);
    const drawItem = async (id: ItemId, { x, y }: { x: number; y: number }) => {
        const picture = run.picture(id);
        let address: string;
        try {
            // vector pictures stay vector; everything else is drawn at the chosen detail
            address = (await run.vector?.(id)) ?? (await drawPicture(picture, size)).toDataURL('image/png');
        } catch {
            address = run.fallback?.(id) ?? '';
        }
        const caption =
            layout.captionHeight && input.caption
                ? `<text x="${x + tileWidth / 2}" y="${(y + tileHeight + layout.captionGap + layout.captionSize * 0.9).toFixed(1)}" text-anchor="middle" font-family="${uiFamily}" font-weight="${look.uiWeight}" font-size="${layout.captionSize}" fill="${look.muted}">${escapeHtml(ellipsize(input.caption(id), tileWidth + 2, captionFont))}</text>`
                : '';
        // a drawn picture already has the tile's shape; a vector one is fitted (or filled, and cut off at the tile) here
        const aspect = picture.fit === 'cover' ? 'slice' : 'meet';
        parts.push(
            `<g><title>${escapeHtml(run.describe(id))}</title><image x="${x}" y="${y}" width="${tileWidth}" height="${tileHeight}" preserveAspectRatio="xMidYMid ${aspect}" xlink:href="${escapeHtml(address)}"/>${caption}</g>`,
        );
    };

    if (!(await walkLayout(layout, run, drawRow, drawItem, 100))) return null;
    if (layout.notes.height) {
        const top = layout.notes.top;
        parts.push(
            `<text x="14" y="${top + 20}" font-family="${uiFamily}" font-weight="700" font-size="12" fill="${look.text}">Notes</text>`,
        );
        layout.notes.lines.forEach((line, i) => {
            parts.push(
                `<text x="${line.first ? 14 : 24}" y="${top + 38 + i * 15}" font-family="${uiFamily}" font-weight="${look.uiWeight}" font-size="11" fill="${look.muted}">${escapeHtml(line.text)}</text>`,
            );
        });
    }
    if (layout.credit) parts.push(text(layout.credit, uiFamily, look.uiWeight, look.muted));
    parts.push('</svg>');
    return new Blob(parts, { type: 'image/svg+xml' });
}

// ═════════════════════════════════════════════════════════════════════════════
//  PNG
// ═════════════════════════════════════════════════════════════════════════════

/** What a PNG render gives: the picture, or why there isn't one. */
export type PngResult = { png: Blob } | { failed: 'cancelled' | 'too big' };

/**
 * The layout as a PNG, as detailed as `run.detail` asks and the browser allows (phones have
 * smaller canvas limits). A picture that won't load is drawn as the item's name.
 */
export async function renderPng(layout: ExportLayout, input: ExportInput, run: ExportRun): Promise<PngResult> {
    const look = input.look;
    const fonts = exportFonts(look);
    const { tileWidth, tileHeight } = layout;
    const fullHeight = layout.height;
    const isIos = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const maxPixels = isIos ? 1.6e7 : 6e7;
    const scale = Math.max(
        1,
        Math.min(
            run.detail / Math.max(tileWidth, tileHeight),
            12000 / Math.max(layout.width, fullHeight),
            Math.sqrt(maxPixels / (layout.width * fullHeight)),
        ),
    );
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(layout.width * scale);
    canvas.height = Math.round(fullHeight * scale);
    const g = canvas.getContext('2d')!;
    g.scale(scale, scale);
    g.fillStyle = look.background;
    g.fillRect(0, 0, layout.width, fullHeight);
    const write = (placed: ExportText, color: string) => {
        g.font = placed.font;
        g.fillStyle = color;
        g.textAlign = placed.alignRight ? 'right' : 'left';
        g.textBaseline = 'middle';
        placed.lines.forEach((line, i) => {
            g.fillText(line, placed.x, placed.top + i * placed.lineHeight);
        });
    };
    if (layout.title) write(layout.title, look.text);

    const drawRow = (row: ExportRow) => {
        const tier = row.tier;
        if (row.unranked) {
            g.fillStyle = look.panel;
            g.beginPath();
            g.roundRect(row.x, row.y, row.width, row.height, layout.radius);
            g.fill();
            write(unrankedHeadingText(row, layout, look), look.muted);
            return;
        }
        g.save();
        g.beginPath();
        g.roundRect(row.x, row.y, row.width, row.height, layout.radius);
        g.clip();
        g.fillStyle = look.rowBackground(tier.color);
        g.fillRect(row.x, row.y, row.width, row.height);
        g.fillStyle = tier.color;
        g.fillRect(row.label.x, row.label.y, row.label.width, row.label.height);
        g.restore();
        const label = placeLabel(row, look);
        const centreX = row.label.x + row.label.width / 2;
        g.font = fonts.head(label.fontSize);
        g.letterSpacing = look.letterSpacing * label.fontSize + 'px';
        g.fillStyle = look.labelTextColor(tier);
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        label.lines.forEach((line, i) => {
            g.fillText(line, centreX, label.top + i * label.lineHeight);
        });
        g.letterSpacing = '0px';
        if (tier.subtitle) {
            g.font = fonts.ui(9);
            g.globalAlpha = 0.8;
            g.fillText(tier.subtitle, centreX, label.top + label.lines.length * label.lineHeight - label.lineHeight / 2 + 9);
            g.globalAlpha = 1;
        }
    };

    const pictureSize = detailedSize(layout, Math.min(1024, Math.round(Math.max(tileWidth, tileHeight) * scale)));
    const drawItem = async (id: ItemId, { x, y }: { x: number; y: number }) => {
        try {
            g.drawImage(await drawPicture(run.picture(id), pictureSize), x, y, tileWidth, tileHeight);
        } catch {
            // no picture: its name instead
            const font = fonts.ui(Math.max(7, Math.round(Math.min(tileWidth, tileHeight) / 7)));
            g.font = font;
            g.fillStyle = look.muted;
            g.textAlign = 'center';
            g.textBaseline = 'middle';
            g.fillText(ellipsize(input.name(id), tileWidth - 4, font), x + tileWidth / 2, y + tileHeight / 2);
        }
        if (layout.captionHeight && input.caption) {
            const font = fonts.ui(layout.captionSize);
            g.font = font;
            g.fillStyle = look.muted;
            g.textAlign = 'center';
            g.textBaseline = 'alphabetic';
            g.fillText(
                ellipsize(input.caption(id), tileWidth + 2, font),
                x + tileWidth / 2,
                y + tileHeight + layout.captionGap + layout.captionSize * 0.9,
            );
        }
    };

    if (!(await walkLayout(layout, run, drawRow, drawItem, 95))) return { failed: 'cancelled' };
    if (layout.notes.height) {
        const top = layout.notes.top;
        g.textAlign = 'left';
        g.textBaseline = 'alphabetic';
        g.fillStyle = look.text;
        g.font = `700 12px ${look.uiFamily}`;
        g.fillText('Notes', 14, top + 20);
        g.fillStyle = look.muted;
        g.font = fonts.ui(11);
        layout.notes.lines.forEach((line, i) => {
            g.fillText(line.text, line.first ? 14 : 24, top + 38 + i * 15);
        });
    }
    if (layout.credit) write(layout.credit, look.muted);
    let png: Blob | null = null;
    try {
        png = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    } catch {}
    return png ? { png } : { failed: 'too big' };
}
