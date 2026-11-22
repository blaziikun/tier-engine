// vitest.config.ts: the engine's unit tests (an app's browser tests run the whole app, in its own repo).
import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        include: ['tests/unit/**/*.test.ts'],
    },
});
