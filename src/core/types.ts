// src/core/types.ts  (tier-engine/core)
// ─────────────────────────────────────────────────────────────────────────────
//  The shapes every app on the engine shares: a tier, an item, a picture, the
//  board's part of a list, and an item source. An app's own list type extends
//  BoardList with its fields; the engine reads and writes only these.
// ─────────────────────────────────────────────────────────────────────────────

/** Every rankable thing has a number. An app chooses its ranges (a catalogue's own numbers, say, and a high range for things people add). */
export type ItemId = number;

/** Part of a picture to show: x, y, w, h inside a picture W × H pixels big. */
export interface Crop {
    x: number;
    y: number;
    w: number;
    h: number;
    W: number;
    H: number;
}

/** The picture chosen for an item. Saved inside lists and backups exactly like this. */
export interface Pick {
    /** Where it came from: an https address, or a path the app's item source understands ("custom", "gal:…", a sprite path). */
    path: string;
    /** 1 = already checked for animation (older picks get checked once and repaired). */
    ck?: 1;
    /** Transparent edges were cut off when it was saved. */
    trim?: boolean;
    /** Animated (GIF/APNG/WebP): never re-encoded, cropped on screen instead. */
    anim?: boolean;
    crop?: Crop;
    /** Shown straight from this web address (the site won't let the app copy the picture). */
    remote?: string;
    /** 1 = a text tile made from the item's name. */
    text?: 1;
    /** Left over from a removed background-removal feature; cleared on load. */
    bg?: unknown;
    keepbg?: unknown;
    bgck?: unknown;
}

export interface Tier {
    id: string;
    label: string;
    /** Small second line under the label. */
    subtitle: string;
    color: string;
    /** Label text colour; empty = automatic. */
    textColor?: string;
    items: ItemId[];
}

export type LabelMode = 'off' | 'name' | 'num' | 'both';

/** How the tiers are laid out: full-width rows, or a chart (a grid of labelled cells, each one a tier). */
export type BoardLayout = 'tiers' | 'chart';

/** A tile's shape: square, a poster or book cover (2:3), or a video thumbnail or screenshot (16:9). */
export type TileShape = 'square' | 'portrait' | 'landscape';
/** How a picture sits in its tile: whole, with space around it, or filling the tile and cropped to its centre. */
export type TileFit = 'contain' | 'cover';

/** How the pool is ordered on screen (the saved order and the ranking never change). */
export type PoolSortBy = 'added' | 'az' | 'za' | 'shuffled';
/** The pool's order; `seed` makes a shuffle the same each time the pool is drawn, until it's chosen again. */
export interface PoolOrder {
    by: PoolSortBy;
    seed: number;
}

/**
 * The board's part of a list: what the engine draws, moves, saves and undoes. An app's list holds these fields
 * (and its own); the board is handed that object and changes it in place.
 */
export interface BoardList {
    tiers: Tier[];
    layout: BoardLayout;
    /** Cells across a chart (2–6). */
    chartColumns: number;
    /** Tile size in the tiers, in px. */
    tileSize: number;
    /** Tile size in the pool, in px. */
    poolTileSize: number;
    tileShape: TileShape;
    tileFit: TileFit;
    labelMode: LabelMode;
    poolOrder: PoolOrder;
    /** The chosen picture of each item (by id). */
    picks: Record<string, Pick>;
    /** A short note on an item (by id). */
    notes: Record<string, string>;
    /** An item's tags (by id). */
    tags: Record<string, string[]>;
    /** Not saved: what's selected, and where ('pool', a tier id, or 'mixed'). */
    selection: Set<ItemId>;
    selectionSource: string | null;
}

/** One rankable thing, as the board sees it. */
export interface BoardItem {
    id: ItemId;
    name: string;
    /** A short code shown before the name when labels show numbers ("#025"); empty for none. */
    code?: string;
}

/** What a tile shows. */
export interface Picture {
    /** An address the page can load (blob:, https:, a same-site path). Empty: no picture, the name shows instead. */
    src: string;
    /** Show only this part (animated pictures can't be cut, so they're cropped on screen). */
    crop?: Crop;
    /** Always shown whole, whatever the tile fit (text tiles, whose words would be cut off). */
    whole?: boolean;
}

/**
 * Where a board's items come from: the app passes one (things people added, a catalogue, or both). The engine never
 * knows what the items are.
 */
export interface ItemSource {
    id: string;
    /** Every item the pool offers, in its "added" order. */
    items(): readonly BoardItem[];
    /**
     * Any item the list knows by id, including ones the pool doesn't offer now (a form merged back into its species,
     * a variant inside a combined family) but a tier may still hold. Default: only what items() gives.
     */
    item?(id: ItemId): BoardItem | undefined;
    /** The picture an item's tile shows. */
    picture(item: BoardItem): Picture;
    /**
     * A tile's picture didn't load: the source may repair it (a fresh copy, the next mirror) by setting the image's
     * src, or show a stand-in. Without this, the tile keeps the broken picture's space.
     */
    pictureFailed?(item: BoardItem, image: HTMLImageElement): void;
}
