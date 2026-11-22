// src/board/drag.ts  (tier-engine/board)
// ─────────────────────────────────────────────────────────────────────────────
//  Moving tiles with the pointer:
//    - press a tile and move  → drag it (or the whole selection) to a tier or the pool
//    - press and release      → select it (the board's click rules)
//    - press empty space      → drag a box to select every tile inside it
//    - right-click a tile     → options.onTileOpen (the app's picture picker or editor)
//  Touch: tap to select, then tap a tier label (dragging a finger scrolls instead).
// ─────────────────────────────────────────────────────────────────────────────
import type { ItemId } from '../core';
import { type Board, moveItems, syncSelection } from './board';

/** Pixels the pointer must move before a press becomes a drag. */
const DRAG_START_PX = 6;
const BOX_START_PX = 5;

/** Where dropped tiles go: a tier (before/after one of its tiles), or back to the pool. */
type DropTarget = { tierId: string; nextTo?: ItemId; after?: boolean } | { pool: true };

interface TileDrag {
    id: ItemId;
    /** Where the pressed tile sits: 'pool' or a tier id. */
    src: string;
    startX: number;
    startY: number;
    x: number;
    y: number;
    moving: boolean;
    pointerType: string;
    shift: boolean;
    meta: boolean;
    /** The tiles being moved (the selection, if the pressed tile is in it). */
    ids: ItemId[];
    target: DropTarget | null;
}

/** A tile of this board under the pointer, or null. */
function boardTile(board: Board, target: EventTarget | null): HTMLElement | null {
    const tile = (target as HTMLElement | null)?.closest?.<HTMLElement>('.pi');
    return tile && (board.element.contains(tile) || board.pool.contains(tile)) ? tile : null;
}

/** The floating name that follows a drag, and the selection box's outline: the app's own elements, or made here. */
function overlay(given: HTMLElement | undefined, className: string): HTMLElement {
    if (given) return given;
    const element = document.createElement('div');
    element.className = className;
    element.style.display = 'none';
    document.body.append(element);
    return element;
}

// ═════════════════════════════════════════════════════════════════════════════
//  DROP TARGETS
// ═════════════════════════════════════════════════════════════════════════════

interface Marks {
    tile: HTMLElement | null;
    area: HTMLElement | null;
}

function clearDropMarks(marks: Marks): void {
    marks.tile?.classList.remove('ins-a', 'ins-b');
    marks.tile = null;
    marks.area?.classList.remove('dov');
    marks.area = null;
}

/** Works out (and highlights) where the tiles would land at this point. */
function findDropTarget(board: Board, drag: TileDrag, marks: Marks, x: number, y: number): void {
    clearDropMarks(marks);
    drag.target = null;
    const under = document.elementFromPoint(x, y);
    if (!under) return;
    const inTiers = board.element.contains(under);
    const tierTiles = inTiers ? under.closest<HTMLElement>('.tcont') : null;
    const tierRow = inTiers ? under.closest<HTMLElement>('.trow') : null;
    if (tierTiles) {
        marks.area = tierTiles.parentElement;
        marks.area?.classList.add('dov');
        const tile = under.closest<HTMLElement>('.pi');
        const tileId = Number(tile?.dataset.id);
        if (tile && tile.parentElement === tierTiles && !drag.ids.includes(tileId)) {
            const box = tile.getBoundingClientRect();
            const after = x > box.left + box.width / 2;
            marks.tile = tile;
            tile.classList.add(after ? 'ins-a' : 'ins-b');
            drag.target = { tierId: tierTiles.dataset.tid!, nextTo: tileId, after };
        } else drag.target = { tierId: tierTiles.dataset.tid! };
    } else if (tierRow) {
        marks.area = tierRow;
        tierRow.classList.add('dov');
        drag.target = { tierId: tierRow.dataset.tid! };
    } else if (board.poolArea.contains(under)) {
        marks.area = board.poolArea;
        marks.area.classList.add('dov');
        drag.target = { pool: true };
    }
}

/** Near the top/bottom edge of the tiers or pool, scroll so far-away tiers can be reached. */
function autoScrollWhileDragging(board: Board, state: PointerState): void {
    if (state.autoScrollFrame || !state.tileDrag?.moving) return;
    const step = () => {
        state.autoScrollFrame = 0;
        const drag = state.tileDrag;
        if (!drag?.moving) return;
        const area = [board.element, board.pool].find((element) => {
            const box = element.getBoundingClientRect();
            return drag.x >= box.left && drag.x <= box.right && drag.y >= box.top - 30 && drag.y <= box.bottom + 30;
        });
        if (!area) return;
        const box = area.getBoundingClientRect();
        const edge = 60;
        let speed = 0;
        if (drag.y < box.top + edge) speed = -Math.ceil((box.top + edge - drag.y) / 3);
        else if (drag.y > box.bottom - edge) speed = Math.ceil((drag.y - (box.bottom - edge)) / 3);
        if (!speed) return;
        area.scrollTop += Math.max(-40, Math.min(40, speed));
        findDropTarget(board, drag, state.marks, drag.x, drag.y);
        state.autoScrollFrame = requestAnimationFrame(step);
    };
    state.autoScrollFrame = requestAnimationFrame(step);
}

function endDragVisuals(board: Board, state: PointerState): void {
    clearDropMarks(state.marks);
    state.ghost.style.display = 'none';
    document.body.classList.remove('dragging');
    board.tileById.forEach((tile) => {
        tile.classList.remove('dsrc');
    });
}

/** Moves the dragged tiles to their drop target: beside the shown item dropped against (placement.ts). */
function drop(board: Board, drag: TileDrag): void {
    const target = drag.target;
    if (!target) return;
    moveItems(board, drag.ids, 'tierId' in target ? target.tierId : null, 'tierId' in target ? target : {});
}

// ═════════════════════════════════════════════════════════════════════════════
//  BOX SELECTION
// ═════════════════════════════════════════════════════════════════════════════

interface SelectionBox {
    area: HTMLElement;
    startX: number;
    startY: number;
    startScroll: number;
    x: number;
    y: number;
    /** Shift/Ctrl/⌘ held: add to the selection instead of replacing it. */
    adding: boolean;
    before: Set<ItemId>;
    moved: boolean;
}
/** What the pointer is doing on one board. */
interface PointerState {
    tileDrag: TileDrag | null;
    selectionBox: SelectionBox | null;
    boxFrame: number;
    autoScrollFrame: number;
    marks: Marks;
    ghost: HTMLElement;
    marquee: HTMLElement;
}

/** Redraws the box, selects what's inside it, and scrolls when it's near an edge. */
function updateSelectionBox(board: Board, state: PointerState): void {
    state.boxFrame = 0;
    const sel = state.selectionBox;
    if (!sel) return;
    const area = sel.area;
    const bounds = area.getBoundingClientRect();
    const nearTop = sel.y < bounds.top + 28;
    const nearBottom = sel.y > bounds.bottom - 28;
    if (nearTop) area.scrollTop -= 18;
    else if (nearBottom) area.scrollTop += 18;
    const startY = sel.startY - (area.scrollTop - sel.startScroll); // the start point scrolls with the content
    const left = Math.min(sel.startX, sel.x);
    const right = Math.max(sel.startX, sel.x);
    const top = Math.min(startY, sel.y);
    const bottom = Math.max(startY, sel.y);
    const outline = state.marquee.style;
    outline.display = 'block';
    outline.left = left + 'px';
    outline.top = Math.max(top, bounds.top) + 'px';
    outline.width = right - left + 'px';
    outline.height = Math.min(bottom, bounds.bottom) - Math.max(top, bounds.top) + 'px';
    const selected = sel.adding ? new Set(sel.before) : new Set<ItemId>();
    area.querySelectorAll<HTMLElement>('.pi').forEach((tile) => {
        if (tile.style.display === 'none') return;
        const box = tile.getBoundingClientRect();
        if (box.right > left && box.left < right && box.bottom > top && box.top < bottom) selected.add(Number(tile.dataset.id));
    });
    board.list.selection = selected;
    const sources = new Set([...selected].map((id) => board.tileById.get(id)?.dataset.src));
    board.list.selectionSource = !selected.size ? null : sources.size === 1 ? ([...sources][0] ?? null) : 'mixed';
    syncSelection(board);
    if (nearTop || nearBottom) state.boxFrame = requestAnimationFrame(() => updateSelectionBox(board, state));
}

// ═════════════════════════════════════════════════════════════════════════════
//  WIRING (once per board, from mountBoard; destroy() takes it all off again)
// ═════════════════════════════════════════════════════════════════════════════

export function setupPointer(board: Board): void {
    const { options } = board;
    const state: PointerState = {
        tileDrag: null,
        selectionBox: null,
        boxFrame: 0,
        autoScrollFrame: 0,
        marks: { tile: null, area: null },
        ghost: overlay(options.ghost, 'board-ghost'),
        marquee: overlay(options.marquee, 'board-marquee'),
    };
    const active = () => options.active?.() ?? true;
    const listen = <K extends keyof WindowEventMap>(
        on: Window | Document,
        type: K,
        handler: (e: WindowEventMap[K]) => void,
        settings?: AddEventListenerOptions,
    ) => {
        on.addEventListener(type, handler as EventListener, settings);
        board.cleanups.push(() => on.removeEventListener(type, handler as EventListener, settings));
    };
    board.cleanups.push(() => {
        if (!options.ghost) state.ghost.remove();
        if (!options.marquee) state.marquee.remove();
    });

    // press a tile: maybe a click, maybe the start of a drag
    listen(document, 'pointerdown', (e) => {
        if (e.button !== 0 || !active()) return;
        const tile = boardTile(board, e.target);
        if (!tile) return;
        if (e.pointerType === 'mouse') e.preventDefault();
        state.tileDrag = {
            id: Number(tile.dataset.id),
            src: tile.dataset.src!,
            startX: e.clientX,
            startY: e.clientY,
            x: e.clientX,
            y: e.clientY,
            moving: false,
            pointerType: e.pointerType,
            shift: e.shiftKey,
            meta: e.metaKey || e.ctrlKey,
            ids: [],
            target: null,
        };
    });
    listen(
        document,
        'pointerover',
        (e) => {
            const over = e.target as Node;
            if (board.element.contains(over)) board.pointerArea = 'tiers';
            else if (board.poolArea.contains(over)) board.pointerArea = 'pool';
        },
        { passive: true },
    );
    // press empty space in the tiers or pool: start a selection box
    listen(document, 'pointerdown', (e) => {
        if (e.button !== 0 || !active() || e.pointerType === 'touch') return;
        const target = e.target as HTMLElement;
        const area = board.element.contains(target) ? board.element : board.pool.contains(target) ? board.pool : null;
        if (!area || target.closest('.pi,.tlbl,.tctrl,button,input,select')) return;
        const bounds = area.getBoundingClientRect();
        if (e.clientX > bounds.left + area.clientWidth || e.clientY > bounds.top + area.clientHeight) return; // on the scrollbar
        e.preventDefault();
        options.onDragStart?.();
        state.selectionBox = {
            area,
            startX: e.clientX,
            startY: e.clientY,
            startScroll: area.scrollTop,
            x: e.clientX,
            y: e.clientY,
            adding: e.shiftKey || e.metaKey || e.ctrlKey,
            before: new Set(board.list.selection),
            moved: false,
        };
    });
    listen(
        window,
        'pointermove',
        (e) => {
            const box = state.selectionBox;
            if (!box) return;
            box.x = e.clientX;
            box.y = e.clientY;
            if (!box.moved) {
                if (Math.hypot(e.clientX - box.startX, e.clientY - box.startY) < BOX_START_PX) return;
                box.moved = true;
            }
            if (!state.boxFrame) state.boxFrame = requestAnimationFrame(() => updateSelectionBox(board, state));
        },
        { passive: true },
    );
    listen(window, 'pointerup', () => {
        const box = state.selectionBox;
        if (!box) return;
        state.selectionBox = null;
        cancelAnimationFrame(state.boxFrame);
        state.boxFrame = 0;
        state.marquee.style.display = 'none';
        if (!box.moved && !box.adding) board.handle.clearSelection(); // a plain click on empty space
    });

    // moving a pressed tile
    listen(
        window,
        'pointermove',
        (e) => {
            const drag = state.tileDrag;
            if (!drag) return;
            if (!drag.moving) {
                if (Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) < DRAG_START_PX) return;
                if (drag.pointerType === 'touch') {
                    state.tileDrag = null; // a finger moving = scrolling
                    return;
                }
                drag.moving = true;
                board.dragging = true;
                options.onDragStart?.();
                drag.ids = board.list.selection.has(drag.id) ? board.handle.selectedInOrder() : [drag.id];
                drag.ids.forEach((id) => {
                    board.tileById.get(id)?.classList.add('dsrc');
                });
                const one = drag.ids.length === 1 ? board.tileById.get(drag.ids[0]!)?.getAttribute('aria-label') : null;
                state.ghost.textContent = one ?? `${drag.ids.length} ${options.itemWord?.(drag.ids.length) ?? 'items'}`;
                state.ghost.style.display = 'block';
                document.body.classList.add('dragging');
            }
            const ghost = state.ghost.style;
            ghost.left = e.clientX + 14 + 'px';
            ghost.top = e.clientY - 12 + 'px';
            drag.x = e.clientX;
            drag.y = e.clientY;
            autoScrollWhileDragging(board, state);
            findDropTarget(board, drag, state.marks, e.clientX, e.clientY);
        },
        { passive: true },
    );
    listen(window, 'pointerup', () => {
        const drag = state.tileDrag;
        if (!drag) return;
        state.tileDrag = null;
        board.dragging = false;
        if (!drag.moving) {
            board.handle.click({ id: drag.id, src: drag.src, shift: drag.shift, meta: drag.meta });
            return;
        }
        endDragVisuals(board, state);
        drop(board, drag);
    });
    listen(window, 'pointercancel', () => {
        if (state.tileDrag?.moving) endDragVisuals(board, state);
        state.tileDrag = null;
        board.dragging = false;
    });

    // right-click a tile: the app opens it (its picture picker, its editor)
    listen(document, 'contextmenu', (e) => {
        const tile = boardTile(board, e.target);
        if (!tile) return;
        e.preventDefault();
        options.onTileOpen?.(Number(tile.dataset.id), tile);
    });
}
