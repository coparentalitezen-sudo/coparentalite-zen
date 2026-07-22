import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  use: {
    baseURL: 'http://localhost:3200',
    launchOptions: {
      executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
      args: ['--no-sandbox'],
    },
  },
  webServer: {
    command: 'npx next start -p 3200',
    url: 'http://localhost:3200',
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
