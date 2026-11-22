// src/export/types.ts  (tier-engine/export): what an export is made from
// ─────────────────────────────────────────────────────────────────────────────
//  The app hands over its list (ExportInput) and its look (ExportLook) as plain
//  values and callbacks; the export never reads the page or the app's state.
// ─────────────────────────────────────────────────────────────────────────────

import type { Crop, ItemId, TileFit } from '../core/types';

/** A tier as the export draws it. */
export interface ExportTier {
    id: string;
    label: string;
    subtitle: string;
    color: string;
    /** The label's own text colour, if it has one (the look decides otherwise). */
    textColor?: string;
    items: readonly ItemId[];
}

/** The look: colours, fonts and sizes, as the board shows them. */
export interface ExportLook {
    /** The page behind everything. */
    background: string;
    /** The unranked section's panel. */
    panel: string;
    /** The title and the notes' heading. */
    text: string;
    /** Captions, notes, the credit line and the unranked heading. */
    muted: string;
    /** CSS font stacks: tier labels and the title, and everything else. */
    headFamily: string;
    uiFamily: string;
    labelWeight: number;
    titleWeight: number;
    uiWeight: number;
    /** A tier label's size in px (labels shrink to fit, and may grow a tenth). */
    labelSize: number;
    /** Letter spacing of tier labels, in em. */
    letterSpacing: number;
    /** The width of a row's label, in px. */
    labelWidth: number;
    /** Between tier rows, in px. */
    gap: number;
    /** Corner radius of rows and cells (at most 20 is used). */
    radius: number;
    /** Captions under pictures: size and the space above them, in px. */
    captionSize: number;
    captionGap: number;
    /** A tier label as shown (upper case, say); unchanged if left out. */
    labelCase?(text: string): string;
    /** The colour of a tier's label text. */
    labelTextColor(tier: ExportTier): string;
    /** A tier row's background, from the tier's colour. */
    rowBackground(tierColor: string): string;
}

/** What to export. */
export interface ExportInput {
    /** Top to bottom (or a chart's cells in order). */
    tiers: readonly ExportTier[];
    /** The unranked items to show under the tiers; empty to leave the section out. */
    pool: readonly ItemId[];
    /** Rows like the board's, or a chart's grid of cells `chartColumns` across. */
    layout: 'rows' | 'chart';
    chartColumns: number;
    /** A picture's size in px (the board's tile shape and size). */
    tile: { width: number; height: number };
    /** The board's row width in px: the export is as wide (never cramped). */
    rowWidth: number;
    /** Rows with no items are drawn too (a chart always keeps every cell). */
    includeEmptyTiers: boolean;
    /** The title over the tiers (two lines at most), or null for none. */
    title: string | null;
    /** The small line in the bottom corner, or null for none. */
    credit: string | null;
    /** Captions under pictures: the text for each, or null for none. */
    caption: ((id: ItemId) => string) | null;
    /** Notes listed under the tiers ("name (tier): note"), or null to leave them out. */
    note: ((id: ItemId) => string | undefined) | null;
    /** An item's name (notes, PNG stand-ins for missing pictures). */
    name(id: ItemId): string;
    look: ExportLook;
    /** The unranked section's heading. */
    unrankedHeading: string;
}

/** Where an item's picture comes from, and how it sits in its tile. */
export interface ExportPicture {
    src: string;
    crop?: Crop | null;
    fit: TileFit;
}

/** How a render goes: pictures, progress and cancelling. */
export interface ExportRun {
    picture(id: ItemId): ExportPicture;
    /** Pixels along a picture's longer side (SVG and PNG; PNG may use fewer if the browser can't hold more). */
    detail: number;
    /** Called every ten pictures, with the share of the whole job done (0–100). */
    progress?(done: number, total: number, percent: number): void;
    /** Asked between pictures: true stops the render, which then gives null. */
    cancelled?(): boolean;
}

/** SVG only: vector pictures stay vector, a fallback when drawing fails, and each picture's tooltip. */
export interface SvgRun extends ExportRun {
    /** A data: address of the item's picture if it's vector (kept as it is), else null. */
    vector?(id: ItemId): Promise<string | null>;
    /** A picture address to use when drawing the picture fails. */
    fallback?(id: ItemId): string;
    /** The tooltip on each picture. */
    describe(id: ItemId): string;
    /** The document's <title>. */
    documentTitle: string;
    /** Stylesheet addresses (web fonts) the SVG imports. */
    fontImports?: readonly string[];
}
