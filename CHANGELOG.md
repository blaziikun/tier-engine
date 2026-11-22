# Changelog

Versions follow semver: anything exported from an entry point is the API. Breaking changes come first in each version.

## 1.0.0 (22 Nov 2026)

The tier board behind Tierinator, and nothing above it.

- **Entry points:** `tier-engine/core`, `tier-engine/board`, `tier-engine/export`, `tier-engine/safe`,
  `tier-engine/vite`, and the stylesheet `tier-engine/board.css`. TypeScript source, compiled by the app. No runtime
  dependencies.
- **Core:** the list model; the saved format (version 10, `writeList` / `readList`, with app fields beside the board's,
  and `MIGRATIONS` for every older file); `createHistory` (undo and redo with marks and checkpoints);
  `createLocalStore` (prefixed localStorage) and IndexedDB helpers; share links (`packForLink`, `unpackFromLink`); the
  backup file (`writeBackup`, `readBackup`); CSV (`tableAsCsv`, `readCsvRows`, cells guarded against formulas); group
  ranking (`combineRankings`, `tierScore`, `nearestTier`, `closestPerson`, `agreementExtremes`); checks for anything
  read from outside; colour and tile-box maths.
- **Board:** `mountBoard(element, options)`: tiers or a chart, the pool, drag (mouse, touch, pen), keyboard moves,
  picture and text tiles, selection and marquee, with item sources and hooks; `fitPictureInTile` for an app's own
  frames.
- **Export:** `layoutExport` from the app's list and look as plain values, `renderSvg`, `renderPng`, and `walkLayout`
  for formats the app draws itself.
- **Safe HTML:** the escaping `html` template, `setHtml`, and `useTrustedTypesPolicy(name)`.
- **Build:** the Vite plugin `tierEngine()`: security headers, the content security policy and the offline service
  worker.
- **Look:** `board.css`, themed by CSS variables, each with a plain dark default; tier buttons at least 24 × 24 (WCAG
  2.2 AA). The board keeps its tile shape on its own elements.
- **Tests:** unit tests on every public function (the board in a stand-in DOM), code rules and a size budget; an
  example page (`pnpm example`) with browser tests and axe's WCAG 2.2 AA checks; all in CI.
