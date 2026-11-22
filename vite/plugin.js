// vite/plugin.js
// ─────────────────────────────────────────────────────────────────────────────
//  tier-engine/vite: what an app's build needs from the engine. An app's
//  vite.config.ts adds tierEngine(options):
//    · the engine is compiled with the app (it ships as TypeScript source),
//    · `vite preview` sends the app's own security headers (public/_headers),
//      so the strict CSP and Trusted Types are tested on this computer too,
//    · dist/sw.js is written for offline use, with this build's files in it.
//  The page itself (its markup, its screens) belongs to the app.
//
//  Plain JavaScript (types in plugin.d.ts): Node loads a build config's imports
//  from node_modules as they are, and won't strip TypeScript there.
// ─────────────────────────────────────────────────────────────────────────────
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SERVICE_WORKER = fileURLToPath(new URL('./sw.js', import.meta.url));

/** The app's files besides /assets that the service worker keeps, when they exist (an app can name its own). */
const DEFAULT_OFFLINE_FILES = [
    'index.html',
    'privacy.html',
    'manifest.webmanifest',
    'favicon.svg',
    'apple-touch-icon.png',
    'icon-192.png',
    'icon-512.png',
    'icon-maskable-512.png',
];

/** The headers public/_headers gives every page ("/*"), less what plain http on this computer can't use. */
export function siteHeaders(root) {
    const headers = {};
    const file = resolve(root, 'public', '_headers');
    if (!existsSync(file)) return headers;
    let inAllPages = false;
    for (const line of readFileSync(file, 'utf8').split('\n')) {
        if (!line.trim() || line.startsWith('#')) continue;
        if (!/^\s/.test(line)) inAllPages = line.trim() === '/*';
        else if (inAllPages) {
            const colon = line.indexOf(':');
            headers[line.slice(0, colon).trim()] = line.slice(colon + 1).trim();
        }
    }
    delete headers['Strict-Transport-Security'];
    if (headers['Content-Security-Policy'])
        headers['Content-Security-Policy'] = headers['Content-Security-Policy'].replace(' upgrade-insecure-requests;', '');
    return headers;
}

/** Replaces `placeholder` in `text`, and fails the build if it isn't there (sw.js was edited without this). */
function fillIn(text, placeholder, value) {
    if (!text.includes(placeholder)) throw new Error(`tier-engine/vite/sw.js: "${placeholder}" is missing`);
    return text.replace(placeholder, value);
}

/** A folder name for DATA_FOLDERS: letters, digits and dashes only, so it can't widen what the worker keeps. */
const isFolderName = (name) => typeof name === 'string' && /^[a-z0-9-]+$/i.test(name);

/**
 * The service worker for this build: its version is a hash of the worker and the files it keeps, so a build that
 * changes nothing leaves sw.js byte for byte the same and nobody is offered an update that isn't one.
 */
export function buildServiceWorker(outDir, offline = {}) {
    const worker = readFileSync(SERVICE_WORKER, 'utf8');
    const skip = offline.skip ?? null;
    const dataFolders = offline.dataFolders ?? [];
    for (const folder of dataFolders) if (!isFolderName(folder)) throw new Error(`tierEngine: offline.dataFolders: "${folder}" isn't a folder name`);
    const assetsDir = resolve(outDir, 'assets');
    const assets = existsSync(assetsDir) ? readdirSync(assetsDir).filter((name) => !(skip && skip.test(name))) : [];
    const pages = (offline.files ?? DEFAULT_OFFLINE_FILES).filter((file) => existsSync(resolve(outDir, file)));
    const files = [...pages, ...assets.map((name) => `assets/${name}`)];
    const hash = createHash('sha256').update(worker).update(JSON.stringify(dataFolders));
    for (const file of files) hash.update(file).update(readFileSync(resolve(outDir, file)));
    const paths = files.map((file) => (file === 'index.html' ? '/' : `/${file}`));
    let built = fillIn(worker, "const VERSION = 'dev';", `const VERSION = '${hash.digest('hex').slice(0, 16)}';`);
    built = fillIn(built, 'const APP_FILES = [];', `const APP_FILES = ${JSON.stringify(paths)};`);
    built = fillIn(built, 'const DATA_FOLDERS = [];', `const DATA_FOLDERS = ${JSON.stringify(dataFolders)};`);
    return built;
}

/** @param {import('./plugin').EngineOptions} [options] */
export function tierEngine(options = {}) {
    let outDir = 'dist';
    const plugins = [
        {
            name: 'tier-engine',
            config() {
                return {
                    // the engine is TypeScript source: compiled with the app, never pre-bundled as a library
                    optimizeDeps: { exclude: ['tier-engine'] },
                    ssr: { noExternal: ['tier-engine'] },
                };
            },
        },
        {
            name: 'tier-engine:preview-headers',
            config(config, env) {
                if (!env.isPreview) return;
                return { preview: { headers: siteHeaders(config.root ? resolve(config.root) : process.cwd()) } };
            },
        },
    ];
    if (options.offline !== false)
        plugins.push({
            name: 'tier-engine:offline',
            apply: 'build',
            configResolved(resolved) {
                outDir = resolve(resolved.root, resolved.build.outDir);
            },
            closeBundle() {
                writeFileSync(resolve(outDir, 'sw.js'), buildServiceWorker(outDir, options.offline ?? {}));
            },
        });
    return plugins;
}
