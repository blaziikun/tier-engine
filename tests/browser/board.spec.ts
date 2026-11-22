// The board on the example page: drawn on its default look, ranked by mouse and by keyboard, undone, laid out as a
// chart, reshaped, exported, and passing the WCAG 2.2 AA checks axe can run.
import { readFileSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import { type Download, expect, type Page, test } from '@playwright/test';

const errors: string[] = [];
test.beforeEach(async ({ page }) => {
    errors.length = 0;
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/');
    await expect(page.locator('#pool .pi')).toHaveCount(10);
});
test.afterEach(() => expect(errors).toEqual([]));

const tierItems = (page: Page, row: number) => page.locator('#tiers .trow').nth(row).locator('.pi');

async function axeViolations(page: Page): Promise<string[]> {
    const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
    return violations.map((violation) => `${violation.id}: ${violation.nodes.map((node) => node.target.join(' ')).join(', ')}`);
}

test('draws the tiers and the pool on its default look, and passes the accessibility checks', async ({ page }) => {
    await expect(page.locator('#tiers .trow')).toHaveCount(3);
    await expect(page.locator('#tiers .trow').nth(1)).toContainText('good');
    expect(await axeViolations(page)).toEqual([]);
});

test('a tile dragged into a tier lands there, and Undo and Redo move it back and forth', async ({ page }) => {
    const tile = page.locator('#pool .pi').first();
    const target = page.locator('#tiers .trow').first();
    const from = (await tile.boundingBox())!;
    const to = (await target.boundingBox())!;
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(from.x + from.width / 2 + 20, from.y + from.height / 2 - 20, { steps: 4 });
    await page.mouse.move(to.x + to.width - 40, to.y + to.height / 2, { steps: 8 });
    await page.mouse.up();
    await expect(tierItems(page, 0)).toHaveCount(1);
    await expect(page.locator('#status')).toHaveText('1 of 10 ranked');
    await page.click('#undo');
    await expect(tierItems(page, 0)).toHaveCount(0);
    await expect(page.locator('#pool .pi')).toHaveCount(10);
    await page.click('#redo');
    await expect(tierItems(page, 0)).toHaveCount(1);
});

test('the keyboard ranks without a mouse: a number sends an item to a tier, Alt+arrows move it on', async ({ page }) => {
    await page.locator('#pool .pi').first().focus();
    await page.keyboard.press('3'); // the board selects it; the page's shortcut sends the selection to tier 3
    await expect(tierItems(page, 2)).toHaveCount(1);
    await expect(tierItems(page, 2)).toBeFocused();
    await page.keyboard.press('Alt+ArrowUp');
    await expect(tierItems(page, 1)).toHaveCount(1);
    await expect(tierItems(page, 2)).toHaveCount(0);
    // the item keeps the focus as it moves
    await expect(page.locator('#tiers .trow').nth(1).locator('.pi')).toBeFocused();
    await page.keyboard.press('Alt+ArrowDown');
    await page.keyboard.press('Alt+ArrowDown');
    await expect(page.locator('#pool .pi')).toHaveCount(10);
});

test('a chart keeps every cell, and the tile shape changes every tile', async ({ page }) => {
    await page.selectOption('#layout', 'chart');
    await expect(page.locator('#tiers')).toHaveClass(/chart/);
    await expect(page.locator('#tiers .trow')).toHaveCount(3);
    const square = (await page.locator('#pool .pi').first().boundingBox())!;
    await page.selectOption('#shape', 'portrait');
    const portrait = (await page.locator('#pool .pi').first().boundingBox())!;
    expect(portrait.height / portrait.width).toBeGreaterThan((square.height / square.width) * 1.2);
    // the shape is the board's own, not the whole page's
    expect(await page.evaluate(() => document.documentElement.style.getPropertyValue('--tile-ratio'))).toBe('');
    expect(await axeViolations(page)).toEqual([]);
});

async function exported(page: Page, button: string): Promise<Buffer> {
    const download: Promise<Download> = page.waitForEvent('download');
    await page.click(button);
    return readFileSync((await (await download).path())!);
}

test('exports the board as SVG and PNG: the title, every tier and picture, the unranked items and the credit', async ({ page }) => {
    await page.locator('#pool .pi').first().focus();
    await page.keyboard.press('1');
    await expect(tierItems(page, 0)).toHaveCount(1);
    const svg = (await exported(page, '#svg')).toString('utf8');
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).toContain('>Colours</text>');
    expect(svg).toContain('>Made with tier-engine</text>');
    expect(svg).toContain('>Not ranked</text>');
    expect(svg.match(/<image /g)).toHaveLength(10);
    const png = await exported(page, '#png');
    expect([...png.subarray(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);
    const size = await page.evaluate(
        async (bytes) => {
            const bitmap = await createImageBitmap(new Blob([new Uint8Array(bytes)]));
            return [bitmap.width, bitmap.height];
        },
        [...png],
    );
    expect(size[0]).toBeGreaterThan(600);
});
