// example/main.ts: the engine on a page of its own, as an app would mount it (an app imports 'tier-engine/board'
// and the rest; this page imports the source directly). Ten colours, three tiers, undo, and SVG / PNG export.
// Its browser tests are tests/browser.
import '../src/board/board.css';
import { mountBoard } from '../src/board';
import { type BoardItem, type BoardList, type ItemSource, isTileShape, readableTextOn, tileBox } from '../src/core';
import { type ExportInput, fontsReady, layoutExport, renderPng, renderSvg } from '../src/export';

const COLOURS: [string, string][] = [
    ['Red', '#e5484d'],
    ['Orange', '#f76b15'],
    ['Yellow', '#ffe629'],
    ['Green', '#30a46c'],
    ['Teal', '#12a594'],
    ['Blue', '#0090ff'],
    ['Indigo', '#3e63dd'],
    ['Violet', '#6e56cf'],
    ['Pink', '#d6409f'],
    ['Grey', '#8b8d98'],
];
const items: BoardItem[] = COLOURS.map(([name], index) => ({ id: index + 1, name }));
const swatch = (color: string): string =>
    `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect x="6" y="6" width="52" height="52" rx="12" fill="${color}"/></svg>`)}`;
const pictureOf = (id: number): string => swatch(COLOURS[id - 1]![1]);
const source: ItemSource = { id: 'colours', items: () => items, picture: (item) => ({ src: pictureOf(item.id) }) };

const list: BoardList = {
    tiers: [
        { id: 's', label: 'S', subtitle: '', color: '#ff7f7f', items: [] },
        { id: 'a', label: 'A', subtitle: 'good', color: '#ffbf7f', items: [] },
        { id: 'b', label: 'B', subtitle: '', color: '#ffdf7f', items: [] },
    ],
    layout: 'tiers',
    chartColumns: 3,
    tileSize: 64,
    poolTileSize: 56,
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

const byId = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const status = byId('status');
const board = mountBoard(byId('tiers'), {
    list,
    source,
    pool: byId('pool'),
    onChange: () => {
        status.textContent = `${board.rankedIds().size} of ${items.length} ranked`;
    },
    notify: (message) => {
        status.textContent = message;
    },
});
board.render();

// the app's shortcut layer: 1–9 send the selection (or the focused item, which the board selects) to that tier
document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey || !/^[1-9]$/.test(e.key)) return;
    const tier = list.tiers[Number(e.key) - 1];
    const moving = board.selectedInOrder();
    if (!tier || !moving.length) return;
    board.moveSelectionTo(tier.id);
    board.clearSelection();
    board.focus(moving[0]!);
});

byId('undo').onclick = () => board.undo();
byId('redo').onclick = () => board.redo();
byId<HTMLSelectElement>('layout').onchange = (e) => {
    list.layout = (e.target as HTMLSelectElement).value === 'chart' ? 'chart' : 'tiers';
    board.render();
};
byId<HTMLSelectElement>('shape').onchange = (e) => {
    const shape = (e.target as HTMLSelectElement).value;
    if (isTileShape(shape)) list.tileShape = shape;
    board.refit();
};

function exportInput(): ExportInput {
    return {
        tiers: list.tiers,
        pool: board.orderedIds('pool'),
        layout: list.layout === 'chart' ? 'chart' : 'rows',
        chartColumns: list.chartColumns,
        tile: tileBox(list.tileShape, list.tileSize),
        rowWidth: board.rowWidth(),
        includeEmptyTiers: true,
        title: 'Colours',
        credit: 'Made with tier-engine',
        caption: (id) => items[id - 1]!.name,
        note: null,
        name: (id) => items[id - 1]!.name,
        unrankedHeading: 'Not ranked',
        look: {
            background: '#0b0b0c',
            panel: '#141416',
            text: '#ededee',
            muted: '#8c8c93',
            headFamily: 'system-ui, sans-serif',
            uiFamily: 'system-ui, sans-serif',
            labelWeight: 700,
            titleWeight: 700,
            uiWeight: 400,
            labelSize: 17,
            letterSpacing: 0,
            labelWidth: 110,
            gap: 3,
            radius: 3,
            captionSize: 11,
            captionGap: 3,
            labelTextColor: (tier) => tier.textColor || readableTextOn(tier.color),
            rowBackground: () => '#141416',
        },
    };
}

function download(blob: Blob, name: string): void {
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

const run = { picture: (id: number) => ({ src: pictureOf(id), fit: list.tileFit }), detail: 128 };
byId('svg').onclick = async () => {
    const input = exportInput();
    await fontsReady(input.look);
    const svg = await renderSvg(layoutExport(input), input, { ...run, describe: (id) => items[id - 1]!.name, documentTitle: 'Colours' });
    if (svg) download(svg, 'colours.svg');
};
byId('png').onclick = async () => {
    const input = exportInput();
    await fontsReady(input.look);
    const result = await renderPng(layoutExport(input), input, run);
    if ('png' in result) download(result.png, 'colours.png');
    else status.textContent = result.failed === 'too big' ? 'Too big to export' : 'Export cancelled';
};
