import { defineConfig, devices } from "@playwright/test";
import { execSync } from "child_process";

// Base URL resolution:
// - PLAYWRIGHT_BASE_URL, if set, always wins (e.g. CI pointing at a deployed URL).
// - Otherwise we default to the Vite dev server on `PORT` (23779 locally), NOT the
//   Replit-managed reverse proxy on port 80. The proxy on :80 forwards `/api` to port
//   8080, but this app's API server actually listens on port 3001 — so hitting :80
//   directly returns 502s for every API call. The Vite dev server (this `PORT`)
//   proxies `/api/*` requests to the real API server on :3001 (see vite.config.ts),
//   so all relative fetches from tests (e.g. `page.request.get("/api/products")`)
//   resolve correctly. Test files should always use relative URLs / `page.request`
//   against this baseURL rather than hardcoding a host:port for the API.
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://localhost:${process.env.PORT ?? 23779}`;

function resolveChromiumPath(): string | undefined {
  if (process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH) {
    return process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
  }
  try {
    return execSync("which chromium", { encoding: "utf8" }).trim();
  } catch {
    return undefined;
  }
}

const executablePath = resolveChromiumPath();

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  timeout: 90_000,
  reporter: "list",
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    ...(executablePath ? { launchOptions: { executablePath } } : {}),
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
