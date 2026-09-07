import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  timeout: 60_000,
  // E2E 双模 tag 分流：mock 模式只跑 @mock-only，real 模式只跑 @real-backend
  // 防止 e2e-web CI job（mock 模式）误跑 @real-backend 测试导致必红
  grep: process.env.E2E_MODE === 'real' ? /@real-backend/ : /@mock-only/,
  use: {
    baseURL: 'http://localhost:5199',
    trace: 'on-first-retry'
  },
  projects: [
    {
      name: 'chromium',
      use: { browserName: 'chromium' }
    }
  ],
  webServer: {
    command:
      process.env.E2E_MODE === 'real'
        ? 'vite --port 5199 --strictPort'
        : 'cross-env VITE_MOCK=true vite --port 5199 --strictPort',
    url: 'http://localhost:5199',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000
  }
});
