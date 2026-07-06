import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
    plugins: [react()],
    test: {
        globals: true,
        environment: 'jsdom',
        setupFiles: ['./vitest.setup.ts'],
        css: true,
        include: ['__tests__/**/*.{test,spec}.{ts,tsx}'],
        exclude: ['e2e/**', 'node_modules/**'],
        coverage: {
            provider: 'v8',
            reporter: ['text', 'json', 'html'],
            thresholds: {
                lines: 20,
                functions: 20,
                branches: 15,
                statements: 20,
            },
            exclude: [
                'node_modules/',
                'vitest.setup.ts',
                'e2e/**',
                '**/*.config.ts',
                '**/*.config.mts',
                '**/*.d.ts',
                '**/types.ts',
            ],
        },
    },
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './'),
        },
    },
});
