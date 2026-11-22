# Architecture

> How the engine is laid out, the rules between its parts, and how an app plugs into it. The engine is the board and
> nothing above it: anything with a menu, a window or a kind of item belongs to the app.

---

## The shape of it {0}

```
tier-engine/
├── src/
│   ├── safe/       index.ts       html`…`, joinHtml, setHtml, safeUrl, escapeHtml, useTrustedTypesPolicy
│   ├── core/       types.ts       BoardList, Tier, Pick, BoardItem, ItemSource, Picture: the shapes every app shares
│   │               format.ts      the saved format (version 10): writeList, readList, readTiers, readPick, MIGRATIONS
│   │               history.ts     createHistory: undo and redo, marks (a deletion undo brings back), checkpoints
│   │               storage.ts     createLocalStore (prefixed localStorage), IndexedDB helpers
│   │               link.ts        the share-link format: packForLink, unpackFromLink, size caps
│   │               backup.ts      the backup file: writeBackup, readBackup (every list in a browser, checked)
│   │               csv.ts         CSV both ways: quoting, the formula guard, tableAsCsv, readCsvRows
│   │               group.ts       group ranking: scores by tier, combineRankings, spread, closest person
│   │               tile-box.ts    a tile's shape and where a picture sits in it (pure arithmetic)
│   │               checks.ts      isRecord, dig, asText…: reading anything from outside
│   │               color.ts       colour maths (readable text, contrast)
│   │               index.ts       tier-engine/core: everything above
│   └── board/      board.ts       mountBoard: tiers, pool, tiles, selection, filtering, tiers added and moved
│                   drag.ts        the pointer: drag tiles, box-select, right-click → onTileOpen
│                   keys.ts        the keyboard: arrows between tiles, Space selects, Alt+arrows move
│                   placement.ts   where a moved item lands while some are hidden (pure)
│                   pool-order.ts  the pool's order: as added, A to Z, Z to A, shuffled (pure)
│                   board.css      the look, themed by the app's CSS variables (README {1})
│                   index.ts       tier-engine/board
│   └── export/     types.ts       ExportInput, ExportLook, ExportRun: what an export is made from (plain values)
│                   layout.ts      layoutExport: title, tiers or a chart's cells, unranked items, notes, credit
│                   render.ts      renderSvg, renderPng, walkLayout (for an app's own format, a PDF)
│                   text.ts        fonts from the look, wrapping, "…", a tier label fitted to its box
│                   picture.ts     drawPicture: one picture in the tile's shape, cropped like on the board
│                   bands.ts       the page top to bottom (pure)
│                   chart-grid.ts  a chart's cells (pure)
│                   index.ts       tier-engine/export
├── example/        index.html, main.ts, example.css   the engine on a page of its own (pnpm example)
├── vite/           plugin.js      tierEngine(options): compile the engine, preview headers, write dist/sw.js
│                   sw.js          the offline service worker (the build fills in its file list)
├── scripts/        identity-guard.ts   pnpm guard (security.md {4})
└── tests/
    ├── unit/       every public function (the board in a stand-in DOM), the code rules, the size budget
    └── browser/    the example page in Chromium, desktop and phone: drag, keys, undo, chart, shapes, exports, axe
```

An app on it (Tierinator is the full example) holds everything else: its page and markup, its menus and windows, its
item sources, its saved fields, its theme, its own browser tests, and any export format the engine doesn't draw (PDF).

## The rules between the parts {1}

1. **safe imports nothing. core imports only core. board and export each import core and safe, never each other.**
   Nothing imports a package at run time, and importing an entry point draws nothing and touches no page. `tests/unit/code-rules.test.ts` reads every import and fails on one that breaks this, naming the line.
2. **The engine names no app and no kind of item.** No Pokémon, no templates, no wiki, no app's name. The same test
   fails on any of them in `src`. Whatever differs between apps comes in through an option or a hook.
3. **Markup only through safe.** No `innerHTML` outside `safe/index.ts`, no `eval`, no inline `on…=` handlers: also
   checked by the test. The Trusted Types policy's name is the app's (`useTrustedTypesPolicy`), so its CSP can list it.
4. **Anything from outside is `unknown` until checked.** Files, links, storage: `readList`, `readTiers`, `readPick`,
   `isPicturePath`, `unpackFromLink` (with a size cap), `checks.ts`.
5. **The board changes the list it's given, in place,** and tells the app (`onChange`) rather than saving. One undo
   step per change, through the history it's given or its own.
6. **Public API changes are versions.** Anything exported from an entry point is public: breaking it is a major
   version, listed in CHANGELOG.md. The saved format changes only with a migration in `MIGRATIONS` and a test.

## How an app plugs in {2}

```
            the app                                         the engine
 ┌───────────────────────────────┐         ┌─────────────────────────────────────────────┐
 │ its list type  ── extends ──────────────▶ BoardList (tiers, picks, notes, tags, layout…) │
 │ its saved keys ── appFields ────────────▶ writeList / readList → raw                     │
 │ its items      ── ItemSource ───────────▶ mountBoard(element, { list, source, … })       │
 │ its screens    ◀── hooks ──────────────── onTileOpen, onTierOpen, onSelect, onFilter…    │
 │ its theme      ── CSS variables ────────▶ board.css                                      │
 └───────────────────────────────┘         └─────────────────────────────────────────────┘
```

- [ ] **The list.** The app's list type extends `BoardList` with its own fields. The board reads and writes only
      `BoardList`'s, so an app's fields are safe from it.
- [ ] **Saving.** `writeList(list, name, appFields)` puts the app's keys beside the board's (and refuses one with a
      board key's name). `readList` checks the board's and returns the whole object as `raw`; the app checks its own.
- [ ] **Items.** An `ItemSource` gives the pool's items (`items()`), any item by id (`item(id)`), and each one's
      picture (`picture(item)`: an address, an optional crop box, and whether it's a text tile).
- [ ] **Screens.** The board never opens anything. It asks: `onTileOpen` on right-click or the Menu key, `onTierOpen`
      on a tier's ✎ or label, and reports: `onSelect`, `onFilter` (counts and search hits), `onPlace`, `notify`.
- [ ] **What's shown.** `visible(id)` hides items everywhere (a focus); `matches(id)` with `searching()` filters the
      pool and marks ranked hits. Items the app hides keep their place when others move (placement.ts).
- [ ] **Undo.** Pass the app's `createHistory` as `history` when its own changes (its look, say) share the steps.
- [ ] **Look.** `board.css` after the app's base styles, before its own board rules. The app sets the variables;
      any it leaves unset fall back to a plain dark default.
- [ ] **Exports.** `layoutExport(input)` with the app's list and look as plain values (`ExportInput`,
      `ExportLook`), then `renderSvg` or `renderPng` with its pictures (`ExportRun`). Progress and Cancel are callbacks;
      a format the engine doesn't draw uses the same layout and `walkLayout`.
- [ ] **Files.** `writeBackup` / `readBackup` for every list at once, `tableAsCsv` / `readCsvRows` for spreadsheets,
      `combineRankings` for several people's lists of the same things. Gathering and storing is the app's.

## Releasing {3}

docs/hosting.md: version, tag, and each app moves to it.
