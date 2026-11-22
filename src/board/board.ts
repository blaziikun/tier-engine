// src/board/board.ts  (tier-engine/board)
// ─────────────────────────────────────────────────────────────────────────────
//  The tier board: tier rows (or a chart's cells), the pool, every item's
//  tile, selection, filtering, and adding and moving tiers. Dragging is
//  drag.ts; keyboard moves are keys.ts. An app mounts one into an element and
//  hands it a list (changed in place), an item source and its hooks:
//
//    const board = mountBoard(byId('tiers'), { list, source, pool: byId('pool'), onChange: save });
//    board.move([25], 'S');  board.undo();  board.destroy();
//
//  Everything with a menu or a window (the tier editor, search box, toasts)
//  belongs to the app; the board asks for it through hooks.
// ─────────────────────────────────────────────────────────────────────────────
import {
    type BoardItem,
    type BoardList,
    createHistory,
    cropView,
    type History,
    type ItemId,
    type ItemSource,
    type Picture,
    readableTextOn,
    type Tier,
    type TileFit,
    type TileShape,
    tileRatio,
    tileScale,
} from '../core';
import { html, setHtml } from '../safe';
import { setupPointer } from './drag';
import { setupKeys } from './keys';
import { insertionIndex } from './placement';
import { nextShuffleSeed, orderPool } from './pool-order';

/** How a tier looks: its label's colours and its row's background. */
export interface TierStyle {
    label: { background: string; color: string };
    row: string;
}

/** What filtering showed: counts for the app's own lines, and the ranked items that match a search. */
export interface FilterResult {
    /** Items shown in the pool. */
    poolShown: number;
    /** Items in tiers, and how many of them are shown (not hidden by `visible`). */
    ranked: number;
    rankedShown: number;
    /** Shown items per tier id. */
    shownByTier: Map<string, number>;
    /** Ranked items matching `matches` while `searching()`, top to bottom. */
    hits: ItemId[];
}

/** Where a click landed and with which keys: the board's selection rules use it. */
export interface TileClick {
    id: ItemId;
    /** 'pool' or a tier id. */
    src: string;
    shift: boolean;
    meta: boolean;
}

export interface BoardOptions {
    /** The list to draw; the board changes its tiers, selection and pool order in place. */
    list: BoardList;
    /** Where the items and their pictures come from. */
    source: ItemSource;
    /** Where unranked items go. Default: an element the board adds after `element`. */
    pool?: HTMLElement;
    /** The area that takes tiles dropped back to the pool (the pool and its header, say). Default: `pool`. */
    poolArea?: HTMLElement;
    /** The name that follows a drag, and the selection box's outline (default: made by the board, styled by board.css). */
    ghost?: HTMLElement;
    marquee?: HTMLElement;
    /** The map the board keeps each item's tile in; pass one to read tiles from it directly. Default: the board's own. */
    tileStore?: Map<ItemId, HTMLElement>;
    /** An element of the app's kept first inside the tiers area when it's redrawn (a status line, say). */
    tiersHeader?: HTMLElement;
    /** The undo history changes go into. Pass the app's when it records its own fields too; default: the board's own. */
    history?: History;
    /** Colours for new tiers, in order (the next unused one is taken). */
    palette?: () => readonly string[];
    /** What to call items in its own words: "item", "items", or a word of its own… */
    itemWord?: (count: number) => string;
    /** False hides an item everywhere, pool and tiers (a focus the app offers). Default: everything shown. */
    visible?: (id: ItemId) => boolean;
    /** A search or filter: false hides an item in the pool, true marks a ranked item as a hit while `searching()`. */
    matches?: (id: ItemId) => boolean;
    searching?: () => boolean;
    /** False while another of the app's views covers the board: pointer and keys leave it alone. */
    active?: () => boolean;
    /** How a tier looks (default: its colour, readable text, no row tint). */
    tierStyle?: (tier: Tier) => TierStyle;
    /** Adds to a new tile (badges, dots). */
    decorate?: (tile: HTMLElement, item: BoardItem) => void;
    /** Extra buttons after a tier's own (↑ ↓ ✎). */
    tierControls?: (tier: Tier) => HTMLElement[];
    /** A tile's picture loaded (the app can mark pixel art, say). */
    pictureLoaded?: (image: HTMLImageElement) => void;
    /** After the board changed the list (moves, tiers, the pool's order): save it. */
    onChange?: () => void;
    /** The selection changed. */
    onSelect?: (selection: ReadonlySet<ItemId>) => void;
    /** A tile asked to be opened: right-click, the Menu key or Shift+F10. */
    onTileOpen?: (id: ItemId, tile: HTMLElement) => void;
    /** A tier asked to be edited: its ✎, its label clicked with nothing selected, or a tier just added. */
    onTierOpen?: (tierId: string, anchor: Element) => void;
    /** Filtering ran: what it showed. */
    onFilter?: (result: FilterResult) => void;
    /** Every tile was put in place (after a move, a new list, a new pool order). */
    onPlace?: () => void;
    /** Dragging or a selection box started (the app hides its hover tips). */
    onDragStart?: () => void;
    /** A short message for the person ("Moved to A"); the app shows it its way. */
    notify?: (message: string) => void;
}

export interface BoardHandle {
    /** Moves items to a tier (or the pool, with null), next to a shown item or after the last shown one; one undo step. */
    move(ids: readonly ItemId[], tierId: string | null, anchor?: { nextTo?: ItemId; after?: boolean }): void;
    undo(): boolean;
    redo(): boolean;
    /** Selects these items (replacing the selection); `source` says where they are ('pool', a tier id or 'mixed'). */
    select(ids: Iterable<ItemId>, source?: string | null): void;
    clearSelection(): void;
    /** Every shown item in the tiers, or in the pool. */
    selectAllIn(area: 'tiers' | 'pool'): void;
    /** The selection in screen order (tiers top to bottom, then the pool). */
    selectedInOrder(): ItemId[];
    /** A click on a tile, as the pointer and keys send them (the selection rules: Shift ranges, Ctrl/⌘ adds). */
    click(click: TileClick): void;
    /** Moves the selection to a tier (after the last shown item). */
    moveSelectionTo(tierId: string): void;
    /** Adds a tier at the end, or at `at` (the + between two tiers), and opens it (onTierOpen). */
    addTier(at?: number): void;
    /** Puts the keyboard's focus back on an item's tile once it's drawn (after the tiles were redrawn). */
    focus(id: ItemId): void;
    /** Moves a tier one place up (-1) or down (+1). */
    moveTier(tierId: string, direction: number): void;
    /** A tier in the next colour of the palette. */
    newTier(paletteIndex: number, label?: string): Tier;
    /** Rebuilds every tier row and puts the tiles in place. */
    render(): void;
    /** Puts every tile where it belongs (after the list changed). */
    place(): void;
    /** Applies `visible` and `matches` again (after a search or focus changed). */
    filter(): void;
    /** The next (or previous) search hit: scrolled to and flashed. Its place among the hits, or null with none. */
    nextHit(direction?: number): { id: ItemId; index: number; total: number; tier: Tier | undefined } | null;
    /** Chooses the pool's order; Shuffled again deals a new shuffle. Returns true if it reshuffled. */
    setPoolOrder(by: BoardList['poolOrder']['by']): boolean;
    /** Lays the board out again for the list's layout, labels, tile shape and fit. */
    refit(): void;
    /** Sets theme tokens (CSS custom properties, "--name": value) on the board's elements. */
    setTheme(tokens: Readonly<Record<string, string>>): void;
    /** The item's tile (made the first time it's needed), or undefined if the source has no such item. */
    tile(id: ItemId): HTMLElement | undefined;
    /** Every tile made so far. */
    tiles(): ReadonlyMap<ItemId, HTMLElement>;
    /** Shows the item's picture again (after its pick changed). */
    refreshPicture(id: ItemId): void;
    /** Fits the item's picture to its tile again (after its crop changed), without loading it again. */
    fit(id: ItemId): void;
    /** Ids in screen order for 'pool' or a tier (shown ones only). */
    orderedIds(where: string): ItemId[];
    /** Every item that's in a tier. */
    rankedIds(): Set<ItemId>;
    /** Takes items out of every tier (they go back to the pool when the board is placed). */
    removeFromTiers(ids: Iterable<ItemId>): void;
    /** Whether an item is shown (options.visible). */
    isVisible(id: ItemId): boolean;
    /** Width of a tier row's tile area, or of a chart cell's, when last measured. */
    rowWidth(): number;
    measure(): void;
    /** Which area the pointer was last over, for "select all". */
    pointerArea(): 'tiers' | 'pool';
    isDragging(): boolean;
    /** The ranking the board counts: shown in tiers / every item the source has. */
    counts(): { ranked: number; total: number };
    /** Forgets every tile and empties both areas (another list is about to open). */
    reset(): void;
    destroy(): void;
}

/** The board's own state, shared with drag.ts and keys.ts. */
export interface Board {
    element: HTMLElement;
    pool: HTMLElement;
    poolArea: HTMLElement;
    list: BoardList;
    options: BoardOptions;
    history: History;
    tileById: Map<ItemId, HTMLElement>;
    itemById: Map<ItemId, BoardItem>;
    rowWidth: number;
    pointerArea: 'tiers' | 'pool';
    dragging: boolean;
    hits: ItemId[];
    hitIndex: number;
    lastClick: { id: ItemId; src: string } | null;
    cleanups: (() => void)[];
    handle: BoardHandle;
}

const defaultTierStyle = (tier: Tier): TierStyle => ({
    label: { background: tier.color, color: tier.textColor || readableTextOn(tier.color) },
    row: '',
});

const DEFAULT_PALETTE = ['#ff7f7f', '#ffbf7f', '#ffdf7f', '#ffff7f', '#bfff7f', '#7fff7f', '#7fffff', '#7fbfff', '#7f7fff', '#ff7fff'];

/** Mounts a board into `element` (the tiers area). One list per board; mount another board for another list. */
export function mountBoard(element: HTMLElement, options: BoardOptions): BoardHandle {
    const list = options.list;
    let pool = options.pool;
    const ownPool = !pool;
    if (!pool) {
        pool = document.createElement('div');
        element.after(pool);
    }
    pool.classList.add('board-pool');
    const history =
        options.history ??
        createHistory({
            capture: () => ({
                tiers: list.tiers,
                layout: list.layout,
                columns: list.chartColumns,
                shape: list.tileShape,
                fit: list.tileFit,
            }),
            restore: (saved) => {
                const s = saved as Partial<Pick<BoardList, 'tiers' | 'layout'>> & {
                    columns?: number;
                    shape?: BoardList['tileShape'];
                    fit?: TileFit;
                };
                if (Array.isArray(s?.tiers)) list.tiers = s.tiers;
                if (s?.layout) list.layout = s.layout;
                if (s?.columns) list.chartColumns = s.columns;
                if (s?.shape) list.tileShape = s.shape;
                if (s?.fit) list.tileFit = s.fit;
            },
        });
    const board: Board = {
        element,
        pool,
        poolArea: options.poolArea ?? pool,
        list,
        options,
        history,
        tileById: options.tileStore ?? new Map(),
        itemById: new Map(),
        rowWidth: 0,
        pointerArea: 'pool',
        dragging: false,
        hits: [],
        hitIndex: -1,
        lastClick: null,
        cleanups: [],
        handle: undefined as unknown as BoardHandle,
    };
    board.handle = makeHandle(board, ownPool);
    element.classList.add('board-tiers');
    element.addEventListener('click', onGapClick);
    board.cleanups.push(() => element.removeEventListener('click', onGapClick));
    function onGapClick(e: MouseEvent): void {
        const add = (e.target as HTMLElement).closest<HTMLElement>('.tadd');
        if (add && element.contains(add)) board.handle.addTier(Number(add.dataset.at));
    }
    setupPointer(board);
    setupKeys(board);
    return board.handle;
}

// ═════════════════════════════════════════════════════════════════════════════
//  TILES
// ═════════════════════════════════════════════════════════════════════════════

function itemFor(board: Board, id: ItemId): BoardItem | undefined {
    const known = board.options.source.item?.(id);
    if (known) return known;
    let item = board.itemById.get(id);
    if (!item) {
        rebuildItemIndex(board);
        item = board.itemById.get(id);
    }
    return item;
}

function rebuildItemIndex(board: Board): void {
    board.itemById.clear();
    for (const item of board.options.source.items()) board.itemById.set(item.id, item);
}

/** An item's tile: picture + code/name label. A picture that fails goes to the source to repair. */
function createTile(board: Board, item: BoardItem): HTMLElement {
    const tile = document.createElement('div');
    tile.className = 'pi';
    tile.dataset.id = String(item.id);
    // focusable for keyboard ranking (keys.ts); Tab lands on the area, arrows move between tiles
    tile.tabIndex = -1;
    tile.setAttribute('role', 'button');
    tile.setAttribute('aria-label', item.name);
    const frame = document.createElement('div');
    frame.className = 'pimg';
    const img = document.createElement('img');
    img.alt = '';
    img.draggable = false;
    img.decoding = 'async';
    img.loading = 'lazy'; // a big pool is a thousand tiles or more: only the ones scrolled into view download
    img.addEventListener('load', () => board.options.pictureLoaded?.(img));
    img.addEventListener('error', () => {
        if (!img.getAttribute('src')) return;
        const current = itemFor(board, Number(tile.dataset.id));
        if (current) board.options.source.pictureFailed?.(current, img);
    });
    frame.append(img);
    const label = document.createElement('span');
    label.className = 'pl';
    setHtml(label, html`<span class="pnum">${item.code ?? ''}</span><span class="pname">${item.name}</span>`);
    tile.append(frame, label);
    board.tileById.set(item.id, tile);
    setTileImage(board, item.id, tile);
    board.options.decorate?.(tile, item);
    return tile;
}

/** Shows the item's picture on its tile. A fresh picture forgets whatever the source marked on the image before. */
function setTileImage(board: Board, id: ItemId, tile = board.tileById.get(id)): void {
    const item = itemFor(board, id);
    if (!tile || !item) return;
    const img = tile.querySelector('img')!;
    for (const key of Object.keys(img.dataset)) delete img.dataset[key];
    img.src = board.options.source.picture(item).src;
    fitTilePicture(board, id, tile);
}

/**
 * Fits a picture to a tile's shape, whole or filling it. Pictures with a crop box (animated ones, which can't be
 * re-encoded, and sprites padded with space) are scaled and shifted inside the tile instead; pictures marked whole
 * (text tiles) always show whole, as their words would be cut off. `img` sits in a frame of the tile's shape
 * (board.css: .pimg); an app can use this for its own frames too.
 */
export function fitPictureInTile(img: HTMLImageElement, picture: Picture, shape: TileShape, fit: TileFit): void {
    img.classList.toggle('whole', !!picture.whole);
    const crop = picture.crop;
    if (!crop) {
        img.classList.remove('crop');
        img.style.cssText = '';
        return;
    }
    const view = cropView(crop, tileRatio(shape), picture.whole ? 'contain' : fit);
    img.classList.add('crop');
    img.style.width = (crop.W / view.width) * 100 + '%';
    img.style.height = (crop.H / view.height) * 100 + '%';
    img.style.left = (-view.x / view.width) * 100 + '%';
    img.style.top = (-view.y / view.height) * 100 + '%';
}

function fitTilePicture(board: Board, id: ItemId, tile: HTMLElement): void {
    const item = itemFor(board, id);
    if (!item) return;
    fitPictureInTile(tile.querySelector('img')!, board.options.source.picture(item), board.list.tileShape, board.list.tileFit);
}

function ensureTile(board: Board, id: ItemId): HTMLElement | undefined {
    const tile = board.tileById.get(id);
    if (tile) return tile;
    const item = itemFor(board, id);
    return item ? createTile(board, item) : undefined;
}

// ═════════════════════════════════════════════════════════════════════════════
//  TIERS AND POOL
// ═════════════════════════════════════════════════════════════════════════════

const isChart = (board: Board): boolean => board.list.layout === 'chart';

/** The list's layout and tile shape, as a class and CSS variables (board.css sizes every tile with them). */
function applyLayout(board: Board): void {
    const { element, list } = board;
    element.classList.toggle('chart', isChart(board));
    element.style.setProperty('--chart-cols', String(list.chartColumns));
    element.dataset.labels = board.pool.dataset.labels = list.labelMode;
    // on the board's own elements, so two boards on one page can have different shapes
    const scale = tileScale(list.tileShape);
    for (const { style } of [element, board.pool]) {
        style.setProperty('--tile-wf', String(scale.width));
        style.setProperty('--tile-hf', String(scale.height));
        style.setProperty('--tile-ratio', String(tileRatio(list.tileShape)));
        style.setProperty('--tile-fit', list.tileFit);
    }
}

function renderTiers(board: Board): void {
    const { element, list, options } = board;
    element.replaceChildren(...(options.tiersHeader ? [options.tiersHeader] : []));
    applyLayout(board);
    // a chart adds cells with Add tier: a + between cells would take up a grid cell of its own
    const chart = isChart(board);
    const gap = (at: number) => {
        const gapElement = document.createElement('div');
        gapElement.className = 'tgap';
        setHtml(gapElement, html`<button class="tadd" data-at="${at}" title="Add a tier here">+</button>`);
        return gapElement;
    };
    list.tiers.forEach((tier, i) => {
        if (!chart) element.append(gap(i));
        element.append(tierRow(board, tier, i));
    });
    if (!chart) element.append(gap(list.tiers.length));
    placeAllTiles(board);
}

function tierRow(board: Board, tier: Tier, index: number): HTMLElement {
    const { list, options } = board;
    const style = (options.tierStyle ?? defaultTierStyle)(tier);
    const row = document.createElement('div');
    row.className = 'trow';
    row.dataset.tid = tier.id;
    const label = document.createElement('div');
    label.className = 'tlbl';
    label.style.background = style.label.background;
    label.style.color = style.label.color;
    label.title = `Click to edit the tier, or to move the selected ${word(board, 2)} here`;
    setHtml(label, html`<div class="tlbl-main">${tier.label}</div>${tier.subtitle && html`<div class="tlbl-sub">${tier.subtitle}</div>`}`);
    label.onclick = () => {
        if (list.selection.size) board.handle.moveSelectionTo(tier.id);
        else options.onTierOpen?.(tier.id, label);
    };
    const tiles = document.createElement('div');
    tiles.className = 'tcont';
    tiles.dataset.tid = tier.id;
    tiles.style.background = style.row;
    const controls = document.createElement('div');
    controls.className = 'tctrl';
    const button = (text: string, title: string, disabled: boolean, onClick: (e: MouseEvent) => void) => {
        const b = document.createElement('button');
        b.textContent = text;
        b.title = title;
        b.disabled = disabled;
        b.onclick = onClick;
        return b;
    };
    const chart = isChart(board);
    controls.append(
        button(chart ? '←' : '↑', chart ? 'Move back one cell' : 'Move up', index === 0, () => board.handle.moveTier(tier.id, -1)),
        button(chart ? '→' : '↓', chart ? 'Move on one cell' : 'Move down', index === list.tiers.length - 1, () =>
            board.handle.moveTier(tier.id, 1),
        ),
        button('✎', 'Edit', false, (e) => options.onTierOpen?.(tier.id, e.currentTarget as Element)),
        ...(options.tierControls?.(tier) ?? []),
    );
    row.append(label, tiles, controls);
    return row;
}

/** Puts every tile where it belongs: in its tier, or in the pool. */
function placeAllTiles(board: Board): void {
    const { element, list, pool, options } = board;
    rebuildItemIndex(board);
    const ranked = new Set<ItemId>();
    for (const tier of list.tiers) {
        const row = element.querySelector(`.tcont[data-tid="${CSS.escape(tier.id)}"]`);
        if (!row) continue;
        const tiles = document.createDocumentFragment();
        for (const id of tier.items) {
            const tile = ensureTile(board, id);
            if (!tile) continue;
            tile.dataset.src = tier.id;
            tiles.append(tile);
            ranked.add(id);
        }
        row.replaceChildren(tiles);
    }
    const poolTiles = document.createDocumentFragment();
    const unranked = options.source.items().filter((item) => !ranked.has(item.id));
    for (const item of orderPool(unranked, list.poolOrder)) {
        const tile = ensureTile(board, item.id)!;
        tile.dataset.src = 'pool';
        poolTiles.append(tile);
    }
    pool.replaceChildren(poolTiles);
    applyFilters(board);
    syncSelection(board);
    measureRowWidth(board);
    options.onPlace?.();
}

/** Moving a tile re-places every tile, which drops focus: put it back on the same item, once it's drawn. */
export function refocus(board: Board, id: ItemId): void {
    requestAnimationFrame(() => {
        const tile = board.tileById.get(id);
        if (!tile) return;
        tile.focus();
        tile.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    });
}

function measureRowWidth(board: Board): void {
    const row = board.element.querySelector<HTMLElement>('.tcont');
    if (row && row.clientWidth > 0) board.rowWidth = row.clientWidth;
}

const word = (board: Board, count: number): string => board.options.itemWord?.(count) ?? (count === 1 ? 'item' : 'items');
export const isShown = (board: Board, id: ItemId): boolean => board.options.visible?.(id) ?? true;

/** Applies `visible` and `matches` to the pool and the tiers, and marks ranked search hits. */
function applyFilters(board: Board): void {
    const { list, options, pool, tileById } = board;
    const matches = (id: ItemId): boolean => isShown(board, id) && (options.matches?.(id) ?? true);
    let poolShown = 0;
    for (const tile of pool.children as HTMLCollectionOf<HTMLElement>) {
        const show = matches(Number(tile.dataset.id));
        tile.style.display = show ? '' : 'none';
        if (show) poolShown++;
    }
    board.hits = [];
    const searching = options.searching?.() ?? false;
    let ranked = 0;
    let rankedShown = 0;
    const shownByTier = new Map<string, number>();
    for (const tier of list.tiers) {
        let shownHere = 0;
        for (const id of tier.items) {
            const tile = tileById.get(id);
            const show = isShown(board, id);
            ranked++;
            if (show) shownHere++;
            if (tile) tile.style.display = show ? '' : 'none';
            const hit = searching && matches(id);
            tile?.classList.toggle('hit', hit);
            if (hit) board.hits.push(id);
        }
        rankedShown += shownHere;
        shownByTier.set(tier.id, shownHere);
    }
    board.hitIndex = -1;
    options.onFilter?.({ poolShown, ranked, rankedShown, shownByTier, hits: board.hits });
}

// ═════════════════════════════════════════════════════════════════════════════
//  SELECTION
// ═════════════════════════════════════════════════════════════════════════════

function orderedIds(board: Board, where: string): ItemId[] {
    if (where === 'pool')
        return [...(board.pool.children as HTMLCollectionOf<HTMLElement>)]
            .filter((tile) => tile.style.display !== 'none')
            .map((tile) => Number(tile.dataset.id));
    return (board.list.tiers.find((t) => t.id === where)?.items || []).filter((id) => isShown(board, id));
}

/** Click selects/unselects; Shift+click selects a range; Ctrl/⌘+click adds from another area. */
function onTileClick(board: Board, click: TileClick): void {
    const { list } = board;
    const { id, src } = click;
    const last = board.lastClick;
    if (click.shift && last && last.src === src && list.selectionSource === src) {
        const ids = orderedIds(board, src);
        let from = ids.indexOf(last.id);
        let to = ids.indexOf(id);
        if (from > to) [from, to] = [to, from];
        // the range's start may have been hidden since: then just this one
        if (from < 0) list.selection.add(id);
        else
            ids.slice(from, to + 1).forEach((x) => {
                list.selection.add(x);
            });
    } else if (list.selection.has(id)) {
        list.selection.delete(id);
        if (!list.selection.size) list.selectionSource = null;
    } else {
        if (list.selectionSource && list.selectionSource !== src && list.selectionSource !== 'mixed' && !click.meta) {
            list.selection.clear();
            list.selectionSource = null;
        }
        list.selection.add(id);
        list.selectionSource = !list.selectionSource || list.selectionSource === src ? src : 'mixed';
    }
    board.lastClick = { id, src };
    syncSelection(board);
}

/** Shows the selection on the tiles, and tells the app. */
export function syncSelection(board: Board): void {
    const { list } = board;
    board.tileById.forEach((tile, id) => {
        const selected = list.selection.has(id);
        tile.classList.toggle('sel', selected);
        tile.ariaPressed = String(selected);
    });
    board.options.onSelect?.(list.selection);
}

function selectedInOrder(board: Board): ItemId[] {
    const { list } = board;
    const onScreen = [...board.element.querySelectorAll<HTMLElement>('.pi'), ...board.pool.querySelectorAll<HTMLElement>('.pi')]
        .map((tile) => Number(tile.dataset.id))
        .filter((id) => list.selection.has(id));
    const seen = new Set(onScreen);
    return [...onScreen, ...[...list.selection].filter((id) => !seen.has(id))];
}

const removeFromTiers = (board: Board, ids: Iterable<ItemId>): void => {
    const remove = new Set(ids);
    for (const tier of board.list.tiers) tier.items = tier.items.filter((id) => !remove.has(id));
};

/** Moves items to a tier (or the pool), recorded as one undo step, saved, and drawn. */
export function moveItems(
    board: Board,
    ids: readonly ItemId[],
    tierId: string | null,
    anchor: { nextTo?: ItemId; after?: boolean } = {},
    { keepSelection = false } = {},
): void {
    board.history.push();
    removeFromTiers(board, ids);
    const tier = tierId == null ? undefined : board.list.tiers.find((t) => t.id === tierId);
    // beside the shown item dropped against; what `visible` hides keeps its place
    if (tier)
        tier.items.splice(
            insertionIndex(tier.items, (id) => isShown(board, id), anchor),
            0,
            ...ids,
        );
    if (!keepSelection) {
        board.list.selection.clear();
        board.list.selectionSource = null;
    }
    placeAllTiles(board);
    board.options.onChange?.();
}

// ═════════════════════════════════════════════════════════════════════════════
//  THE HANDLE
// ═════════════════════════════════════════════════════════════════════════════

function makeHandle(board: Board, ownPool: boolean): BoardHandle {
    const { list, options } = board;
    const changed = () => options.onChange?.();
    const palette = () => {
        const colours = options.palette?.() ?? [];
        return colours.length ? colours : DEFAULT_PALETTE;
    };
    const newTier = (paletteIndex: number, label = 'New tier'): Tier => {
        const colours = palette();
        return {
            id: Math.random().toString(36).slice(2, 9),
            label,
            subtitle: '',
            color: colours[paletteIndex % colours.length]!,
            textColor: '',
            items: [],
        };
    };
    const restored = (result: { done: boolean }): boolean => {
        if (!result.done) return false;
        list.selection.clear();
        list.selectionSource = null;
        renderTiers(board);
        changed();
        return true;
    };
    const handle: BoardHandle = {
        move: (ids, tierId, anchor) => moveItems(board, ids, tierId, anchor),
        undo: () => restored(board.history.undo()),
        redo: () => restored(board.history.redo()),
        select(ids, source = 'mixed') {
            list.selection = new Set(ids);
            list.selectionSource = list.selection.size ? source : null;
            syncSelection(board);
        },
        clearSelection() {
            list.selection.clear();
            list.selectionSource = null;
            syncSelection(board);
        },
        selectAllIn(area) {
            list.selection.clear();
            if (area === 'tiers') {
                for (const tier of list.tiers) for (const id of tier.items) if (isShown(board, id)) list.selection.add(id);
                list.selectionSource = 'mixed';
            } else {
                for (const id of orderedIds(board, 'pool')) list.selection.add(id);
                list.selectionSource = 'pool';
            }
            if (!list.selection.size) list.selectionSource = null;
            syncSelection(board);
        },
        selectedInOrder: () => selectedInOrder(board),
        click: (click) => onTileClick(board, click),
        moveSelectionTo(tierId) {
            moveItems(board, selectedInOrder(board), tierId);
        },
        addTier(at) {
            board.history.push();
            // at the end: the next colour; between two tiers: three on, so it stands out from its neighbours
            const tier = at == null ? newTier(list.tiers.length) : newTier(at + 3);
            list.tiers.splice(at ?? list.tiers.length, 0, tier);
            renderTiers(board);
            changed();
            const label = board.element.querySelector(`.trow[data-tid="${CSS.escape(tier.id)}"] .tlbl`);
            if (!label) return;
            if (at == null) label.closest('.trow')?.scrollIntoView({ block: 'nearest' });
            options.onTierOpen?.(tier.id, label);
        },
        focus: (id) => refocus(board, id),
        moveTier(tierId, direction) {
            board.history.push();
            const from = list.tiers.findIndex((t) => t.id === tierId);
            const to = from + direction;
            if (from < 0 || to < 0 || to >= list.tiers.length) return;
            [list.tiers[from], list.tiers[to]] = [list.tiers[to]!, list.tiers[from]!];
            renderTiers(board);
            changed();
        },
        newTier,
        render: () => renderTiers(board),
        place: () => placeAllTiles(board),
        filter: () => applyFilters(board),
        nextHit(direction = 1) {
            const hits = board.hits;
            if (!hits.length) return null;
            board.hitIndex =
                board.hitIndex < 0 && direction < 0 ? hits.length - 1 : (board.hitIndex + direction + hits.length) % hits.length;
            const id = hits[board.hitIndex]!;
            const tile = board.tileById.get(id);
            if (tile) {
                tile.scrollIntoView({ block: 'center', behavior: 'smooth' });
                tile.classList.remove('flash');
                void tile.offsetWidth; // restart the flash animation
                tile.classList.add('flash');
            }
            return { id, index: board.hitIndex, total: hits.length, tier: list.tiers.find((t) => t.items.includes(id)) };
        },
        setPoolOrder(by) {
            const reshuffle = by === 'shuffled' && list.poolOrder.by === 'shuffled';
            const seed = by === 'shuffled' ? nextShuffleSeed(list.poolOrder.seed) : list.poolOrder.seed;
            list.poolOrder = { by, seed };
            placeAllTiles(board);
            changed();
            return reshuffle;
        },
        refit() {
            applyLayout(board);
            board.tileById.forEach((tile, id) => {
                fitTilePicture(board, id, tile);
            });
            measureRowWidth(board);
        },
        setTheme(tokens) {
            for (const [name, value] of Object.entries(tokens)) {
                if (!name.startsWith('--')) continue;
                board.element.style.setProperty(name, value);
                board.pool.style.setProperty(name, value);
            }
        },
        tile: (id) => ensureTile(board, id),
        tiles: () => board.tileById,
        refreshPicture: (id) => setTileImage(board, id),
        fit(id) {
            const tile = board.tileById.get(id);
            if (tile) fitTilePicture(board, id, tile);
        },
        orderedIds: (where) => orderedIds(board, where),
        rankedIds: () => new Set(list.tiers.flatMap((tier) => tier.items)),
        removeFromTiers: (ids) => removeFromTiers(board, ids),
        isVisible: (id) => isShown(board, id),
        rowWidth: () => board.rowWidth,
        measure: () => measureRowWidth(board),
        pointerArea: () => board.pointerArea,
        isDragging: () => board.dragging,
        counts: () => ({ ranked: list.tiers.reduce((sum, tier) => sum + tier.items.length, 0), total: options.source.items().length }),
        reset() {
            board.tileById.clear();
            board.itemById.clear();
            board.lastClick = null;
            board.element.replaceChildren(...(options.tiersHeader ? [options.tiersHeader] : []));
            board.pool.replaceChildren();
        },
        destroy() {
            for (const cleanup of board.cleanups.splice(0)) cleanup();
            handle.reset();
            board.element.classList.remove('board-tiers', 'chart');
            board.pool.classList.remove('board-pool');
            if (ownPool) board.pool.remove();
        },
    };
    return handle;
}
