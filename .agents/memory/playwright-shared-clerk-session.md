---
name: Playwright shared Clerk session in beforeAll
description: How to share a single Clerk sign-in across all tests in a describe block using beforeAll + storageState, and the ENOENT trap to avoid.
---

## The rule

When sharing a Clerk session across tests via `test.use({ storageState: PATH })` + `beforeAll`, write a valid-but-empty placeholder file **before** calling `browser.newContext()` inside `beforeAll`, then overwrite it with real credentials after sign-in.

```typescript
import { writeFileSync } from "fs";

const STATE_FILE = "/tmp/my-spec-state.json";

test.use({ storageState: STATE_FILE });

test.beforeAll(async ({ browser, baseURL }) => {
  seller = await createVerifiedSeller();

  // Must exist before browser.newContext() — Playwright applies storageState
  // to that call even in beforeAll.
  writeFileSync(STATE_FILE, JSON.stringify({ cookies: [], origins: [] }), "utf8");

  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await signInSeller(page, baseURL!, seller.userId);
  await ctx.storageState({ path: STATE_FILE }); // overwrite with real session
  await ctx.close();
});
```

**Why:** Playwright applies `test.use({ storageState })` to *every* `browser.newContext()` call, including those inside `beforeAll`. If the file doesn't exist when `newContext()` is called, Playwright throws ENOENT immediately — before the sign-in has a chance to create the file.

**How to apply:** Any spec that needs a shared Clerk session (to avoid one auth round-trip per test) should follow this pattern. The placeholder is empty cookies/origins so the sign-in page loads fresh; the real state is written before the first real test context is created.

**Performance gained:** Reduces total runtime for a 3-test suite from ~105 s (per-test auth) to ~53 s (shared auth + fast per-test body).
