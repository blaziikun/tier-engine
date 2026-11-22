# Security

> What the engine does to keep a page that uses it safe, and what it leaves to the app. Tierinator's docs/security.md
> covers the whole site (headers, hosting, the 50 common holes).

---

## {0} What there is to protect

People's lists, in their own browser. The engine has no server, no accounts, no network calls of its own.

## {1} Anything from outside

- [x] Every format has one reader that checks every field: `readList`, `readTiers`, `readPick` (core/format.ts),
      `unpackFromLink` (core/link.ts, with a byte cap), `checks.ts` for anything else.
- [x] Picture paths are web addresses or paths inside a collection; `isPicturePath` refuses `..`, `\`, `?`, `#`,
      encoded dots and slashes, absolute paths and other schemes.
- [x] Numbers are clamped, text is cut to length, colours must be `#rrggbb`, tiers stop at 100.

## {2} Markup

- [x] The only way markup reaches the page is `setHtml(element, html`…`)` (safe/index.ts): every value is escaped.
- [x] With Trusted Types (the app's CSP: `require-trusted-types-for 'script'; trusted-types <name>`), any other
      `innerHTML` throws. The policy's name is the app's: `useTrustedTypesPolicy(name)` once, before drawing.
- [x] A unit test fails on `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `document.write`, `eval`, `new Function`
      or an inline `on…=` handler anywhere in `src` outside safe/.

## {3} Storage

- [x] `createLocalStore(prefixes)` reads, lists and deletes only the app's keys.
- [x] `deleteDatabase(name)` and `removeAll()` never fail loudly, so "delete everything" always finishes.

## {4} Keeping my name out of it: the identity guard

`pnpm guard` (scripts/identity-guard.ts) looks for my private words in every file and every commit, as in each app.
The words come from `~/.config/sayel/private-words` on my computer and the `PRIVATE_WORDS` repository secret in CI.
Without them, a contributor's run says it skipped and passes. What it matches and what it can't catch: Tierinator's
docs/security.md {8}.

## {5} Reporting a problem

SECURITY.md.
