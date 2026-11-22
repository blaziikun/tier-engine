// src/core/index.ts  (tier-engine/core)
// ─────────────────────────────────────────────────────────────────────────────
//  The list without a screen: its shapes, the saved format, undo and redo,
//  storage adapters, the share-link and backup formats, CSV, group ranking, and
//  the checks for anything read from outside. Works without a board (a library
//  page, a build script, tests).
// ─────────────────────────────────────────────────────────────────────────────

export { BACKUP_TYPE, type BackupEntry, isBackup, type ReadBackup, readBackup, writeBackup } from './backup';
export { asArray, asNumber, asText, dig, isRecord } from './checks';
export {
    clearestTextOn,
    contrastRatio,
    hexToRgb,
    isHexColor,
    luminance,
    mixRgb,
    type Rgb,
    readableTextOn,
    rgbToHex,
} from './color';
export {
    type CsvLimits,
    type CsvRow,
    csvCell,
    decodeCsvBytes,
    detectSeparator,
    parseCsv,
    readCsvRows,
    tableAsCsv,
    unguardCell,
} from './csv';
export {
    CHART_COLUMNS,
    clamp,
    FORMAT_VERSION,
    isBoardLayout,
    isLabelMode,
    isPicturePath,
    isPoolSort,
    MAX_TIERS,
    MIGRATIONS,
    type ReadContext,
    type ReadList,
    readList,
    readPick,
    readTiers,
    type SavedBoard,
    type StoredBoard,
    type StoredTier,
    writeList,
} from './format';
export {
    agreementExtremes,
    closestPerson,
    combineRankings,
    foldName,
    GROUP_SIZE,
    type GroupItem,
    type GroupRanking,
    groupSizeProblem,
    inTiers,
    nearestTier,
    type PersonFit,
    type RankedEntry,
    type RankedList,
    tierScore,
} from './group';
export { createHistory, type History, type HistoryOptions, type StepMark, type StepResult } from './history';
export { linkJsonBytes, MAX_LINK_LIST_BYTES, packForLink, unpackFromLink } from './link';
export {
    createLocalStore,
    dbRequest,
    deleteDatabase,
    deleteEntries,
    type LocalStore,
    openDatabase,
    readEntries,
} from './storage';
export {
    cropView,
    type FittedPicture,
    fitPicture,
    isTileFit,
    isTileShape,
    type PictureRect,
    tileBox,
    tileRatio,
    tileScale,
} from './tile-box';
export type {
    BoardItem,
    BoardLayout,
    BoardList,
    Crop,
    ItemId,
    ItemSource,
    LabelMode,
    Pick,
    Picture,
    PoolOrder,
    PoolSortBy,
    Tier,
    TileFit,
    TileShape,
} from './types';
