// src/core/format.ts  (tier-engine/core)
// ─────────────────────────────────────────────────────────────────────────────
//  A list as it is stored: in the browser, in saved .json files, in backups and
//  share links. This is version 10 of the format, and it never changes shape
//  without a migration here and a test, so every file anyone saved still loads.
//
//  The engine writes and reads the board's fields (tiers, per-item pictures,
//  notes and tags, layout, tiles, labels, the pool's order). An app adds its
//  own fields beside them in the same object (writeList's `appFields`) and reads
//  them back from `ReadList.raw`, checking each one itself.
//
//  Older versions: files from before version 10 differ only in a few keys, which
//  the readers below accept as they are (MIGRATIONS lists each one), so there is
//  no separate upgrade step to run.
// ─────────────────────────────────────────────────────────────────────────────
import { isRecord } from './checks';
import { isHexColor } from './color';
import { isTileFit, isTileShape } from './tile-box';
import type { BoardLayout, BoardList, ItemId, LabelMode, Pick, PoolSortBy, Tier, TileFit, TileShape } from './types';

/** The format this engine writes, and the newest it reads. */
export const FORMAT_VERSION = 10;

/**
 * What older files hold differently, and where it's read. Kept as data so a test can check each one still loads
 * (tests/unit/format.test.ts), and so the next change to the format is added here with its own.
 */
export const MIGRATIONS = [
    { key: 'names', became: 'lbl', note: 'true/false: names under tiles or not; read as labels "name" or "off"' },
    {
        key: 'chosenSprites',
        became: 'picks',
        note: 'chosen picture addresses; read into ReadList.chosenPictures for the app to turn into picks',
    },
    { key: 'tiers[].sub/text', became: 'subtitle/textColor', note: 'both spellings read (undo history uses the long ones)' },
    { key: 'lay, cols', became: '(new)', note: 'missing: tier rows, 3 columns' },
    { key: 'shape, fit', became: '(new)', note: 'missing: square tiles, whole pictures' },
    { key: 'psort, pseed', became: '(new)', note: 'missing: the order items were added' },
] as const;

export interface StoredTier {
    id: string;
    label: string;
    sub: string;
    color: string;
    text: string;
    items: ItemId[];
}

/** The board's stored keys (kept short and stable on purpose). */
export interface StoredBoard {
    app: 'tierlist';
    v: typeof FORMAT_VERSION;
    listName: string;
    tiers: StoredTier[];
    notes: Record<string, string>;
    tags: Record<string, string[]>;
    picks: Record<string, Pick>;
    sz: number;
    psz: number;
    lbl: LabelMode;
    lay: BoardLayout;
    cols: number;
    shape: TileShape;
    fit: TileFit;
    psort: PoolSortBy;
    pseed: number;
}

/** The board's fields a list saves (the selection isn't). */
export type SavedBoard = Omit<BoardList, 'selection' | 'selectionSource'>;

const storeTier = (tier: Tier): StoredTier => ({
    id: tier.id,
    label: tier.label,
    sub: tier.subtitle,
    color: tier.color,
    text: tier.textColor || '',
    items: tier.items,
});

/**
 * A list as stored. `appFields` are the app's own keys, written beside the board's; an app key with the same name as
 * one of the board's is refused, so an app can't overwrite what the engine reads back.
 */
export function writeList<Extra extends object = Record<string, never>>(
    list: SavedBoard,
    listName: string,
    appFields?: Extra,
): StoredBoard & Extra {
    const board: StoredBoard = {
        app: 'tierlist',
        v: FORMAT_VERSION,
        listName,
        tiers: list.tiers.map(storeTier),
        notes: list.notes,
        tags: list.tags,
        picks: list.picks,
        sz: list.tileSize,
        psz: list.poolTileSize,
        lbl: list.labelMode,
        lay: list.layout,
        cols: list.chartColumns,
        shape: list.tileShape,
        fit: list.tileFit,
        psort: list.poolOrder.by,
        pseed: list.poolOrder.seed,
    };
    for (const key of Object.keys(appFields ?? {}))
        if (Object.hasOwn(board, key)) throw new Error(`tier-engine: "${key}" is one of the board's stored keys`);
    return { ...appFields, ...board } as StoredBoard & Extra;
}

// ═════════════════════════════════════════════════════════════════════════════
//  READING (everything is checked: files can come from anywhere)
// ═════════════════════════════════════════════════════════════════════════════

/** A number from a file, kept between min and max; missing, zero or unreadable gives `fallback`. */
export const clamp = (value: unknown, min: number, max: number, fallback: number): number => {
    const n = Number(value);
    return Math.max(min, Math.min(max, Number.isFinite(n) && n ? n : fallback));
};
const LABEL_MODES: readonly LabelMode[] = ['off', 'name', 'num', 'both'];
export const isLabelMode = (value: unknown): value is LabelMode => LABEL_MODES.includes(value as LabelMode);
export const isBoardLayout = (value: unknown): value is BoardLayout => value === 'tiers' || value === 'chart';
const POOL_SORTS: readonly PoolSortBy[] = ['added', 'az', 'za', 'shuffled'];
export const isPoolSort = (value: unknown): value is PoolSortBy => POOL_SORTS.includes(value as PoolSortBy);

/** Cells across a chart: the fewest, the most, and a new chart's. */
export const CHART_COLUMNS = { min: 2, max: 6, start: 3 } as const;
/** More than anyone ranks into, and enough to stop a hostile file building a page nobody can scroll. */
export const MAX_TIERS = 100;

/** What reading needs from the app: which item ids exist in the list, and a maker of fresh tier ids. */
export interface ReadContext {
    itemExists: (id: ItemId) => boolean;
    makeId: () => string;
}

/**
 * Tiers from a file or from undo history. Accepts both the stored keys (sub, text) and
 * the in-memory ones (subtitle, textColor). Unknown items and duplicates are dropped.
 */
export function readTiers(raw: unknown, { itemExists, makeId }: ReadContext): Tier[] {
    const placed = new Set<ItemId>();
    const tierIds = new Set<string>();
    // a repeated id would make two rows answer to one name: the second gets a fresh one
    const uniqueTierId = (id: unknown): string => {
        const wanted = String(id || '').slice(0, 40);
        const chosen = wanted && !tierIds.has(wanted) ? wanted : makeId();
        tierIds.add(chosen);
        return chosen;
    };
    return (Array.isArray(raw) ? raw : [])
        .filter(isRecord)
        .slice(0, MAX_TIERS)
        .map((t) => ({
            id: uniqueTierId(t.id),
            label: String(t.label ?? '?').slice(0, 40),
            subtitle: String(t.subtitle ?? t.sub ?? '').slice(0, 60),
            color: isHexColor(t.color) ? t.color : '#888888',
            textColor: isHexColor(t.textColor ?? t.text) ? String(t.textColor ?? t.text) : '',
            items: (Array.isArray(t.items) ? t.items : [])
                .map(Number)
                .filter((id) => itemExists(id) && !placed.has(id) && !!placed.add(id)),
        }));
}

/** What a stored list says about the board, already checked. Only fields that were present and valid are set. */
export interface ReadList {
    listName: string;
    /** The format version the file says it is (0 if it says none). */
    version: number;
    tiers?: Tier[];
    notes: Record<string, string>;
    tags?: Record<string, string[]>;
    picks: Record<string, Pick>;
    /** Files from before picks: chosen picture addresses by item, for the app to turn into picks. */
    chosenPictures: Record<string, string>;
    layout?: BoardLayout;
    chartColumns?: number;
    tileSize?: number;
    poolTileSize?: number;
    tileShape?: TileShape;
    tileFit?: TileFit;
    poolOrder?: BoardList['poolOrder'];
    labelMode?: LabelMode;
    /** The whole stored object, unchecked: the app reads its own fields from it. */
    raw: Record<string, unknown>;
}

/**
 * Checks a stored list's board fields one by one. `itemExists` says which item ids belong to the list (entries that
 * point elsewhere are dropped, so a broken file can't corrupt it).
 */
export function readList(stored: unknown, context: ReadContext): ReadList {
    const s = isRecord(stored) ? stored : {};
    const out: ReadList = {
        listName: typeof s.listName === 'string' ? s.listName.slice(0, 120) : '',
        version: Number.isInteger(s.v) ? Number(s.v) : 0,
        notes: {},
        picks: {},
        chosenPictures: {},
        raw: s,
    };
    const ownsId = (key: string) => context.itemExists(Number(key));

    if (isRecord(s.notes))
        for (const [key, value] of Object.entries(s.notes))
            if (ownsId(key) && typeof value === 'string' && value.trim()) out.notes[key] = value.slice(0, 300);
    if (isRecord(s.tags)) {
        out.tags = {};
        // as the tag box allows: 24 characters each, and a sensible number per item
        for (const [key, list] of Object.entries(s.tags))
            if (ownsId(key) && Array.isArray(list))
                out.tags[key] = list
                    .map((tag) => String(tag).slice(0, 24))
                    .filter(Boolean)
                    .slice(0, 40);
    }
    if (Array.isArray(s.tiers)) out.tiers = readTiers(s.tiers, context);
    if (isBoardLayout(s.lay)) out.layout = s.lay;
    if (s.cols != null) out.chartColumns = Math.round(clamp(s.cols, CHART_COLUMNS.min, CHART_COLUMNS.max, CHART_COLUMNS.start));
    if (s.sz) out.tileSize = clamp(s.sz, 28, 160, 64);
    if (isTileShape(s.shape)) out.tileShape = s.shape;
    if (isTileFit(s.fit)) out.tileFit = s.fit;
    if (s.psz) out.poolTileSize = clamp(s.psz, 24, 128, 56);
    // any whole number does as a seed; it only has to stay the same
    if (isPoolSort(s.psort)) out.poolOrder = { by: s.psort, seed: Number.isSafeInteger(s.pseed) ? Number(s.pseed) >>> 0 : 1 };
    if (isLabelMode(s.lbl)) out.labelMode = s.lbl;
    else if (typeof s.names === 'boolean') out.labelMode = s.names ? 'name' : 'off';
    if (isRecord(s.picks))
        for (const [key, pick] of Object.entries(s.picks))
            if (ownsId(key) && isRecord(pick) && isPicturePath(pick.path)) out.picks[key] = readPick(pick);
    if (isRecord(s.chosenSprites))
        for (const [key, url] of Object.entries(s.chosenSprites)) if (ownsId(key) && isPicturePath(url)) out.chosenPictures[key] = url;
    return out;
}

/**
 * A picture path as apps write them: a web address, or a path inside a picture collection the app knows
 * ("other/home/25.png", "go:25", "lore:…"). Collection paths are joined onto a fixed address, so ".." or a backslash
 * could walk out of it; those are refused.
 */
export function isPicturePath(path: unknown): path is string {
    if (typeof path !== 'string' || !path || path.length > 500) return false;
    if (/^https?:\/\//.test(path)) return !/[\s\\]/.test(path);
    // %2e and %2f would be read as . and / once joined onto the collection's address
    return !/(^|[/:])\.\.([/]|$)|[\\?#]|%(2e|2f|5c)|^\/|^[a-z][\w+.-]*:\/\//i.test(path);
}

/** A pick from a file: only the known fields, with the right types. */
export function readPick(raw: Record<string, unknown>): Pick {
    const pick: Pick = { path: String(raw.path) };
    if (raw.ck) pick.ck = 1;
    if (typeof raw.trim === 'boolean') pick.trim = raw.trim;
    if (typeof raw.anim === 'boolean') pick.anim = raw.anim;
    if (raw.text) pick.text = 1;
    if (typeof raw.remote === 'string' && /^https:\/\//.test(raw.remote)) pick.remote = raw.remote;
    const c = raw.crop;
    if (isRecord(c) && ['x', 'y', 'w', 'h', 'W', 'H'].every((k) => Number.isFinite(c[k])))
        pick.crop = { x: Number(c.x), y: Number(c.y), w: Number(c.w), h: Number(c.h), W: Number(c.W), H: Number(c.H) };
    // markers from old versions: only whether they're set matters
    if (raw.bg) pick.bg = 1;
    if (raw.keepbg) pick.keepbg = 1;
    if (raw.bgck) pick.bgck = 1;
    return pick;
}
