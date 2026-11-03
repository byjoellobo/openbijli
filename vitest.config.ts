import { defineConfig } from 'vitest/config';

// Resolve workspace packages to their TypeScript sources so tests never depend on a
// stale build. See the "source" export condition in each package.json. Node-side tests
// run in Vite's SSR environment, which reads ssr.resolve.conditions.
const conditions = ['source', 'import', 'module', 'node', 'default'];

export default defineConfig({
  resolve: { conditions },
  ssr: { resolve: { conditions, externalConditions: ['source'] } },
  test: {
    include: ['packages/*/test/**/*.test.ts', 'scripts/test/**/*.test.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: ['packages/*/src/**/*.ts'],
      exclude: ['packages/*/src/generated/**', 'packages/*/src/cli.ts', 'packages/*/src/**/index.ts'],
      thresholds: { lines: 80, functions: 80, branches: 75, statements: 80 },
    },
  },
});
