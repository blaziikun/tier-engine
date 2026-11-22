# Decisions

> Why the engine is built the way it is: each choice, what it was against, and what would change it.

---

## {0} The engine is the board, never an app

Version 1 was everything: every screen, the Pokémon data, an `AppConfig` with a `mode` that hid half the page per app.
Two apps on it meant every feature carried both apps' cases, and a third (a library of saved lists) would have made it
worse. Version 2 keeps only what every tier board needs: the list, its format, undo, storage, links, and the board.

- **Against:** one big engine with more config. Rejected: every app pays for every other app's features.
- **Would change it:** nothing I can see. A shared screen two apps want goes in a third package, not here.

## {1} Item sources instead of kinds of list

The board takes `{ id, items(), picture(item) }` and never asks what an item is. Pokémon, templates and your own
pictures are all just sources, owned by the app.

- **Against:** a `kind` field the engine switches on. Rejected: it's how version 1 ended up knowing Pokémon.

## {2} Hooks, not imports

The board reports and asks through options (`onTileOpen`, `onTierOpen`, `onFilter`…). Features never reach into it,
and it never reaches into them.

- **Against:** an event bus. Rejected: options are typed, and a missing one is a compile error, not silence.

## {3} The app's fields ride along in the same saved object

`writeList(list, name, appFields)` writes one object with the board's keys and the app's. Old files have both kinds
mixed together already, so a separate "app section" would have needed a migration for every file ever saved.

- **Against:** `{ board: …, app: … }`. Rejected: it breaks every old file for no gain the visitor sees.
- **Guard:** an app key with a board key's name throws, so an app can't shadow what the engine reads back.

## {4} Storage keys under the app's prefixes

`createLocalStore(prefixes)` refuses any other key. Backups and "delete everything" list only the app's own keys, so
two apps on one site, or an app next to something else, never touch each other's data.

## {5} The board's CSS has no look of its own

`board.css` reads the app's CSS variables. Rules there use the board's classes only; an app's rules with its own ids
win where it wants something different. That's how Tierinator moved onto version 2 with every screen unchanged.

## {6} No runtime dependencies, no network

PDF export (jsPDF) and zips (fflate) stay in the app that uses them. The engine never fetches anything: pictures come
from the source's addresses, loaded by the page.

## {7} TypeScript source from a GitHub tag

The apps compile the engine with their own Vite. No build step here, and no npm until a second app uses it; then npm,
published from CI with provenance.

## {8} Exports are their own entry point

`tier-engine/export` sits beside the board, not inside it: it needs the list and the look, never a mounted board, so
a library page or a build script can draw a list too, and an app that never exports doesn't carry it. It takes plain
values (the tiers, the title, the fonts and colours) instead of reading the page, which is also what lets the tests
check it. PDF stays in the app because it needs jsPDF, and the engine has no runtime dependencies ({6}).

## {9} The size budget

The budget (`tests/unit/size-budget.test.ts`) is each entry point's gzipped source at 1.0.0, plus a tenth. Raising
one needs its own reason written here: a feature moving in from an app, say, rather than growth.

## {10} Defaults in the CSS, not on the elements

Every variable in `board.css` has a fallback (`var(--text, #ededee)`), used only when the app leaves it unset. A
default set on the board's elements instead would beat the app's `:root` values, since a variable set on an element
wins over an inherited one. The tile shape is the opposite case: the board sets those variables on its own two
elements, so it never changes the rest of the page (Tierinator sets them on `:root` itself for its other views).
