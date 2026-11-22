// src/board/index.ts  (tier-engine/board)
// ─────────────────────────────────────────────────────────────────────────────
//  The board an app mounts: tiers (rows or a chart's cells), the pool, drag,
//  keyboard moves, picture and text tiles, selection. mountBoard returns a
//  handle; everything app-specific comes in through BoardOptions' hooks.
//  Its look is board.css (tier-engine/board.css), themed by CSS variables.
// ─────────────────────────────────────────────────────────────────────────────

export {
    type BoardHandle,
    type BoardOptions,
    type FilterResult,
    fitPictureInTile,
    mountBoard,
    type TierStyle,
    type TileClick,
} from './board';
export { type Anchor, insertionIndex, reorderShown } from './placement';
export { nextShuffleSeed, orderPool, shufflePlace } from './pool-order';
