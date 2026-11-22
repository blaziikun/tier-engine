// vite/plugin.d.ts: the types of plugin.js (see there).
import type { Plugin } from 'vite';

export interface OfflineOptions {
    /** Files besides /assets the worker keeps when they exist (default: index.html, privacy.html, the manifest and icons). */
    files?: readonly string[];
    /** Folders kept as they're used, newest copy fetched in the background ("templates", "packs"). Letters, digits, dashes. */
    dataFolders?: readonly string[];
    /** Built files the page never loads, left out of the offline copy (a library's optional chunks). */
    skip?: RegExp;
}

export interface EngineOptions {
    /** The offline copy's settings, or false for no service worker. */
    offline?: OfflineOptions | false;
}

/** The engine's build plugins: compile the engine with the app, preview headers, the offline copy. */
export function tierEngine(options?: EngineOptions): Plugin[];
/** The security headers public/_headers gives every page, for `vite preview`. */
export function siteHeaders(root: string): Record<string, string>;
/** dist/sw.js's text for the build in `outDir`. */
export function buildServiceWorker(outDir: string, offline?: OfflineOptions): string;
