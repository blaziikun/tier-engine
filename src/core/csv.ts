// src/core/csv.ts  (tier-engine/core): lists as CSV
// ─────────────────────────────────────────────────────────────────────────────
//  Comma-separated values, as spreadsheets write them (RFC 4180): quoted cells
//  may hold commas, quotes ("") and line breaks. Reading is capped, since the
//  file comes from outside. Then a list's rows both ways: one row per item, in
//  the columns Tier, Position, Name and Picture, read back in any order or case.
//  Which items a row means, and what to do with them, is up to the app.
// ─────────────────────────────────────────────────────────────────────────────

const MAX_ROWS = 5_000;
const MAX_CELLS_PER_ROW = 50;

/**
 * One cell, ready to write. Quoted when it has to be; a leading = + - @ gets a ' so spreadsheet
 * apps show it as text instead of running it as a formula ("CSV injection").
 */
export function csvCell(value: string): string {
    const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
    return /[",\r\n]|^\s|\s$/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

/**
 * The separator a file uses. Excel writes ";" where the decimal mark is a comma (most of Europe),
 * and tabs come from copying cells, so the first line decides.
 */
export function detectSeparator(text: string): string {
    const firstLine = text.slice(0, text.search(/\r|\n|$/));
    const count = (separator: string) => firstLine.split(separator).length;
    return [',', ';', '\t'].reduce((best, separator) => (count(separator) > count(best) ? separator : best));
}

/** Text from a CSV file's bytes: UTF-8, or Windows-1252 (what Excel saves on Windows) when it isn't valid UTF-8. */
export function decodeCsvBytes(bytes: Uint8Array): string {
    try {
        return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch {
        return new TextDecoder('windows-1252').decode(bytes);
    }
}

/** Reads CSV text into rows of cells. Blank lines are skipped; a byte-order mark is ignored. */
export function parseCsv(text: string, separator = ','): string[][] {
    const rows: string[][] = [];
    let row: string[] = [];
    let cell = '';
    let quoted = false;
    const endCell = () => {
        if (row.length < MAX_CELLS_PER_ROW) row.push(cell);
        cell = '';
    };
    const endRow = () => {
        endCell();
        if (row.some((value) => value.trim())) rows.push(row);
        row = [];
    };
    const source = text.replace(/^\uFEFF/, '');
    for (let i = 0; i < source.length && rows.length < MAX_ROWS; i++) {
        const char = source[i]!;
        if (quoted) {
            if (char !== '"') cell += char;
            else if (source[i + 1] === '"') {
                cell += '"';
                i++;
            } else quoted = false;
        } else if (char === '"' && !cell) quoted = true;
        else if (char === separator) endCell();
        else if (char === '\n' || char === '\r') {
            if (char === '\r' && source[i + 1] === '\n') i++;
            endRow();
        } else cell += char;
    }
    if (cell || row.length) endRow();
    return rows;
}

/** Undoes csvCell's formula guard: "'=SUM" read back is "=SUM" again. */
export const unguardCell = (value: string): string => (/^'[=+\-@]/.test(value) ? value.slice(1) : value);

// ═════════════════════════════════════════════════════════════════════════════
//  A LIST'S ROWS
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Rows of cells as a CSV file's text: each cell guarded (csvCell), CRLF line ends, and a
 * byte-order mark first so Excel reads accents and emoji as UTF-8.
 */
export const tableAsCsv = (rows: readonly (readonly string[])[]): string =>
    `\uFEFF${rows.map((cells) => cells.map(csvCell).join(',')).join('\r\n')}\r\n`;

/** One row of a list read from CSV. */
export interface CsvRow {
    name: string;
    /** The tier's label as written; '' for the unranked pool. */
    tier: string;
    /** Place inside its tier, from 1; rows without one get Infinity and keep the file's order. */
    position: number;
    /** A picture's https address, when the row has one. */
    picture?: string;
}

/** How long a name and a tier label read from CSV may be (longer ones are cut). */
export interface CsvLimits {
    name: number;
    tier: number;
}

type Columns = Record<'name' | 'tier' | 'position' | 'picture', number>;

/** Which column holds what, from the header row; null when the first row is already data. */
function readHeader(cells: string[]): Columns | null {
    const find = (...names: string[]) => cells.findIndex((cell) => names.includes(cell.trim().toLowerCase()));
    const columns = {
        name: find('name', 'item', 'title'),
        tier: find('tier'),
        position: find('position', 'order'),
        picture: find('picture', 'image', 'url', 'link'),
    };
    return columns.name >= 0 ? columns : null;
}

/**
 * A list's rows from CSV text. The header row may have its columns in any order or case
 * (Tier, Position, Name, Picture, and a few other words for them); a file without one is read
 * as names in its first column. Rows without a name are skipped; pictures that aren't https are dropped.
 */
export function readCsvRows(text: string, limits: CsvLimits = { name: 80, tier: 40 }): CsvRow[] {
    const table = parseCsv(text, detectSeparator(text.replace(/^\uFEFF/, '')));
    const header = table[0] ? readHeader(table[0]) : null;
    const column: Columns = header ?? { name: 0, tier: -1, position: -1, picture: -1 };
    const read = (cells: string[], index: number) => (index >= 0 ? unguardCell((cells[index] ?? '').trim()) : '');
    return (header ? table.slice(1) : table).flatMap((cells) => {
        const name = read(cells, column.name).slice(0, limits.name);
        if (!name) return [];
        const picture = read(cells, column.picture);
        const position = Number(read(cells, column.position));
        return [
            {
                name,
                tier: read(cells, column.tier).slice(0, limits.tier),
                position: position > 0 ? position : Number.POSITIVE_INFINITY,
                ...(/^https:\/\/\S+$/.test(picture) ? { picture } : {}),
            },
        ];
    });
}
