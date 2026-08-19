---
name: Bulk-import lease fencing
description: Durable rule for making idempotent bulk-job retries safe when processing claims can expire.
---

When an expired idempotency claim can be reclaimed, give every claim owner a unique fencing token. Condition both completion and cleanup on that token, and roll back business writes if ownership was lost.

**Why:** A timeout alone does not stop the old worker. Without fencing, a slow worker and its replacement can both commit after the lease expires, reintroducing the duplicate work the idempotency layer was meant to prevent.

**How to apply:** For bulk imports or similar jobs, commit business writes and fenced completion in the same transaction. Reclaim leases with a new token, keep fresh claims exclusive, and give pre-fencing claims a rollout grace period instead of treating missing leases as immediately stale.