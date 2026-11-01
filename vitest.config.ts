import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@railpulse/shared': r('./packages/shared/src/index.ts'),
      '@railpulse/domain': r('./packages/domain/src/index.ts'),
      '@railpulse/db': r('./packages/db/src/index.ts'),
      '@railpulse/provider-railradar': r('./packages/provider-railradar/src/index.ts'),
      '@railpulse/ui-tokens': r('./packages/ui-tokens/src/index.ts'),
    },
  },
  test: {
    include: ['packages/**/src/**/*.test.ts', 'apps/**/src/**/*.test.{ts,tsx}'],
    environment: 'node',
    reporters: ['default'],
    hookTimeout: 60_000,
    testTimeout: 60_000,
  },
});
