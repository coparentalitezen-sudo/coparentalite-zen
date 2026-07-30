import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',

  timeout: 30_000,

  use: {
    baseURL: 'http://127.0.0.1:3200',
    headless: true,
    // En intégration continue, « playwright install » place le navigateur au
    // bon endroit et cette variable reste vide. Dans un environnement où le
    // navigateur est ailleurs, on l'indique sans modifier la configuration.
    ...(process.env.PLAYWRIGHT_CHROMIUM_PATH
      ? {
          launchOptions: {
            executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH,
            args: ['--no-sandbox'],
          },
        }
      : {}),
  },

  webServer: {
    command: 'npm run build && npx next start -p 3200',
    url: 'http://127.0.0.1:3200',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});