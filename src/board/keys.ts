// src/board/keys.ts  (tier-engine/board)
// ─────────────────────────────────────────────────────────────────────────────
//  Ranking without a mouse. Tab into the tiers or the pool, then:
//    arrows          move between items (by what's on screen, so it works in any layout)
//    Home / End      first / last item in that area
//    Space / Enter   select the item (Shift: range, Ctrl/⌘: add from another area)
//    1–9 / 0         with nothing selected, selects this item; the app's own shortcut
//                    then sends the selection to a tier / the pool (handle.moveSelectionTo)
//    Alt+arrows      rows: ← → move the item along its tier, ↑ ↓ to the tier above / below
//                    (below the last: the pool). Chart: to the next cell that way, and
//                    Alt+Shift+← → along its cell
//    Menu, Shift+F10 opens the item, as right-click does (options.onTileOpen)
// ─────────────────────────────────────────────────────────────────────────────
import type { ItemId } from '../core';
import { type Board, isShown, moveItems, refocus } from './board';

const isTile = (element: Element | null): element is HTMLElement => element instanceof HTMLElement && element.classList.contains('pi');

/** Tiles the person can see in an area, in screen order. */
function visibleTiles(area: HTMLElement): HTMLElement[] {
    return [...area.querySelectorAll<HTMLElement>('.pi')].filter((tile) => tile.offsetParent !== null);
}

/**
 * The nearest tile in a direction, judged by where tiles are drawn, not by list order: rows wrap, the pool
 * can sit beside the tiers, and charts are grids, so "the one below" has to be measured.
 */
function neighbour(from: HTMLElement, tiles: HTMLElement[], key: string): HTMLElement | undefined {
    const index = tiles.indexOf(from);
    if (key === 'ArrowRight') return tiles[index + 1];
    if (key === 'ArrowLeft') return tiles[index - 1];
    const box = from.getBoundingClientRect();
    const centre = box.left + box.width / 2;
    const down = key === 'ArrowDown';
    let best: HTMLElement | undefined;
    let bestScore = Number.POSITIVE_INFINITY;
    for (const tile of tiles) {
        const other = tile.getBoundingClientRect();
        const rowGap = down ? other.top - box.bottom : box.top - other.bottom;
        if (rowGap < -box.height / 2) continue; // same row or the wrong way
        // the next row first, then the closest column within it
        const score = rowGap * 1000 + Math.abs(other.left + other.width / 2 - centre);
        if (score < bestScore) [best, bestScore] = [tile, score];
    }
    return best;
}

function focusTile(tile: HTMLElement | undefined): void {
    if (!tile) return;
    tile.focus();
    tile.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

/** One place along its tier, past the next shown item (what the app hides keeps its place). */
function moveWithinTier(board: Board, id: ItemId, tierId: string, step: number): void {
    const tier = board.list.tiers.find((t) => t.id === tierId);
    if (!tier) return;
    const shown = tier.items.filter((x) => isShown(board, x));
    const passing = shown[shown.indexOf(id) + step];
    if (passing == null || !tier.items.includes(id)) return;
    // moving with the keys keeps what was selected
    moveItems(board, [id], tierId, { nextTo: passing, after: step > 0 }, { keepSelection: true });
    refocus(board, id);
}

/**
 * To another tier `step` places on, keeping roughly the same place in the row. Rows: down from the last
 * tier is the pool. Charts: only to a real cell, and ← → never wrap round to the next row of cells.
 */
function moveToNextTier(board: Board, id: ItemId, src: string, step: number, { toPool }: { toPool: boolean }): void {
    const { list } = board;
    const index = list.tiers.findIndex((tier) => tier.id === src);
    if (index < 0 || index + step < 0) return; // in the pool the number keys say which tier; nothing above the first
    const columns = list.chartColumns;
    if (Math.abs(step) === 1 && list.layout === 'chart' && Math.floor(index / columns) !== Math.floor((index + step) / columns)) return;
    const target = list.tiers[index + step];
    if (!target && !toPool) return;
    // the same place among what's shown
    const shown = (x: ItemId) => isShown(board, x);
    const place = list.tiers[index]!.items.filter(shown).indexOf(id);
    moveItems(board, [id], target ? target.id : null, { nextTo: target?.items.filter(shown)[place] }, { keepSelection: true });
    board.options.notify?.(target ? `Moved to ${target.label}` : 'Back in the pool');
    refocus(board, id);
}

function onAreaKey(board: Board, e: KeyboardEvent, area: HTMLElement): void {
    const { list } = board;
    const focused = document.activeElement;
    const tiles = visibleTiles(area);
    if (!isTile(focused)) {
        // the area itself has focus: the first arrow press steps onto its first item
        if (focused === area && e.key.startsWith('Arrow') && tiles.length) {
            e.preventDefault();
            focusTile(tiles[0]);
        }
        return;
    }
    const id = Number(focused.dataset.id);
    const src = focused.dataset.src || 'pool';
    if (e.altKey && e.key.startsWith('Arrow')) {
        e.preventDefault();
        const sideways = e.key === 'ArrowLeft' || e.key === 'ArrowRight';
        const direction = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : -1;
        const chart = list.layout === 'chart';
        if (src === 'pool') return;
        if (sideways && (!chart || e.shiftKey)) moveWithinTier(board, id, src, direction);
        else if (chart) moveToNextTier(board, id, src, sideways ? direction : direction * list.chartColumns, { toPool: false });
        else moveToNextTier(board, id, src, direction, { toPool: true });
        return;
    }
    if (e.key.startsWith('Arrow') && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        focusTile(neighbour(focused, tiles, e.key));
    } else if (e.key === 'Home' || e.key === 'End') {
        e.preventDefault();
        focusTile(e.key === 'Home' ? tiles[0] : tiles.at(-1));
    } else if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        board.handle.click({ id, src, shift: e.shiftKey, meta: e.ctrlKey || e.metaKey });
    } else if (e.ctrlKey || e.metaKey || e.altKey) {
        // modified keys belong to the shortcut layer (Ctrl+Z, Ctrl+A…)
    } else if (/^[0-9]$/.test(e.key) && !list.selection.size) {
        // nothing selected: the number applies to this item; the app's shortcut does the move itself
        board.handle.click({ id, src, shift: false, meta: false });
        refocus(board, id);
    } else if (/^[0-9]$/.test(e.key)) refocus(board, id);
    else if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) {
        e.preventDefault();
        const box = focused.getBoundingClientRect();
        focused.dispatchEvent(
            new MouseEvent('contextmenu', {
                bubbles: true,
                cancelable: true,
                clientX: box.left + box.width / 2,
                clientY: box.top + box.height / 2,
            }),
        );
    }
}

// ── wiring (once per board, from mountBoard) ──
export function setupKeys(board: Board): void {
    for (const area of [board.element, board.pool]) {
        const onKey = (e: KeyboardEvent) => {
            if (board.options.active?.() === false) return;
            onAreaKey(board, e, area);
        };
        area.addEventListener('keydown', onKey);
        board.cleanups.push(() => area.removeEventListener('keydown', onKey));
    }
}
