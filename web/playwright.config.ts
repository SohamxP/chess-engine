import { defineConfig, devices } from '@playwright/test';

const ci = Boolean(process.env.CI);

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.e2e.ts',
  fullyParallel: false,
  forbidOnly: ci,
  retries: 0,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 20_000 },
  reporter: ci ? 'github' : 'list',
  use: {
    ...devices['Desktop Chrome'],
    baseURL: 'http://127.0.0.1:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: [
    {
      command: 'mvn --batch-mode -q -DskipTests spring-boot:run',
      cwd: '..',
      port: 8080,
      timeout: 180_000,
      reuseExistingServer: !ci,
    },
    {
      command: 'npm run dev -- --host 127.0.0.1 --port 5173 --strictPort',
      url: 'http://127.0.0.1:5173',
      timeout: 60_000,
      reuseExistingServer: !ci,
    },
  ],
});
