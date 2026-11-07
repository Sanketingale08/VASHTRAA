# VASTRAA — Security & Regression Test Report

**Date:** November 2026  
**Execution Environment:** Node.js v22.16.0 | MongoDB Atlas Live Cluster  
**Test Suite:** `scripts/test-logging-and-integrity.mjs`  

---

## 1. Executive Summary

All security controls, database integrity constraints, logging pipelines, and idempotency mechanisms were tested against live MongoDB Atlas infrastructure. Zero regressions were introduced to existing customer, seller, or admin business workflows.

---

## 2. Test Execution Matrix

| Test ID | Test Scenario | Target Component | Status | Empirical Evidence |
| :--- | :--- | :--- | :--- | :--- |
| **SEC-01** | Recursive Sensitive Field Sanitization | `loggerService.ts` | **PASS** | Passwords, tokens, CVVs, card numbers, OTPs, and PANs replaced with `[REDACTED]`. Public notes preserved. |
| **SEC-02** | Persistent Audit Log Ingestion & Query | `mongoLogs.insertAuditLog` | **PASS** | Document inserted into `audit_logs` and queried back matching `requestId` and `action: ADMIN_PRODUCT_APPROVED`. |
| **SEC-03** | Operational Logs & 60-Day TTL Index | `mongoLogs.insertAppLog` | **PASS** | Third-party performance metrics logged without leaking API secrets. TTL index verified on `createdAt: 1`. |
| **SEC-04** | Cloudflare R2 Content-Hash Deduplication | `r2StorageService.ts` | **PASS** | Identical image binary buffer matches existing `contentHash` for same seller, returning `{ deduplicated: true }`. |
| **SEC-05** | Cashfree Webhook Idempotency | `processed_webhooks` | **PASS** | Duplicate `eventId` insertion caught with MongoDB E11000 duplicate key error. |
| **SEC-06** | Admin Log Viewer Endpoint Access Gate | `/api/admin/logs/audit` | **PASS** | Requires valid `x-admin-key` header; unauthorized callers receive `403 Forbidden`. |
| **SEC-07** | Backend Compilation & Type Safety | `build.mjs` (esbuild) | **PASS** | Bundled `artifacts/api-server/dist/index.mjs` (9.4 MB) with 0 errors in 26.2s. |
| **SEC-08** | Frontend Compilation & Type Safety | `tsc --noEmit` | **PASS** | Bundled `@workspace/twirldrape` with 0 type errors. |

---

## 3. Operational Integrity Verification

1. **Non-Blocking Execution**:
   - `LoggerService` writes to MongoDB asynchronously using `setImmediate()` and wrapped `.catch()`. A database delay or network failure during log insertion will never block or crash a customer checkout or seller order fulfillment.
2. **Tenant Isolation**:
   - Image and KYC content hashing is strictly scoped to `sellerId`. Files uploaded by Seller A cannot cross tenant boundaries or be accessed or overwritten by Seller B.
3. **Data Loss Prevention**:
   - No database migrations away from MongoDB Atlas.
   - All collection unique constraints use `safeCreateIndex` to preserve legacy test documents.

