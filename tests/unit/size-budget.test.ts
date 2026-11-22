// The size budget: each entry point's source, gzipped, may grow at most a tenth past its size at 1.0.0.
// Comments count too, which is fine: an app's build drops them, so this is a ceiling, not the download. Raising a
// budget is a decision (say why in docs/decisions.md), not a reflex.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';

const SRC = new URL('../../src/', import.meta.url).pathname;
/** Gzipped bytes at 1.0.0, plus a tenth. */
const BUDGET = {
    safe: Math.round(1760 * 1.1),
    core: Math.round(19617 * 1.1),
    board: Math.round(19402 * 1.1),
    export: Math.round(12181 * 1.1),
} as const;

function sourceOf(folder: string): string {
    return readdirSync(folder)
        .sort()
        .map((name) => {
            const path = join(folder, name);
            return statSync(path).isDirectory() ? sourceOf(path) : readFileSync(path, 'utf8');
        })
        .join('');
}

describe('size budget', () => {
    for (const [entry, budget] of Object.entries(BUDGET))
        it(`tier-engine/${entry} stays under ${budget} bytes gzipped`, () => {
            expect(gzipSync(sourceOf(join(SRC, entry))).length).toBeLessThanOrEqual(budget);
        });
});
