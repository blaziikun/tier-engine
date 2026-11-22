// The engine's own rules (docs/architecture.md {2}): markup only through safe/, nothing that runs strings as code,
// no inline handlers, the entry points import downwards only (safe ← core ← board, and safe ← core ← export), and nothing names an app or what
// its items are: the engine knows lists, tiers and items, never Pokémon or templates.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(new URL('../../', import.meta.url).pathname);
const SRC = join(ROOT, 'src');

function files(dir: string, pattern = /\.(ts|css|js)$/): string[] {
    return readdirSync(dir).flatMap((name) => {
        const path = join(dir, name);
        return statSync(path).isDirectory() ? files(path, pattern) : pattern.test(name) ? [path] : [];
    });
}
const sources = files(SRC, /\.ts$/);
const lines = (file: string) =>
    readFileSync(file, 'utf8')
        .split('\n')
        .map((text, i) => ({ text, at: `${relative(ROOT, file)}:${i + 1}` }));

/** The entry point a file belongs to: src/<box>/… */
const boxOf = (path: string): string => relative(SRC, path).split('/')[0] ?? '';
/** What each entry point may import from inside the engine. */
const ALLOWED: Record<string, string[]> = {
    safe: ['safe'],
    core: ['core'],
    board: ['board', 'core', 'safe'],
    export: ['export', 'core', 'safe'],
};

describe('the engine', () => {
    it('reads the files it checks (an empty list would pass anything)', () => {
        expect(sources.length).toBeGreaterThan(10);
        expect(sources.map(boxOf)).toEqual(expect.arrayContaining(['safe', 'core', 'board', 'export']));
    });

    it('has no raw HTML sinks outside safe/, and never runs text as code', () => {
        const offenders = sources
            .filter((file) => boxOf(file) !== 'safe')
            .flatMap(lines)
            .filter(({ text }) => /\.(innerHTML|outerHTML)\s*[+]?=|insertAdjacentHTML|document\.write|\beval\(|new Function\(/.test(text))
            .map(({ at }) => at);
        expect(offenders).toEqual([]);
    });

    it('has no inline event handlers in markup (a strict security policy blocks them)', () => {
        const offenders = sources.flatMap(lines).filter(({ text }) => /<[^>]+\son[a-z]+\s*=\s*["']/i.test(text));
        expect(offenders.map(({ at }) => at)).toEqual([]);
    });

    it('imports downwards only: safe ← core ← board and export, and no package at run time', () => {
        const broken: string[] = [];
        for (const file of sources)
            for (const { text, at } of lines(file)) {
                if (/^\s*(\/\/|\*|\/\*)/.test(text)) continue;
                for (const [, specifier = ''] of text.matchAll(/\bfrom\s*['"]([^'"]+)['"]|\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g)) {
                    if (!specifier.startsWith('.')) {
                        broken.push(`${at} imports the package '${specifier}'`);
                        continue;
                    }
                    const target = boxOf(resolve(dirname(file), specifier));
                    if (!ALLOWED[boxOf(file)]?.includes(target)) broken.push(`${at} (${boxOf(file)}) imports '${specifier}' (${target})`);
                }
            }
        expect(broken).toEqual([]);
    });

    it('names no app and no kind of item: everything app-specific comes in through options and hooks', () => {
        const named = files(SRC)
            .flatMap(lines)
            .filter(({ text }) => /pok[eé]|tierinator|pokerank|wiki|sprite studio|template gallery/i.test(text))
            .map(({ at, text }) => `${at}: ${text.trim()}`);
        expect(named).toEqual([]);
    });
});
