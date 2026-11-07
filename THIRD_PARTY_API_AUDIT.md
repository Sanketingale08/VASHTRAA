# VASTRAA — Third-Party API Audit Report

**Scope:** External Service Integrations (Cashfree, Shiprocket, Cloudflare R2, Zoho SMTP)  
**Objective:** Eliminate Redundant API Calls, Enforce Credential Safety, and Ensure Operational Observability  

---

## 1. Third-Party Integrations Inventory

| Service | Primary Endpoints | Trigger Conditions | Authentication Mechanism | Rate Limits / Quotas | Observability Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Shiprocket** | `/auth/login`<br/>`/orders/create/adhoc`<br/>`/courier/serviceability`<br/>`/courier/track/awb` | Order dispatch, shipping calculation, customer tracking | Bearer JWT (Proactively cached for 9 days) | Strict rate limits; requires caching | **LOGGED** via `LoggerService.logThirdParty` (redacted tokens) |
| **Cashfree PG** | `/orders`<br/>`/orders/{order_id}`<br/>`/orders/{order_id}/payments` | Customer online checkout, payment status check | App ID + Secret Key headers | 100 req/sec standard burst | **LOGGED** via `LoggerService.logThirdParty` (redacted secrets) |
| **Cashfree Payouts** | `/payout/transfers`<br/>`/payout/beneficiary` | Weekly automated vendor payout settlements | Payout Client ID + Client Secret | Batched weekly | **LOGGED** via `LoggerService.logThirdParty` |
| **Cloudflare R2** | PutObject, DeleteObject, GetObject | Image upload, KYC documents, avatar changes | S3 compatible Access Key + Secret Key | 10M class A operations/month | **LOGGED** + Content-Hash deduplication |
| **Zoho SMTP** | SMTP TLS port 587 | Order confirmation, OTP verification, vendor nudges | SMTP User + Password | Hourly send caps | **DEDUPLICATED** via `email_outbox` idempotency key |

---

## 2. In-Depth Vulnerability & Performance Audit

### A. Shiprocket Authentication
- **Initial State**: Frequent `/auth/login` calls could exhaust token quotas.
- **Audit Finding**: Shiprocket JWT tokens have a 10-day validity.
- **Remediation**: Token cached in memory with a proactive 9-day refresh cycle (`cachedToken` and `tokenExpiresAt`). Re-authenticates only on 401 response.

### B. Cashfree Payment Session Reuse
- **Initial State**: Double-clicking "Pay Now" could create multiple Cashfree order sessions.
- **Remediation**: In `artifacts/api-server/src/routes/payments.ts`, checkout checks for existing `cashfreePaymentSessionId` matching the order ID and amount before initiating a new Cashfree session.

### C. Cloudflare R2 Duplicate Image Uploads
- **Initial State**: Re-uploading identical images across variants created redundant S3 PutObject requests and bloated storage.
- **Remediation**: Implemented SHA-256 binary content hashing in `r2StorageService.ts`. If an identical file exists in `r2_assets` for the seller, the existing object key is reused without calling S3.

