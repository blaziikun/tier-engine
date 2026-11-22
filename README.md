# tier-engine

> The tier board behind [Tierinator](https://tierinator.com): a list model with its saved format, undo, storage,
> share links, backups, CSV and group ranking; a board you mount in any page; and exports as SVG or PNG. No screens,
> no app, no runtime dependencies. MIT.

The engine is the board and nothing above it. Menus, windows, templates and Pokémon belong to the app that mounts it.

```
tier-engine/core    the list without a screen: shapes, the saved format (version 10), undo, storage, share links,
                    backups, CSV, group ranking, checks
tier-engine/board   mountBoard(element, options): tiers or a chart, the pool, drag, keyboard moves, tiles, selection
tier-engine/export  the list as a picture: layoutExport, then renderSvg or renderPng
tier-engine/safe    html`…` (everything escaped), setHtml, the Trusted Types policy
tier-engine/vite    the build plugin: compiles the engine, preview security headers, the offline service worker
tier-engine/board.css   the board's look, themed by the app's CSS variables
```

It's TypeScript source, not a built library: an app installs a tagged version from GitHub and its own Vite compiles it.

## {0} Using it

```sh
pnpm add github:blaziikun/tier-engine#v1.0.0
```

```ts
import 'tier-engine/board.css';
import { mountBoard } from 'tier-engine/board';
import { type BoardList, type ItemSource, writeList } from 'tier-engine/core';

const list: BoardList = {
    tiers: [{ id: 's', label: 'S', subtitle: '', color: '#ff7f7f', items: [] }],
    layout: 'tiers', chartColumns: 3, tileSize: 88, poolTileSize: 76, tileShape: 'square', tileFit: 'contain',
    labelMode: 'name', poolOrder: { by: 'added', seed: 1 }, picks: {}, notes: {}, tags: {},
    selection: new Set(), selectionSource: null,
};
const items = [{ id: 1, name: 'Tea' }, { id: 2, name: 'Coffee' }];
const source: ItemSource = { id: 'drinks', items: () => items, picture: (item) => ({ src: `/pictures/${item.id}.png` }) };

const board = mountBoard(document.querySelector('#tiers')!, {
    list,
    source,
    pool: document.querySelector<HTMLElement>('#pool')!,
    onChange: () => localStorage.setItem('drinks_list', JSON.stringify(writeList(list, 'Drinks'))),
});
board.render();
```

The board changes `list` in place and calls `onChange` after every change; saving is yours (`writeList` / `readList`).
Nothing is drawn until `render()`.

**The handle:** `move`, `undo`, `redo`, `select`, `clearSelection`, `selectAllIn`, `moveSelectionTo`, `addTier`,
`moveTier`, `render`, `place`, `filter`, `nextHit`, `setPoolOrder`, `refit`, `setTheme`, `tile`, `refreshPicture`,
`fit`, `focus`, `reset`, `destroy`, and a few readers (`rankedIds`, `orderedIds`, `counts`, `rowWidth`, `isDragging`).
Every one is described in `src/board/board.ts` (`BoardHandle`).

**Item sources:** `{ id, items(), picture(item) }`, plus `item(id)` for items a tier holds that the pool doesn't offer,
and `pictureFailed(item, img)` to repair a picture that didn't load. The engine never knows what the items are.

**Hooks:** `onChange`, `onSelect`, `onTileOpen` (right-click, the Menu key), `onTierOpen` (a tier's ✎ or label),
`onFilter`, `onPlace`, `onDragStart`, `notify`; and to shape what's drawn: `decorate(tile, item)`, `tierControls(tier)`,
`tierStyle(tier)`, `visible(id)` (hide items everywhere), `matches(id)` with `searching()` (a search), `active()`.

**The saved format:** `writeList(list, name, appFields)` writes the board's keys and yours beside them;
`readList(stored, { itemExists, makeId })` checks the board's and hands yours back in `raw` for you to check. Version 10;
older files load (`MIGRATIONS` lists every difference).

**Storage:** `createLocalStore(['myapp_'])` is localStorage that refuses keys outside your prefixes, so backups and
"delete everything" never touch another app's data. `openDatabase`, `dbRequest`, `readEntries`, `deleteEntries` and
`deleteDatabase` do the same for IndexedDB.

**Exports:** `layoutExport(input)` lays the list out from plain values (`ExportInput`: the tiers, the pool to show,
the title, captions, notes, the credit line, and `look`: colours, fonts and sizes); `renderSvg(layout, input, run)`
and `renderPng(layout, input, run)` draw it, with each item's picture, progress and Cancel in `run`. For a format the
engine doesn't draw (Tierinator's PDF), use the same layout with `walkLayout`, `placeLabel` and `drawPicture`.

**Files:** `writeBackup(app, lists, settings)` / `readBackup(file, settingKeys)` for every list at once;
`tableAsCsv(rows)` / `readCsvRows(text)` for spreadsheets (cells guarded against formulas both ways);
`combineRankings(lists)` for several people's rankings of the same things, with `closestPerson` and
`agreementExtremes`. Which items match across lists, and where it all gets stored, is the app's.

**Undo:** `createHistory({ capture, restore })`. Pass yours to `mountBoard` (`history`) when your own changes share the
same steps; otherwise the board keeps its own.

## {1} Theming

`board.css` reads these CSS variables, which the app sets (on `:root`, or with `board.setTheme({ '--cyan': '#…' })`
on the board's two elements). Each has a plain dark default for when it's left unset, so a page with no theme still
gets a working, readable board:

| Variable | What it is |
| --- | --- |
| `--s1`, `--s2`, `--hover` | panel, raised and hover backgrounds |
| `--text`, `--muted`, `--on-accent` | text colours |
| `--border`, `--border2` | lines |
| `--accent`, `--cyan` | the accent, and the highlight (selection, search hits, drop marks) |
| `--r`, `--r-chip`, `--r-ctl`, `--r-panel` | corner radii |
| `--lift` | the floating shadow |
| `--font-head`, `--w-head`, `--w-label`, `--w-strong`, `--fs-label`, `--ls-label`, `--tt-label` | tier label type |
| `--lbl-fs`, `--lbl-gap` | names under tiles |
| `--sz`, `--psz`, `--lw`, `--rowgap` | tile size, pool tile size, label width, gap between rows |

The board sets `--tile-wf`, `--tile-hf`, `--tile-ratio`, `--tile-fit` and `--chart-cols` itself, on its own two
elements: other parts of the page that want the tile shape set them on `:root` from `tileScale` and `tileRatio`.

## {2} Working on it

You need [Node.js](https://nodejs.org) 22+ and [pnpm](https://pnpm.io). Keep this folder next to the apps'.

```sh
pnpm install
pnpm verify            # lint, types, dead-code check, unit tests
pnpm example           # the example page (example/): a board of ten colours, undo, chart, shapes, exports
pnpm exec playwright install chromium   # once, for the browser tests
pnpm test:browser      # the example page in Chromium, desktop and phone, with axe's WCAG 2.2 AA checks
pnpm guard             # the identity guard (docs/security.md {4})
```

Tierinator's own browser tests cover the board inside a full app. To try a change there, link this folder (don't
commit the link):

```sh
cd ../tierinator && pnpm add tier-engine@link:../tier-engine && pnpm dev
```

Releasing a version: docs/hosting.md. How it's laid out and the rules between its parts: docs/architecture.md. Why it's
built this way: docs/decisions.md and docs/defence.md.

## {3} Licence

MIT (LICENSE). The board's look borrows nothing; fonts are the app's.
