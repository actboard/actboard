import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,

  reporter: [
    ['list'],
    ['@actboard/playwright-reporter', {
      serverUrl: process.env.ACTBOARD_SERVER_URL || 'http://localhost:3141',
      apiKey:    process.env.ACTBOARD_API_KEY,
      project:   process.env.ACTBOARD_PROJECT   || 'example',
      branch:    process.env.GITHUB_REF_NAME    || 'local',
      commitSha: process.env.GITHUB_SHA,
      triggeredBy: process.env.CI ? 'ci' : 'local',
    }],
  ],

  use: {
    baseURL: 'https://playwright.dev',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
