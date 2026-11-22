// src/core/storage.ts  (tier-engine/core)
// ─────────────────────────────────────────────────────────────────────────────
//  Storage adapters. Lists are small and live in localStorage; pictures and
//  other big things live in IndexedDB. Each app keeps its keys under its own
//  prefixes, so two apps (or an app and anything else on the same site) never
//  read, back up or delete each other's data.
//
//    const local = createLocalStore(['myapp_']);
//    local.set('myapp_list_' + id, json);  local.keys();  local.removeAll();
// ─────────────────────────────────────────────────────────────────────────────

export interface LocalStore {
    /** The stored text, or null (missing, or storage switched off). */
    get(key: string): string | null;
    /** Stores text. Throws as localStorage does when storage is full or switched off, so saving can say so. */
    set(key: string, value: string): void;
    remove(key: string): void;
    /** Every key of this store's prefixes that's stored now. */
    keys(): string[];
    /** Removes every key of this store's prefixes; nothing else is touched. */
    removeAll(): void;
    /** Whether a key is one of this store's. */
    owns(key: string): boolean;
}

/**
 * localStorage, limited to keys that start with one of `prefixes`. Using any other key throws: a mistake in the app,
 * caught in its tests, not something a visitor can cause.
 */
export function createLocalStore(prefixes: readonly string[], storage: () => Storage = () => localStorage): LocalStore {
    if (!prefixes.length || prefixes.some((prefix) => !prefix)) throw new Error('tier-engine: a local store needs non-empty prefixes');
    const owns = (key: string): boolean => prefixes.some((prefix) => key.startsWith(prefix));
    const checked = (key: string): string => {
        if (!owns(key)) throw new Error(`tier-engine: "${key}" isn't under this app's storage prefixes`);
        return key;
    };
    const keys = (): string[] => {
        try {
            return Object.keys(storage()).filter(owns);
        } catch {
            return []; // storage switched off
        }
    };
    return {
        get(key) {
            checked(key);
            try {
                return storage().getItem(key);
            } catch {
                return null;
            }
        },
        set(key, value) {
            storage().setItem(checked(key), value);
        },
        remove(key) {
            checked(key);
            try {
                storage().removeItem(key);
            } catch {}
        },
        keys,
        removeAll() {
            for (const key of keys())
                try {
                    storage().removeItem(key);
                } catch {}
        },
        owns,
    };
}

// ═════════════════════════════════════════════════════════════════════════════
//  INDEXEDDB
// ═════════════════════════════════════════════════════════════════════════════

/** Opens (or creates) a database with these object stores. Rejects if the browser refuses storage. */
export function openDatabase(name: string, stores: readonly string[], version = 1): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        let request: IDBOpenDBRequest;
        try {
            request = indexedDB.open(name, version);
        } catch (error) {
            reject(error);
            return;
        }
        request.onupgradeneeded = () => {
            for (const store of stores) if (!request.result.objectStoreNames.contains(store)) request.result.createObjectStore(store);
        };
        request.onsuccess = () => {
            // another tab deleting everything mustn't be held up by this one
            request.result.onversionchange = () => request.result.close();
            resolve(request.result);
        };
        request.onerror = () => reject(request.error);
        request.onblocked = () => reject(new Error('blocked'));
    });
}

/**
 * Runs one request in its own transaction and resolves with its result once the transaction has finished (so writes
 * are really saved). Resolves null without a database.
 */
export function dbRequest<T = unknown>(
    db: IDBDatabase | null,
    store: string,
    mode: IDBTransactionMode,
    makeRequest: (store: IDBObjectStore) => IDBRequest<T> | null | undefined,
): Promise<T | null> {
    return new Promise((resolve, reject) => {
        if (!db) {
            resolve(null);
            return;
        }
        const transaction = db.transaction(store, mode);
        const request = makeRequest(transaction.objectStore(store));
        transaction.oncomplete = () => resolve(request ? request.result : null);
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
    });
}

/** Every [key, value] in a store, or only those whose key starts with `prefix`. A failed read gives what was read. */
export function readEntries(db: IDBDatabase | null, store: string, prefix?: string): Promise<[IDBValidKey, unknown][]> {
    return new Promise((resolve, reject) => {
        const out: [IDBValidKey, unknown][] = [];
        if (!db?.objectStoreNames.contains(store)) {
            resolve(out);
            return;
        }
        const range = prefix == null ? undefined : IDBKeyRange.bound(prefix, prefix + '￿');
        const cursor = db.transaction(store, 'readonly').objectStore(store).openCursor(range);
        cursor.onsuccess = () => {
            const at = cursor.result;
            if (at) {
                out.push([at.key, at.value]);
                at.continue();
            } else resolve(out);
        };
        cursor.onerror = () => (prefix == null ? reject(cursor.error) : resolve(out));
    });
}

/** Deletes every key in a store that starts with `prefix`. Never fails: without a database there's nothing to delete. */
export function deleteEntries(db: IDBDatabase | null, store: string, prefix: string): Promise<void> {
    return new Promise((resolve) => {
        if (!db) {
            resolve();
            return;
        }
        const transaction = db.transaction(store, 'readwrite');
        transaction.objectStore(store).delete(IDBKeyRange.bound(prefix, prefix + '￿'));
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => resolve();
    });
}

/** Deletes a whole database (Delete everything). Resolves either way. */
export function deleteDatabase(name: string): Promise<void> {
    return new Promise<void>((resolve) => {
        try {
            const request = indexedDB.deleteDatabase(name);
            request.onsuccess = request.onerror = request.onblocked = () => resolve();
        } catch {
            resolve();
        }
    });
}
