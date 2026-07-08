---
name: Expo E2E Playwright URL
description: How to find and use the correct URL for Playwright E2E tests against the TwirlDrape mobile Expo app.
---

The Expo Metro bundler for `@workspace/twirldrape-mobile` runs on local port **24295** (`expo start --localhost --port 24295`), mapped in `.replit` to externalPort 3001.

**Why:** The `REPLIT_EXPO_DEV_DOMAIN` is the Expo-specific domain for QR/dev tools. The Replit testing subagent (`runTest`) navigates through Replit's proxy at localhost:80, NOT through the Expo domain — so giving it the Expo dev domain URL causes it to hit the twirldrape web app instead (the proxy serves that at `/explore`).

**How to apply:**
- For committed Playwright spec files: `PLAYWRIGHT_BASE_URL=http://localhost:24295`
- For `runTest` test plans: use full URL `http://localhost:24295/explore` (not path-relative) in `[Browser] Navigate to` steps since the mobile app bypasses the shared Replit proxy.
- The `package.json test:e2e` script defaults to port 24295.
