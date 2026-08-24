---
name: Admin 2FA test rate limits
description: Shared rate-limit state can affect multi-request recovery-login tests
---

Admin 2FA recovery-login tests share the route's module-level rate limiter across app instances in a test file.

**Why:** A test that adds extra recovery-login requests can hit the five-attempt limit because rebuilding the Express app does not reset the limiter.

**How to apply:** Prefer asserting recovery-code database state directly when that proves the behavior under test; reserve login requests for tests that specifically need the endpoint flow.