// src/core/backup.ts  (tier-engine/core): the backup file
// ─────────────────────────────────────────────────────────────────────────────
//  One JSON file with every list in a browser: each list's index entry ("meta"),
//  its saved list ("snap", as writeList makes it) and the pictures that can't be
//  fetched again ("imgs", as data: addresses), plus a few settings. Writing puts
//  that together; reading checks the envelope and drops anything that doesn't fit.
//  Each list is still checked by readList when it's opened, and each picture by
//  the app before it's stored. Gathering what goes in, and storing it, is the app's.
// ─────────────────────────────────────────────────────────────────────────────

import { isRecord } from './checks';

/** The kind of file this is ("type": "backup"), beside a list file's "app". */
export const BACKUP_TYPE = 'backup';

/** One list in a backup. */
export interface BackupEntry {
    /** The list's entry in the list index (its name, kind…): the app's own fields. */
    meta: Record<string, unknown>;
    /** The saved list (writeList), unchecked until it's opened. */
    snap: Record<string, unknown>;
    /** Picture key → the picture as a data:image/ address. */
    imgs: Record<string, string>;
}

/** A backup, read and checked. */
export interface ReadBackup {
    /** The day it was made (YYYY-MM-DD), or '' when it doesn't say. */
    created: string;
    lists: BackupEntry[];
    /** Only the settings asked for, and only text values. */
    settings: Record<string, string>;
    /** The file as it was, for the app's own fields (a gallery, say). */
    raw: Record<string, unknown>;
}

/** How long a picture key may be: item ids and extra-picture keys are far shorter. */
const MAX_PICTURE_KEY = 80;

/**
 * A backup, ready for JSON.stringify. `app` is the app's own name for its files ("tierlist");
 * `extra` adds the app's own fields (never over the backup's own).
 */
export function writeBackup(
    app: string,
    lists: readonly BackupEntry[],
    settings: Readonly<Record<string, string>>,
    extra: Readonly<Record<string, unknown>> = {},
    now: Date = new Date(),
): Record<string, unknown> {
    const own = { app, type: BACKUP_TYPE, v: 1, created: now.toISOString(), lists, settings };
    for (const key of Object.keys(extra)) if (key in own) throw new Error(`writeBackup: "${key}" is the backup's own field`);
    return { ...own, ...extra };
}

/** Whether a parsed JSON file is a backup (and not a list or a pack). */
export const isBackup = (value: unknown): boolean => isRecord(value) && value.type === BACKUP_TYPE;

/**
 * A backup file's lists and settings, or null if it isn't a backup. Lists without a meta
 * and a saved list are left out; pictures that aren't data:image/ addresses are dropped;
 * only `settingKeys` with text values come back.
 */
export function readBackup(raw: unknown, settingKeys: readonly string[]): ReadBackup | null {
    if (!isRecord(raw) || !isBackup(raw)) return null;
    const lists: BackupEntry[] = (Array.isArray(raw.lists) ? raw.lists : []).flatMap((entry: unknown) => {
        if (!isRecord(entry) || !isRecord(entry.meta) || !isRecord(entry.snap)) return [];
        const imgs: Record<string, string> = {};
        if (isRecord(entry.imgs))
            for (const [key, value] of Object.entries(entry.imgs))
                if (typeof value === 'string' && /^data:image\//.test(value)) imgs[key.slice(0, MAX_PICTURE_KEY)] = value;
        return [{ meta: entry.meta, snap: entry.snap, imgs }];
    });
    const stored = isRecord(raw.settings) ? raw.settings : {};
    const settings: Record<string, string> = {};
    for (const key of settingKeys) if (typeof stored[key] === 'string') settings[key] = stored[key];
    const created = /^\d{4}-\d{2}-\d{2}/.exec(String(raw.created ?? ''))?.[0] ?? '';
    return { created, lists, settings, raw };
}
