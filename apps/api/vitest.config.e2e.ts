import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    // Le premier bootstrap Nest (Passport/JWT compris) peut dépasser les 10s
    // par défaut, notamment sur ce poste (voir README, « Dépannage »).
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
