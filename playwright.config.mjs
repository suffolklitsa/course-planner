// Browser tests for the planner page. Locally they use the installed Google Chrome; CI installs Chromium.
import { defineConfig } from "@playwright/test";

const PORT = 8799;
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: `http://127.0.0.1:${PORT}/`,
    ...(process.env.CI ? {} : { channel: "chrome" }),
  },
  webServer: {
    command: `python3 scripts/build_site.py && python3 -m http.server ${PORT} --bind 127.0.0.1 -d dist`,
    url: `http://127.0.0.1:${PORT}/`,
    reuseExistingServer: !process.env.CI,
    stdout: "ignore",
    stderr: "pipe",
    timeout: 30_000,
  },
});
