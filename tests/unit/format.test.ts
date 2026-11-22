// The saved format: the board's fields round-trip, the app's own fields ride along untouched, older files still load
// (one test per entry in MIGRATIONS), and a hostile file can't break a list.
import { describe, expect, it } from 'vitest';
import {
    CHART_COLUMNS,
    FORMAT_VERSION,
    isPicturePath,
    MIGRATIONS,
    type ReadContext,
    readList,
    readPick,
    readTiers,
    type SavedBoard,
    writeList,
} from '../../src/core';

const known = new Set([1, 2, 3, 4, 2_000_000, 2_000_001]);
let fresh = 0;
const context: ReadContext = { itemExists: (id) => known.has(id), makeId: () => 'fresh' + fresh++ };

const board = (): SavedBoard => ({
    tiers: [
        { id: 'S', label: 'S', subtitle: 'the best', color: '#ff7f7f', textColor: '#000000', items: [1, 2] },
        { id: 'A', label: 'A', subtitle: '', color: '#ffbf7f', textColor: '', items: [2_000_000] },
    ],
    layout: 'chart',
    chartColumns: 4,
    tileSize: 96,
    poolTileSize: 60,
    tileShape: 'portrait',
    tileFit: 'cover',
    labelMode: 'both',
    poolOrder: { by: 'shuffled', seed: 12345 },
    picks: {
        1: { path: 'https://example.org/a.png', crop: { x: 1, y: 2, w: 3, h: 4, W: 10, H: 10 } },
        2000000: { path: 'custom', text: 1 },
    },
    notes: { 2: 'close call' },
    tags: { 1: ['red', 'fast'] },
});

describe('writing and reading a list', () => {
    it('round-trips every board field', () => {
        const stored = writeList(board(), 'My list');
        expect(stored).toMatchObject({ app: 'tierlist', v: FORMAT_VERSION, listName: 'My list' });
        const read = readList(JSON.parse(JSON.stringify(stored)), context);
        const { tiers, layout, chartColumns, tileSize, poolTileSize, tileShape, tileFit, labelMode, poolOrder, picks, notes, tags } = read;
        expect({
            tiers,
            layout,
            chartColumns,
            tileSize,
            poolTileSize,
            tileShape,
            tileFit,
            labelMode,
            poolOrder,
            picks,
            notes,
            tags,
        }).toEqual(board());
        expect(read.listName).toBe('My list');
        expect(read.version).toBe(10);
    });

    it("keeps an app's own fields beside the board's, and hands them back unchecked", () => {
        const stored = writeList(board(), 'Mine', { kind: 'custom', grids: [{ id: 'g' }] });
        const read = readList(JSON.parse(JSON.stringify(stored)), context);
        expect(read.raw.kind).toBe('custom');
        expect(read.raw.grids).toEqual([{ id: 'g' }]);
    });

    it("refuses an app field that would overwrite one of the board's", () => {
        expect(() => writeList(board(), 'Mine', { tiers: [] })).toThrow(/board's stored keys/);
    });
});

describe('older files (every migration still loads)', () => {
    it('lists each difference once', () => {
        expect(new Set(MIGRATIONS.map((m) => m.key)).size).toBe(MIGRATIONS.length);
    });
    it('names: the true/false switch becomes a label mode', () => {
        expect(readList({ names: true }, context).labelMode).toBe('name');
        expect(readList({ names: false }, context).labelMode).toBe('off');
        expect(readList({ names: true, lbl: 'num' }, context).labelMode).toBe('num');
    });
    it('chosenSprites: chosen addresses are handed to the app, checked', () => {
        const read = readList(
            { chosenSprites: { 1: 'https://example.org/x.png', 2: '../../etc', 99: 'https://example.org/y.png' } },
            context,
        );
        expect(read.chosenPictures).toEqual({ 1: 'https://example.org/x.png' });
    });
    it('tiers[].sub/text and subtitle/textColor are both read', () => {
        const [short, long] = readTiers(
            [
                { id: 'a', label: 'A', sub: 'short', text: '#112233', color: '#445566', items: [1] },
                { id: 'b', label: 'B', subtitle: 'long', textColor: '#aabbcc', color: '#445566', items: [2] },
            ],
            context,
        );
        expect([short?.subtitle, short?.textColor, long?.subtitle, long?.textColor]).toEqual(['short', '#112233', 'long', '#aabbcc']);
    });
    it('lay, cols, shape, fit, psort, pseed: missing in older files, so the app keeps its defaults', () => {
        const read = readList({ app: 'tierlist', v: 10, tiers: [] }, context);
        for (const field of ['layout', 'chartColumns', 'tileShape', 'tileFit', 'poolOrder'] as const) expect(read[field]).toBeUndefined();
    });
});

describe('hostile files', () => {
    it('drops unknown items, duplicates and bad colours from tiers', () => {
        const [tier] = readTiers([{ id: 'x', label: 'X', color: 'red; background:url(x)', items: [1, 1, 999, '2', 3] }], context);
        expect(tier?.items).toEqual([1, 2, 3]);
        expect(tier?.color).toBe('#888888');
    });
    it('gives a repeated tier id a fresh one, and keeps at most 100 tiers', () => {
        const tiers = readTiers(
            Array.from({ length: 150 }, () => ({ id: 'same', label: 'L', color: '#000000', items: [] })),
            context,
        );
        expect(tiers).toHaveLength(100);
        expect(new Set(tiers.map((t) => t.id)).size).toBe(100);
    });
    it('clamps sizes, columns and seeds, and survives garbage', () => {
        const read = readList(
            { sz: 99999, psz: -4, cols: 40, psort: 'shuffled', pseed: 1.5, lay: 'spiral', shape: 'circle', fit: 'stretch' },
            context,
        );
        expect(read.tileSize).toBe(160);
        expect(read.poolTileSize).toBe(24);
        expect(read.chartColumns).toBe(CHART_COLUMNS.max);
        expect(read.poolOrder).toEqual({ by: 'shuffled', seed: 1 });
        expect([read.layout, read.tileShape, read.tileFit]).toEqual([undefined, undefined, undefined]);
        for (const junk of [null, 42, 'text', [], { tiers: 'no' }]) expect(() => readList(junk, context)).not.toThrow();
    });
    it('keeps notes, tags and picks only for items in the list, cut to size', () => {
        const read = readList(
            {
                notes: { 1: 'x'.repeat(500), 999: 'gone', 2: '   ' },
                tags: { 1: ['a'.repeat(30), '', 7], 999: ['gone'] },
                picks: {
                    1: { path: 'go:1', evil: '<script>' },
                    3: { path: '../../../secret' },
                    999: { path: 'https://example.org/x.png' },
                },
            },
            context,
        );
        expect(read.notes).toEqual({ 1: 'x'.repeat(300) });
        expect(read.tags).toEqual({ 1: ['a'.repeat(24), '7'] });
        expect(read.picks).toEqual({ 1: { path: 'go:1' } });
    });
    it('keeps only the known parts of a pick', () => {
        expect(readPick({ path: 'p', ck: 'yes', trim: 'no', anim: true, text: 1, remote: 'http://insecure', crop: { x: 1 } })).toEqual({
            path: 'p',
            ck: 1,
            anim: true,
            text: 1,
        });
    });
    it('refuses picture paths that walk out of a collection, written plainly or encoded', () => {
        for (const bad of [
            '../x',
            'a/../../x',
            'go:..',
            'a\\b',
            '/etc/passwd',
            'a%2e%2e/b',
            'a%2Fb',
            'javascript://x',
            'a?b',
            'https://a b',
        ])
            expect(isPicturePath(bad), bad).toBe(false);
        for (const good of ['other/home/25.png', 'go:25', 'lore:abc', 'https://example.org/a.png', 'custom'])
            expect(isPicturePath(good), good).toBe(true);
    });
});
