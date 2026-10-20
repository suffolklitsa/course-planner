// Browser tests for the planner page. Locally they use the installed Google Chrome; CI installs Chromium.
// Set E2E_BASE_URL to run the same tests against a deployed copy, for example
//   E2E_BASE_URL=https://staging.suffolklitsa.pages.dev/planner/ npx playwright test
import { defineConfig } from "@playwright/test";

const PORT = 8799;
const remote = process.env.E2E_BASE_URL;
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 30_000,
  retries: process.env.CI || remote ? 1 : 0,
  use: {
    baseURL: remote || `http://127.0.0.1:${PORT}/`,
    ...(process.env.CI ? {} : { channel: "chrome" }),
    // Tests answer analytics requests themselves (see planner.spec.mjs). If one ever slips past them,
    // the analytics host doesn't resolve, so no real hit can be counted.
    launchOptions: { args: ["--host-resolver-rules=MAP analytics.suffolklitsa.org ~NOTFOUND"] },
  },
  webServer: remote ? undefined : {
    command: `python3 scripts/build_site.py && python3 -m http.server ${PORT} --bind 127.0.0.1 -d dist`,
    url: `http://127.0.0.1:${PORT}/`,
    reuseExistingServer: !process.env.CI,
    stdout: "ignore",
    stderr: "pipe",
    timeout: 30_000,
  },
});
