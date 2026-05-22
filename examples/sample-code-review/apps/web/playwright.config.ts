import { defineConfig, devices } from '@playwright/test';

const webPort = 3000;
const apiPort = 3001;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  timeout: 60_000,
  use: {
    ...devices['Desktop Chrome'],
    baseURL: `http://localhost:${webPort}`,
    trace: 'on-first-retry',
  },
  webServer: [
    {
      command: 'yarn dev',
      cwd: '../api',
      url: `http://localhost:${apiPort}/api`,
      reuseExistingServer: true,
      timeout: 120_000,
    },
    {
      command: 'yarn dev',
      url: `http://localhost:${webPort}`,
      reuseExistingServer: true,
      timeout: 120_000,
    },
  ],
});
