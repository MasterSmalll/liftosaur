import { defineConfig, devices } from "@playwright/test";

// Deliberately isolated from the production site and the production Liftosaur API.
// Local app is started by webpack-dev-server; all tests use nosync=true.
export default defineConfig({
  testDir: "tests",
  testMatch: "forkWebValidation.spec.ts",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  timeout: 90_000,
  expect: { timeout: 12_000 },
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [["list"], ["html", { outputFolder: "playwright-report/fork", open: "never" }]],
  use: {
    ...devices["Desktop Chrome"],
    baseURL: "http://local.liftosaur.com:8080",
    testIdAttribute: "data-testid",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    serviceWorkers: "block",
  },
  webServer: {
    command: "npm start",
    url: "http://127.0.0.1:8080/app/index.html",
    timeout: 240_000,
    reuseExistingServer: !process.env.CI,
    env: { ...process.env, BROWSER: "none" },
    stdout: "pipe",
    stderr: "pipe",
  },
});
