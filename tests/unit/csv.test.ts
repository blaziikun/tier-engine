// CSV both ways: spreadsheets' quoting rules, the formula guard, and reading a list back.
import { describe, expect, it } from 'vitest';
import { csvCell, decodeCsvBytes, detectSeparator, parseCsv, readCsvRows, tableAsCsv, unguardCell } from '../../src/core';

describe('writing a cell', () => {
    it('quotes only when it has to', () => {
        expect(csvCell('Kiwi')).toBe('Kiwi');
        expect(csvCell('Pear, Asian')).toBe('"Pear, Asian"');
        expect(csvCell('The "best" one')).toBe('"The ""best"" one"');
        expect(csvCell('two\nlines')).toBe('"two\nlines"');
    });

    it('keeps spreadsheets from running a cell as a formula, and reading undoes it', () => {
        for (const sneaky of ['=HYPERLINK("https://x.example")', '+1+1', '-2', '@SUM(A1)']) {
            const written = csvCell(sneaky);
            expect(written.replace(/^"|"$/g, '').replaceAll('""', '"').startsWith("'")).toBe(true);
            expect(unguardCell(parseCsv(written)[0]![0]!)).toBe(sneaky);
        }
    });
});

describe('writing a list', () => {
    it('starts with a byte-order mark, ends lines with CRLF and guards every cell', () => {
        const text = tableAsCsv([
            ['Tier', 'Position', 'Name'],
            ['S', '1', '=1+1'],
            ['', '', 'Pear, Asian'],
        ]);
        expect(text).toBe(`\uFEFFTier,Position,Name\r\nS,1,'=1+1\r\n,,"Pear, Asian"\r\n`);
        expect(readCsvRows(text)).toEqual([
            { name: '=1+1', tier: 'S', position: 1 },
            { name: 'Pear, Asian', tier: '', position: Number.POSITIVE_INFINITY },
        ]);
    });

    it('cuts names and tier labels to the limits asked for', () => {
        expect(readCsvRows('Name,Tier\nabcdef,ghijkl', { name: 3, tier: 2 })).toEqual([
            { name: 'abc', tier: 'gh', position: Number.POSITIVE_INFINITY },
        ]);
    });
});

describe('reading', () => {
    it('handles quotes, commas, line breaks, CRLF, a byte-order mark and blank lines', () => {
        const text = '﻿Name,Tier\r\n"Pear, Asian",S\r\n\r\n"Line\nbreak","A ""quoted"" tier"\n';
        expect(parseCsv(text)).toEqual([
            ['Name', 'Tier'],
            ['Pear, Asian', 'S'],
            ['Line\nbreak', 'A "quoted" tier'],
        ]);
    });

    it('reads the columns Export writes, in any order and case', () => {
        const rows = readCsvRows(
            'picture,NAME,position,tier\nhttps://img.example/a.png,Alpha,2,S\n,Beta,1,S\nhttp://plain.example/c.png,Gamma,,\n',
        );
        expect(rows).toEqual([
            { name: 'Alpha', tier: 'S', position: 2, picture: 'https://img.example/a.png' },
            { name: 'Beta', tier: 'S', position: 1 },
            { name: 'Gamma', tier: '', position: Number.POSITIVE_INFINITY }, // only https pictures
        ]);
    });

    it('reads a plain list of names when there is no header', () => {
        expect(readCsvRows('Spirited Away\nAkira\n\nYour Name').map((row) => row.name)).toEqual(['Spirited Away', 'Akira', 'Your Name']);
    });

    it('reads what Excel saves in Europe (semicolons, Windows-1252) as well as UTF-8', () => {
        expect(detectSeparator('Tier;Position;Name\nS;1;Kiwi')).toBe(';');
        expect(detectSeparator('Name\tTier')).toBe('\t');
        expect(detectSeparator('Just one column')).toBe(',');
        expect(readCsvRows('Tier;Position;Name\r\nS;1;Crème brûlée').map((row) => [row.tier, row.name])).toEqual([['S', 'Crème brûlée']]);
        expect(decodeCsvBytes(new Uint8Array([0x43, 0x72, 0xe8, 0x6d, 0x65, 0x20, 0x62, 0x72, 0xfb, 0x6c, 0xe9, 0x65]))).toBe(
            'Crème brûlée',
        ); // Windows-1252
        expect(decodeCsvBytes(new TextEncoder().encode('Crème brûlée'))).toBe('Crème brûlée');
    });

    it('caps what a hostile file can make it do', () => {
        const huge = `Name\n${'x'.repeat(5000)}\n${Array.from({ length: 30_000 }, (_, i) => `item ${i}`).join('\n')}`;
        const rows = readCsvRows(huge);
        expect(rows[0]!.name.length).toBe(80);
        expect(rows.length).toBeLessThanOrEqual(5_000);
    });
});
