---
name: TwirlDrape e2e base URL
description: Why playwright.config.ts must default to the Vite dev server port, not the :80 reverse proxy, for the twirldrape web artifact
---

`artifacts/twirldrape/playwright.config.ts` defaults `baseURL` to
`http://localhost:${PORT}` (the artifact's own Vite dev server port, e.g.
23779), not `http://localhost:80` (the Replit-managed reverse proxy).

**Why:** the proxy on :80 forwards `/api` to port 8080, but the twirldrape
API server actually listens on :3001. Hitting :80 directly for API calls
returns 502s for every request. The Vite dev server on the artifact's own
`PORT` proxies `/api/*` to the real API server on :3001 (see its
`vite.config.ts`), so relative fetches from tests resolve correctly.

**How to apply:** e2e spec files should always use relative URLs (e.g.
`page.request.get("/api/products")`) or `page.route("**/api/...")`, and rely
on the configured `baseURL` — never hardcode `localhost:3001` or
`localhost:80` in a spec file. `PLAYWRIGHT_BASE_URL` env var overrides the
default when tests need to target something else (e.g. a deployed URL).

Note: this differs from the mobile Expo e2e setup, where hitting the shared
proxy on port 80 directly is correct for `API_BASE` — that's a different
artifact with a different proxy path setup. Don't conflate the two.
