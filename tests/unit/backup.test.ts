// The backup file: written with every list, read back with only what fits.
import { describe, expect, it } from 'vitest';
import { isBackup, readBackup, writeBackup } from '../../src/core';

const entry = { meta: { id: 'a1', name: 'Fruit' }, snap: { v: 10, tiers: [] }, imgs: { '2000000': 'data:image/png;base64,AAAA' } };

describe('a backup', () => {
    it('comes back as it went in, with the day it was made', () => {
        const written = writeBackup('tierlist', [entry], { theme: 'dark' }, { gallery: [] }, new Date('2026-11-22T10:00:00Z'));
        expect(written).toMatchObject({ app: 'tierlist', type: 'backup', v: 1, gallery: [] });
        const read = readBackup(JSON.parse(JSON.stringify(written)), ['theme']);
        expect(read).toMatchObject({ created: '2026-11-22', lists: [entry], settings: { theme: 'dark' } });
        expect(read?.raw.gallery).toEqual([]);
    });

    it("refuses app fields that would overwrite the backup's own", () => {
        expect(() => writeBackup('tierlist', [], {}, { lists: [] })).toThrow(/lists/);
    });

    it('is told apart from lists and packs', () => {
        expect(isBackup({ type: 'backup' })).toBe(true);
        expect(isBackup({ app: 'tierlist', tiers: [] })).toBe(false);
        expect(isBackup(null)).toBe(false);
        expect(readBackup({ type: 'tierpack' }, [])).toBeNull();
    });

    it('drops what a hostile file slips in: broken lists, web pictures, unasked settings, non-text values', () => {
        const read = readBackup(
            {
                type: 'backup',
                created: '<script>',
                lists: [
                    entry,
                    { meta: 'x', snap: {} },
                    { meta: {}, snap: null },
                    {
                        meta: {},
                        snap: {},
                        imgs: { a: 'https://tracker.example/p.png', ['k'.repeat(500)]: 'data:image/gif;base64,R0', b: 7 },
                    },
                ],
                settings: { theme: { evil: 1 }, palette: '["#fff"]', __proto__: 'x' },
            },
            ['theme', 'palette'],
        );
        expect(read?.created).toBe('');
        expect(read?.lists).toHaveLength(2);
        expect(Object.keys(read!.lists[1]!.imgs)).toEqual(['k'.repeat(80)]);
        expect(read?.settings).toEqual({ palette: '["#fff"]' });
    });
});
