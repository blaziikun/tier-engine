# Design notes and weak spots

> What each part protects against, where it's weak, and what I'd do about it. The app-level notes (every feature,
> the page, its hosting) are in Tierinator's docs/defence.md.

---

## {0} The saved format

- **Protects:** every file anyone saved. Readers accept older keys (`MIGRATIONS`), clamp numbers, drop unknown items
  and duplicates, cap tiers at 100, refuse picture paths that walk out of a collection (`..`, `\`, `%2e`, `%2f`).
- **Weak spot:** an app reading its own fields from `raw` has to be as careful. The engine can't check what it doesn't
  know. Tierinator's are checked in its `core/snapshot.ts`, with tests.

## {1} The board

- **Protects:** the list from half-done moves. Every move is one undo step, then one `onChange`.
- **Weak spot:** a board is mounted on the app's elements and listens on `document` for the pointer. Two boards on one
  page work (each checks its own elements), but nobody does that yet, so it's tested only by reading.
- **Weak spot:** looking up an item by id calls `source.item(id)` or rebuilds a map from `items()`. At 20,000 items
  that's fine; a source with far more would want its own `item(id)`.

## {2} Links

- **Protects:** the page from a crafted link: unpacking stops at the caller's byte limit (`MAX_LINK_LIST_BYTES` is 4 MB).
- **Weak spot:** a link is as private as wherever it's pasted. Nothing here can change that.

## {3} Storage

- **Protects:** other data on the same site (prefixes), and saving from failing silently (`set` throws when storage is
  full, so the app can say "Not saved").

## {4} Exports

- **Protects:** the SVG from the list's text. Every label, name, note and title is escaped (`escapeHtml`), so a tier
  called `</text><script>` is text in the file. The PNG is pixels only.
- **Protects:** the export from the page's state: it reads only the plain values the app passes, so what it draws is
  what the app chose to include.
- **Weak spot:** pictures from other sites need CORS to be drawn into a PNG; one that refuses is drawn as its name.
