// The local store keeps to its prefixes: it never reads, lists or deletes another app's keys.
import { describe, expect, it } from 'vitest';
import { createLocalStore } from '../../src/core';

/** A stand-in for localStorage (Vitest runs in Node). */
function fakeStorage(initial: Record<string, string> = {}): Storage {
    const data = new Map(Object.entries(initial));
    const storage = {
        getItem: (key: string) => data.get(key) ?? null,
        setItem: (key: string, value: string) => void data.set(key, String(value)),
        removeItem: (key: string) => void data.delete(key),
        clear: () => data.clear(),
        key: (i: number) => [...data.keys()][i] ?? null,
        get length() {
            return data.size;
        },
    };
    // Object.keys(localStorage) lists the stored keys
    return new Proxy(storage, {
        ownKeys: () => [...data.keys()],
        getOwnPropertyDescriptor: () => ({ enumerable: true, configurable: true }),
    }) as Storage;
}

describe('local store', () => {
    it('reads and writes its own keys and lists only those', () => {
        const backing = fakeStorage({ pt_cur: 'a', ptl_a: '{}', other_app: 'x', pr_box: 'y' });
        const store = createLocalStore(['pt_', 'ptl_'], () => backing);
        expect(store.get('pt_cur')).toBe('a');
        store.set('ptl_b', '[]');
        expect(store.keys().sort()).toEqual(['pt_cur', 'ptl_a', 'ptl_b']);
    });

    it('removes everything of its own and nothing else', () => {
        const backing = fakeStorage({ pt_cur: 'a', ptl_a: '{}', other_app: 'x' });
        createLocalStore(['pt_', 'ptl_'], () => backing).removeAll();
        expect(backing.getItem('other_app')).toBe('x');
        expect(backing.getItem('pt_cur')).toBeNull();
    });

    it('refuses a key outside its prefixes (a mistake in the app, caught by its tests)', () => {
        const store = createLocalStore(['pt_'], () => fakeStorage());
        expect(() => store.get('pr_box')).toThrow(/storage prefixes/);
        expect(() => store.set('x', '1')).toThrow(/storage prefixes/);
        expect(() => createLocalStore([''])).toThrow();
    });

    it('reads as empty when storage is switched off, but saving says it failed', () => {
        const off = () => {
            throw new Error('SecurityError');
        };
        const store = createLocalStore(['pt_'], off as () => Storage);
        expect(store.get('pt_cur')).toBeNull();
        expect(store.keys()).toEqual([]);
        expect(() => store.set('pt_cur', 'a')).toThrow();
    });
});
