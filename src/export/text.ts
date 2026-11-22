// src/export/text.ts  (tier-engine/export): measuring text
// ─────────────────────────────────────────────────────────────────────────────
//  The export's fonts, as canvas font strings from the look, and text measured
//  to fit: wrapped into lines, cut short with "…", or a tier label at the
//  largest size that fits its box.
// ─────────────────────────────────────────────────────────────────────────────

import type { ExportLook } from './types';

let measuring: CanvasRenderingContext2D | null = null;
/** A canvas used only to measure text (made the first time it's needed, so importing draws nothing). */
export function measureContext(): CanvasRenderingContext2D {
    measuring ??= document.createElement('canvas').getContext('2d')!;
    return measuring;
}

/** The look's three fonts at a size, as canvas and CSS font strings. */
export interface ExportFonts {
    /** Tier labels. */
    head(size: number): string;
    /** The title and the unranked heading. */
    title(size: number): string;
    /** Captions, notes and the credit line. */
    ui(size: number): string;
}

export const exportFonts = (look: ExportLook): ExportFonts => ({
    head: (size) => `${look.labelWeight} ${size}px ${look.headFamily}`,
    title: (size) => `${look.titleWeight} ${size}px ${look.headFamily}`,
    ui: (size) => `${look.uiWeight} ${size}px ${look.uiFamily}`,
});

/** Waits until the look's fonts have loaded, so measuring and drawing use them. */
export async function fontsReady(look: ExportLook): Promise<void> {
    const fonts = exportFonts(look);
    try {
        await Promise.all([document.fonts.load(fonts.head(32)), document.fonts.load(fonts.title(32)), document.fonts.load(fonts.ui(12))]);
        await document.fonts.ready;
    } catch {}
}

/** Wraps text into lines no wider than `width` (words longer than a line are broken). */
export function wrapText(text: string, width: number, font: string): string[] {
    const measure = measureContext();
    measure.font = font;
    const fits = (line: string) => measure.measureText(line).width <= width;
    const lines: string[] = [];
    let line = '';
    const breakLongWord = (word: string): string => {
        let part = '';
        for (const char of word) {
            if (!fits(part + char) && part) {
                lines.push(part);
                part = char;
            } else part += char;
        }
        return part;
    };
    for (const word of String(text).split(/\s+/).filter(Boolean)) {
        const longer = line ? line + ' ' + word : word;
        if (fits(longer)) line = longer;
        else {
            if (line) lines.push(line);
            line = fits(word) ? word : breakLongWord(word);
        }
    }
    if (line) lines.push(line);
    return lines.length ? lines : [''];
}

/** Shortens text with "…" until it fits. */
export function ellipsize(text: string, width: number, font: string): string {
    const measure = measureContext();
    measure.font = font;
    if (measure.measureText(text).width <= width) return text;
    let short = text;
    while (short.length > 1 && measure.measureText(short + '…').width > width) short = short.slice(0, -1);
    return short + '…';
}

export interface FittedLabel {
    fontSize: number;
    lines: string[];
    lineHeight: number;
}

/** The largest font size (up to a tenth past the look's label size) at which a tier label fits its box. */
export function fitLabel(text: string, width: number, height: number, look: ExportLook): FittedLabel {
    const measure = measureContext();
    const head = exportFonts(look).head;
    const spacing = (size: number) => {
        if ('letterSpacing' in measure) measure.letterSpacing = look.letterSpacing * size + 'px';
    };
    try {
        for (let size = Math.round(look.labelSize * 1.1); size >= 7; size--) {
            spacing(size);
            const lines = wrapText(text, width, head(size));
            if (lines.length * size * 1.15 <= height) return { fontSize: size, lines, lineHeight: size * 1.15 };
        }
        return { fontSize: 7, lines: wrapText(text, width, head(7)), lineHeight: 8 };
    } finally {
        if ('letterSpacing' in measure) measure.letterSpacing = '0px';
    }
}
