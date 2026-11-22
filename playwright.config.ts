// playwright.config.ts: the engine in a real browser, on its example page (example/). Board, keyboard, drag,
// exports and the accessibility checks, on a desktop and a phone. Tierinator's suite covers the rest in an app.
import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.PORT) || 4174;

export default defineConfig({
    testDir: 'tests/browser',
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 1 : 0,
    reporter: process.env.CI ? 'github' : 'list',
    use: { baseURL: `http://127.0.0.1:${PORT}`, trace: 'retain-on-failure', colorScheme: 'dark' },
    projects: [
        { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } } },
        { name: 'phone', use: { ...devices['Pixel 7'] } },
    ],
    webServer: {
        command: `pnpm exec vite example --port ${PORT} --strictPort --host 127.0.0.1`,
        url: `http://127.0.0.1:${PORT}`,
        reuseExistingServer: !process.env.CI,
        timeout: 60_000,
    },
});
