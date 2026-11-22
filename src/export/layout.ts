// src/export/layout.ts  (tier-engine/export): where everything goes
// ─────────────────────────────────────────────────────────────────────────────
//  What every export format shares: where the title, each tier, its label and
//  pictures, the unranked items, the notes and the credit go (rows like the
//  board's, or a chart's grid of cells), with text measured to fit. SVG and PNG
//  are drawn from it in render.ts; an app can draw other formats (a PDF) from it too.
// ─────────────────────────────────────────────────────────────────────────────

import type { ItemId } from '../core/types';
import { CREDIT_HEIGHT, picturesAcross, stackPage, TITLE_PADDING, titleHeight, UNRANKED_HEADING_HEIGHT, unrankedHeight } from './bands';
import { type Box, layoutChartGrid, tilesAcrossCell } from './chart-grid';
import { ellipsize, exportFonts, type FittedLabel, fitLabel, wrapText } from './text';
import type { ExportInput, ExportLook, ExportTier } from './types';

/** One tier (a full-width row, or a chart cell), or the unranked items' section under them. */
export interface ExportRow extends Box {
    tier: ExportTier;
    /** Its label: the left end of a row, or the band across the top of a cell or of the unranked section. */
    label: Box;
    /** Top-left corner of its first picture. */
    itemsX: number;
    itemsY: number;
    /** Pictures across it. */
    columns: number;
    /** The unranked items: a quiet heading on the panel colour rather than a tier's coloured label. */
    unranked?: true;
}

/** A line of text placed on the export: left-aligned at x, or right-aligned at x when `alignRight`. */
export interface ExportText {
    lines: string[];
    font: string;
    fontSize: number;
    lineHeight: number;
    /** Middle of the first line. */
    top: number;
    x: number;
    alignRight?: true;
}

export interface ExportLayout {
    /** A chart: the rows are cells, with their labels on top. */
    chart: boolean;
    /** The tiers, then the unranked section if there is one. */
    rows: ExportRow[];
    tileWidth: number;
    tileHeight: number;
    gap: number;
    padding: number;
    width: number;
    /** The whole picture: title, tiers, unranked items, notes and credit. */
    height: number;
    captionSize: number;
    captionGap: number;
    /** Space under each picture for its caption (0 = no captions). */
    captionHeight: number;
    radius: number;
    title: ExportText | null;
    notes: { lines: { text: string; first: boolean }[]; top: number; height: number };
    credit: ExportText | null;
}

/** What every picture in the export shares: its size, the spacing, the caption under it. */
interface PictureMetrics {
    tileWidth: number;
    tileHeight: number;
    gap: number;
    padding: number;
    captionHeight: number;
}

/** The tiers on their own, starting at the top: rows or a chart's cells, and their size. */
interface TierArea {
    chart: boolean;
    rows: ExportRow[];
    width: number;
    height: number;
}

const CREDIT_FONT_SIZE = 10;

/** A title in proportion to the tier labels, within reason. */
const titleFontSize = (look: ExportLook): number => Math.min(40, Math.max(20, Math.round(look.labelSize * 1.75)));

const labelText = (look: ExportLook, text: string): string => (look.labelCase ? look.labelCase(text) : text);

function pictureMetrics(input: ExportInput): PictureMetrics {
    const look = input.look;
    return {
        tileWidth: input.tile.width,
        tileHeight: input.tile.height,
        gap: 2,
        padding: 6,
        captionHeight: input.caption ? Math.max(0, Math.round(look.captionSize * 1.3 + look.captionGap) + 2) : 0,
    };
}

/**
 * Lays the export out like the board (same tile size and shape, as many pictures across as the
 * tier rows are wide), with the title above and the unranked items, notes and credit below.
 * Call fontsReady first, so the text is measured in the look's fonts.
 */
export function layoutExport(input: ExportInput): ExportLayout {
    const look = input.look;
    const fonts = exportFonts(look);
    const metrics = pictureMetrics(input);
    const tiers = input.layout === 'chart' ? layoutChart(input, metrics) : layoutRows(input, metrics);
    const { width } = tiers;

    const titleSize = titleFontSize(look);
    const titleLines = input.title !== null ? titleText(input.title, width - 16, fonts.title(titleSize)) : [];
    const titleLineHeight = Math.round(titleSize * 1.2);

    const unrankedIds = [...input.pool];
    const unrankedAcross = picturesAcross(width - 12 - metrics.padding * 2, metrics.tileWidth, metrics.gap);
    const notes = noteLines(input, [...tiers.rows.map((row) => row.tier), { label: input.unrankedHeading, items: unrankedIds }], width);
    const bands = stackPage({
        titleHeight: titleHeight(titleLines.length, titleLineHeight),
        tiersHeight: tiers.height,
        unrankedHeight: unrankedHeight(unrankedIds.length, unrankedAcross, metrics),
        notesHeight: notes.height,
        creditHeight: input.credit !== null ? CREDIT_HEIGHT : 0,
        sectionGap: Math.max(look.gap, 6),
    });

    const rows = tiers.rows.map((row) => shiftRow(row, bands.tiersTop));
    if (unrankedIds.length) rows.push(unrankedRow(input, unrankedIds, unrankedAcross, bands.unrankedTop, width, metrics));
    return {
        chart: tiers.chart,
        rows,
        ...metrics,
        width,
        height: bands.height,
        captionSize: look.captionSize,
        captionGap: look.captionGap,
        radius: Math.min(look.radius, 20),
        title: titleLines.length
            ? {
                  lines: titleLines,
                  font: fonts.title(titleSize),
                  fontSize: titleSize,
                  lineHeight: titleLineHeight,
                  top: TITLE_PADDING.top + titleLineHeight / 2,
                  x: 8,
              }
            : null,
        notes: { ...notes, top: bands.notesTop },
        credit:
            input.credit !== null
                ? {
                      lines: [input.credit],
                      font: fonts.ui(CREDIT_FONT_SIZE),
                      fontSize: CREDIT_FONT_SIZE,
                      lineHeight: CREDIT_FONT_SIZE,
                      top: bands.creditTop + CREDIT_HEIGHT / 2,
                      x: width - 8,
                      alignRight: true,
                  }
                : null,
    };
}

/** The title in at most two lines; a longer one ends in "…". */
function titleText(title: string, width: number, font: string): string[] {
    const lines = wrapText(title, width, font);
    return lines.length <= 2 ? lines : [lines[0]!, ellipsize(lines.slice(1).join(' '), width, font)];
}

const shiftRow = (row: ExportRow, down: number): ExportRow =>
    down ? { ...row, y: row.y + down, label: { ...row.label, y: row.label.y + down }, itemsY: row.itemsY + down } : row;

/** The pool's items as a section as wide as the tiers, its heading in a band across the top. */
function unrankedRow(input: ExportInput, ids: ItemId[], across: number, top: number, width: number, metrics: PictureMetrics): ExportRow {
    const look = input.look;
    return {
        tier: { id: 'unranked', label: input.unrankedHeading, subtitle: '', color: look.panel, textColor: look.muted, items: ids },
        unranked: true,
        x: 6,
        y: top,
        width: width - 12,
        height: unrankedHeight(ids.length, across, metrics),
        label: { x: 6, y: top, width: width - 12, height: UNRANKED_HEADING_HEIGHT },
        itemsX: 6 + metrics.padding,
        itemsY: top + UNRANKED_HEADING_HEIGHT + metrics.padding,
        columns: across,
    };
}

/** Tier rows, as wide as the board's (but never cramped). */
function layoutRows(input: ExportInput, metrics: PictureMetrics): TierArea {
    const look = input.look;
    const { tileWidth, tileHeight, gap, padding, captionHeight } = metrics;
    const available = Math.max(input.rowWidth - 10, tileWidth * 6, 600);
    const columns = Math.max(4, Math.floor((available + gap) / (tileWidth + gap)));
    const width = look.labelWidth + padding * 2 + columns * (tileWidth + gap) - gap + 12;
    let y = 0;
    const rows = input.tiers
        .filter((tier) => input.includeEmptyTiers || tier.items.length)
        .map((tier) => {
            const lines = Math.max(1, Math.ceil(tier.items.length / columns));
            const height = Math.max(lines * (tileHeight + captionHeight) + (lines - 1) * gap + padding * 2, tileHeight + padding * 2, 64);
            const row: ExportRow = {
                tier,
                x: 6,
                y,
                width: width - 12,
                height,
                label: { x: 6, y, width: look.labelWidth, height },
                itemsX: 6 + look.labelWidth + padding,
                itemsY: y + padding,
                columns,
            };
            y += height + look.gap;
            return row;
        });
    return { chart: false, rows, width, height: Math.max(y - look.gap, 10) };
}

/**
 * A chart laid out like the board: its cells as wide as the board's, with the label bands
 * on top. Every cell is kept, empty or not: a chart with a hole in it would read wrong.
 */
function layoutChart(input: ExportInput, metrics: PictureMetrics): TierArea {
    const look = input.look;
    const { tileWidth, gap, padding } = metrics;
    const tilesAcross = tilesAcrossCell(Math.max(input.rowWidth - 10, 0), tileWidth, gap);
    // a band fits the longest label in up to two lines at fitLabel's largest size (smaller if it must), plus any subtitle
    const twoLines = Math.round(look.labelSize * 1.1) * 1.15 * 2;
    const bandHeightFor = (cellWidth: number) => {
        const tallest = Math.max(
            ...input.tiers.map((tier) => {
                const fitted = fitLabel(labelText(look, tier.label), cellWidth - 16, twoLines, look);
                return fitted.lines.length * fitted.lineHeight + (tier.subtitle ? 14 : 0);
            }),
        );
        return Math.max(Math.ceil(tallest) + 12, 34);
    };
    const grid = layoutChartGrid({
        ...metrics,
        itemCounts: input.tiers.map((tier) => tier.items.length),
        columns: input.chartColumns,
        tilesAcross,
        cellGap: Math.max(look.gap, 6),
        margin: 6,
        bandHeightFor,
    });
    const rows = input.tiers.map((tier, i): ExportRow => {
        const cell = grid.cells[i]!;
        return {
            tier,
            ...cell,
            label: { x: cell.x, y: cell.y, width: cell.width, height: grid.bandHeight },
            itemsX: cell.x + padding,
            itemsY: cell.y + grid.bandHeight + padding,
            columns: tilesAcross,
        };
    });
    return { chart: true, rows, width: grid.width, height: grid.height };
}

/** Notes listed under the tiers (in tier order, then the unranked items'), wrapped to the export's width. */
function noteLines(
    input: ExportInput,
    groups: { label: string; items: readonly ItemId[] }[],
    width: number,
): { lines: { text: string; first: boolean }[]; height: number } {
    if (!input.note) return { lines: [], height: 0 };
    const font = exportFonts(input.look).ui(11);
    const lines: { text: string; first: boolean }[] = [];
    for (const { label, items } of groups)
        for (const id of items) {
            const note = input.note(id);
            if (note)
                wrapText(`${input.name(id)} (${label}): ${note}`, width - 28, font).forEach((text, i) => {
                    lines.push({ text, first: i === 0 });
                });
        }
    return { lines, height: lines.length ? 30 + lines.length * 15 : 0 };
}

/** Top-left corner of the index-th picture in a row. */
export function itemPosition(layout: ExportLayout, row: ExportRow, index: number): { x: number; y: number } {
    const column = index % row.columns;
    const line = Math.floor(index / row.columns);
    return {
        x: row.itemsX + column * (layout.tileWidth + layout.gap),
        y: row.itemsY + line * (layout.tileHeight + layout.captionHeight + layout.gap),
    };
}

/** Where the unranked section's heading goes: quiet, at the left of its band. */
export function unrankedHeadingText(row: ExportRow, layout: ExportLayout, look: ExportLook): ExportText {
    const size = 13;
    return {
        lines: [row.tier.label],
        font: exportFonts(look).title(size),
        fontSize: size,
        lineHeight: size,
        top: row.label.y + row.label.height / 2 + 3,
        x: row.label.x + layout.padding + 2,
    };
}

/** Where a tier's label goes: fitted to its box, centred with the subtitle under it. */
export function placeLabel(row: ExportRow, look: ExportLook): FittedLabel & { top: number; subtitleHeight: number } {
    const box = row.label;
    const subtitleHeight = row.tier.subtitle ? 14 : 0;
    const fitted = fitLabel(labelText(look, row.tier.label), box.width - 16, box.height - 10 - subtitleHeight, look);
    const top = box.y + box.height / 2 - (fitted.lines.length * fitted.lineHeight + subtitleHeight) / 2 + fitted.lineHeight / 2;
    return { ...fitted, top, subtitleHeight };
}
