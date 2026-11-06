import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  use: { baseURL: "http://127.0.0.1:3100", ...devices["Desktop Chrome"] },
  webServer: {
    command: "npm run dev -- --port 3100",
    url: "http://127.0.0.1:3100",
    reuseExistingServer: false,
    timeout: 120000,
    env: {
      DEMO_MODE: "true",
      APP_URL: "http://127.0.0.1:3100",
      NEXT_OUTPUT_DIR: ".next-e2e",
    },
  },
  reporter: "list",
});
