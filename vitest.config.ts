import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  test: { include: ['tests/**/*.test.ts'] },
  resolve: {
    alias: {
      // Même alias que tsconfig et Next : sans lui, tout module de src/
      // utilisant '@/...' est intestable, et on se retrouve à écrire du code
      // applicatif en imports relatifs pour contourner l'outillage.
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
});
