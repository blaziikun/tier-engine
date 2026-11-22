// src/export/index.ts  (tier-engine/export)
// ─────────────────────────────────────────────────────────────────────────────
//  A tier list as a picture: the layout every format shares (title, tiers or a
//  chart's cells, unranked items, notes, credit), drawn as SVG or PNG. The app
//  passes its list and its look as plain values (types.ts), so this reads no
//  page state; formats the engine doesn't draw (a PDF) can use the layout too.
// ─────────────────────────────────────────────────────────────────────────────

export {
    CREDIT_HEIGHT,
    type PageBands,
    type PageParts,
    picturesAcross,
    stackPage,
    TITLE_PADDING,
    titleHeight,
    UNRANKED_HEADING_HEIGHT,
    unrankedHeight,
} from './bands';
export { type Box, type ChartGrid, type ChartGridInput, layoutChartGrid, tilesAcrossCell } from './chart-grid';
export { type ExportLayout, type ExportRow, type ExportText, itemPosition, layoutExport, placeLabel, unrankedHeadingText } from './layout';
export { detailedSize, drawPicture } from './picture';
export { type PngResult, renderPng, renderSvg, walkLayout } from './render';
export { type ExportFonts, ellipsize, exportFonts, type FittedLabel, fitLabel, fontsReady, measureContext, wrapText } from './text';
export type { ExportInput, ExportLook, ExportPicture, ExportRun, ExportTier, SvgRun } from './types';
