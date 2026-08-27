import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.E2E_BASE_URL || "http://127.0.0.1:5175";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI
    ? [["line"], ["html", { open: "never" }]]
    : "list",
  timeout: 90000,
  expect: {
    timeout: 10000,
  },
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: [
    {
      command: "npm --prefix ../backend start",
      url: "http://127.0.0.1:3001/api/health",
      reuseExistingServer: !process.env.CI,
      timeout: 120000,
      stdout: "pipe",
      stderr: "pipe",
    },
    {
      command: "npm run dev -- --host 127.0.0.1",
      url: baseURL,
      reuseExistingServer: !process.env.CI,
      timeout: 120000,
      stdout: "pipe",
      stderr: "pipe",
    },
  ],
});
