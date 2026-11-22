// @vitest-environment happy-dom
// The board on its own, in a stand-in DOM: mounting, drawing, moving, undo, selection, filtering, hooks, destroy.
// (Dragging and the keyboard are tested in the browser, in Tierinator's suite.)
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { type BoardHandle, type BoardOptions, mountBoard } from '../../src/board';
import type { BoardItem, BoardList, ItemSource } from '../../src/core';

const items: BoardItem[] = [
    { id: 1, name: 'Tea', code: '#1' },
    { id: 2, name: 'Coffee' },
    { id: 3, name: 'Cocoa' },
    { id: 4, name: 'Water' },
];
const source: ItemSource = { id: 'drinks', items: () => items, picture: (item) => ({ src: `/p/${item.id}.png` }) };

function newList(): BoardList {
    return {
        tiers: [
            { id: 's', label: 'S', subtitle: '', color: '#ff7f7f', items: [] },
            { id: 'a', label: 'A', subtitle: 'good', color: '#ffbf7f', items: [] },
        ],
        layout: 'tiers',
        chartColumns: 3,
        tileSize: 88,
        poolTileSize: 76,
        tileShape: 'square',
        tileFit: 'contain',
        labelMode: 'name',
        poolOrder: { by: 'added', seed: 1 },
        picks: {},
        notes: {},
        tags: {},
        selection: new Set(),
        selectionSource: null,
    };
}

let list: BoardList;
let board: BoardHandle;
let element: HTMLElement;
let pool: HTMLElement;
const ids = (area: Element) => [...area.querySelectorAll<HTMLElement>('.pi')].map((tile) => Number(tile.dataset.id));

function mount(extra: Partial<BoardOptions> = {}): void {
    document.body.replaceChildren();
    element = document.createElement('div');
    pool = document.createElement('div');
    document.body.append(element, pool);
    list = newList();
    board = mountBoard(element, { list, source, pool, ...extra });
    board.render();
}

beforeEach(() => mount());

describe('drawing', () => {
    it("puts the tile shape on its own elements, not the page's, so boards don't change each other", () => {
        list.tileShape = 'portrait';
        list.tileFit = 'cover';
        board.refit();
        for (const area of [element, pool]) {
            expect(area.style.getPropertyValue('--tile-hf')).not.toBe('');
            expect(area.style.getPropertyValue('--tile-fit')).toBe('cover');
        }
        expect(document.documentElement.style.getPropertyValue('--tile-fit')).toBe('');
    });

    it('draws a row per tier and every item in the pool, in the order added', () => {
        expect(element.querySelectorAll('.trow')).toHaveLength(2);
        expect(ids(pool)).toEqual([1, 2, 3, 4]);
        expect(element.querySelector('.tlbl-sub')?.textContent).toBe('good');
        expect(pool.querySelector('.pi .pname')?.textContent).toBe('Tea');
        expect(pool.querySelector('.pi .pnum')?.textContent).toBe('#1');
        expect(pool.querySelector('img')?.getAttribute('src')).toBe('/p/1.png');
    });

    it('lays a chart out as cells, and sets the label mode on both areas', () => {
        list.layout = 'chart';
        list.chartColumns = 4;
        board.render();
        expect(element.classList.contains('chart')).toBe(true);
        expect(element.style.getPropertyValue('--chart-cols')).toBe('4');
        expect(element.querySelector('.tgap')).toBeNull(); // no + between cells
        expect([element.dataset.labels, pool.dataset.labels]).toEqual(['name', 'name']);
    });

    it('orders the pool A to Z, and a shuffle is the same every time it is drawn', () => {
        board.setPoolOrder('az');
        expect(ids(pool)).toEqual([3, 2, 1, 4]);
        board.setPoolOrder('shuffled');
        const once = ids(pool);
        board.place();
        expect(ids(pool)).toEqual(once);
    });
});

describe('moving and undo', () => {
    it('moves items into a tier and back, one undo step each, and tells the app', () => {
        const onChange = vi.fn();
        mount({ onChange });
        board.move([2, 3], 's');
        expect(list.tiers[0]!.items).toEqual([2, 3]);
        expect(ids(element)).toEqual([2, 3]);
        expect(ids(pool)).toEqual([1, 4]);
        board.move([1], 's', { nextTo: 3 });
        expect(list.tiers[0]!.items).toEqual([2, 1, 3]);
        expect(onChange).toHaveBeenCalledTimes(2);
        expect(board.undo()).toBe(true);
        expect(list.tiers[0]!.items).toEqual([2, 3]);
        expect(board.redo()).toBe(true);
        expect(list.tiers[0]!.items).toEqual([2, 1, 3]);
        board.move([2], null);
        expect(board.rankedIds()).toEqual(new Set([1, 3]));
    });

    it('adds and moves tiers', () => {
        const onTierOpen = vi.fn();
        mount({ onTierOpen, palette: () => ['#123456'] });
        board.addTier();
        expect(list.tiers.map((tier) => tier.color)).toEqual(['#ff7f7f', '#ffbf7f', '#123456']);
        expect(onTierOpen).toHaveBeenCalledWith(list.tiers[2]!.id, expect.anything());
        board.moveTier('a', -1);
        expect(list.tiers.map((tier) => tier.id).slice(0, 2)).toEqual(['a', 's']);
        board.undo();
        board.undo();
        expect(list.tiers.map((tier) => tier.id)).toEqual(['s', 'a']);
    });
});

describe('selection and filtering', () => {
    it('selects with clicks (Shift for a range), moves the selection, and reports it', () => {
        const onSelect = vi.fn();
        mount({ onSelect });
        board.click({ id: 1, src: 'pool', shift: false, meta: false });
        board.click({ id: 3, src: 'pool', shift: true, meta: false });
        expect([...list.selection]).toEqual([1, 2, 3]);
        expect(pool.querySelectorAll('.pi.sel')).toHaveLength(3);
        expect(onSelect).toHaveBeenLastCalledWith(list.selection);
        board.moveSelectionTo('a');
        expect(list.tiers[1]!.items).toEqual([1, 2, 3]);
        expect(list.selection.size).toBe(0);
    });

    it('hides what the app hides everywhere, filters the pool, and marks ranked hits', () => {
        const hidden = new Set([4]);
        let query = '';
        const onFilter = vi.fn();
        mount({
            visible: (id) => !hidden.has(id),
            matches: (id) =>
                items
                    .find((item) => item.id === id)!
                    .name.toLowerCase()
                    .includes(query),
            searching: () => !!query,
            onFilter,
        });
        board.move([1], 's');
        expect(board.orderedIds('pool')).toEqual([2, 3]);
        query = 'co';
        board.filter();
        expect(board.orderedIds('pool')).toEqual([2, 3]);
        query = 'tea';
        board.filter();
        expect(board.orderedIds('pool')).toEqual([]);
        expect(element.querySelector('.pi.hit')).not.toBeNull();
        expect(onFilter).toHaveBeenLastCalledWith(expect.objectContaining({ poolShown: 0, ranked: 1, hits: [1] }));
        expect(board.nextHit()).toMatchObject({ id: 1, index: 0, total: 1, tier: { id: 's' } });
    });
});

describe('hooks and clean-up', () => {
    it('decorates new tiles, adds the app’s tier buttons, styles tiers', () => {
        mount({
            decorate: (tile, item) => tile.classList.add('dec-' + item.id),
            tierControls: () => [Object.assign(document.createElement('button'), { className: 'extra' })],
            tierStyle: () => ({ label: { background: '#000000', color: '#ffffff' }, row: 'rgb(1, 2, 3)' }),
        });
        expect(pool.querySelector('.dec-2')).not.toBeNull();
        expect(element.querySelectorAll('.tctrl .extra')).toHaveLength(2);
        expect(element.querySelector<HTMLElement>('.tcont')?.style.background).toBe('rgb(1, 2, 3)');
    });

    it('asks the source to repair a picture that fails, and finds ranked items the pool no longer offers', () => {
        const pictureFailed = vi.fn();
        const retired: BoardItem = { id: 9, name: 'Retired' };
        mount({ source: { ...source, item: (id) => (id === 9 ? retired : items.find((item) => item.id === id)), pictureFailed } });
        list.tiers[0]!.items = [9];
        board.place();
        expect(ids(element)).toEqual([9]);
        element.querySelector('img')!.dispatchEvent(new Event('error'));
        expect(pictureFailed).toHaveBeenCalledWith(retired, expect.anything());
    });

    it('sets theme tokens, and destroy takes everything off again', () => {
        board.setTheme({ '--cyan': '#00ffff', color: 'red' });
        expect(element.style.getPropertyValue('--cyan')).toBe('#00ffff');
        expect(element.style.getPropertyValue('color')).toBe('');
        board.destroy();
        expect(element.children).toHaveLength(0);
        expect(element.classList.contains('board-tiers')).toBe(false);
        expect(pool.classList.contains('board-pool')).toBe(false);
    });
});
