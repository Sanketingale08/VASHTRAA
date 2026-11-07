# VASTRAA Multi-Vendor Marketplace — Production Security Checklist

This document is the **Mandatory Pre-Launch Production Security Checklist** for the VASTRAA e-commerce marketplace. Every item must be verified and signed off before deploying to a live production environment.

---

## 1. Environment & Secret Management

- [ ] **NODE_ENV is Explicitly Set to `production`**
  - Verify `process.env.NODE_ENV === "production"`.
  - Ensures all test bypasses, debug endpoints, and default fallback keys are permanently deactivated.
- [ ] **Cryptographically Secure `JWT_SECRET` Configured**
  - Length >= 64 characters (generated via `openssl rand -base64 48`).
  - Never committed to version control; supplied via server environment variables or secret manager.
- [ ] **Cryptographically Secure `SESSION_SECRET` Configured**
  - Length >= 64 characters.
  - Used for session encryption and tamper-proofing.
- [ ] **Strong `ADMIN_API_KEY` Set**
  - Super admin access key >= 32 characters with mixed case, numbers, and symbols.
  - Initial key hashed in MongoDB Atlas `site_settings` using bcrypt via database bootstrap.
- [ ] **Zero Hardcoded Secrets in Git Repository**
  - Verified that `.env` and `.env.*` are ignored in `.gitignore`.
  - Only safe `.env.example` with placeholders is tracked.
- [ ] **No Private Secrets in Frontend Bundles**
  - Verified no `VITE_` variables contain secret keys, database credentials, or private API secrets.

---

## 2. Database & Data Tier Hardening (MongoDB Atlas & PostgreSQL)

- [ ] **MongoDB Atlas IP Access List Restricted**
  - Public `0.0.0.0/0` access is **strictly disabled**.
  - Only production application server static IP addresses or AWS/GCP VPC peering CIDRs are allowlisted.
- [ ] **Least-Privilege Database Users**
  - Dedicated MongoDB user with `readWrite` permissions on the `VASTRAA` database only; no `dbAdminAnyDatabase` or `root` roles in application connection string.
- [ ] **TLS 1.3 / SSL Enforced for Database Connections**
  - Connection string uses `mongodb+srv://` with `retryWrites=true&w=majority&ssl=true`.
- [ ] **NoSQL Injection Defenses Active**
  - Global `$` operator stripping middleware active on all incoming JSON request bodies and query parameters.
- [ ] **Daily Automated Backups & Point-in-Time Recovery (PITR)**
  - Continuous cloud backups enabled in MongoDB Atlas with at least 7-day retention.
  - Periodic test restoration executed to verify snapshot integrity.

---

## 3. Cloudflare R2 & Object Storage Security

- [ ] **Private Bucket for KYC Documents**
  - Seller government IDs (PAN card, GST certificate, bank proof) stored in `R2_BUCKET_PRIVATE`.
  - Direct public access disabled on private bucket.
- [ ] **Access Authorization Enforced on All Private Documents**
  - All requests to `/api/storage/private/*` require verified Admin authorization or authenticated owner seller ID.
  - Anonymous access strictly blocked with HTTP 401.
- [ ] **Short-Lived Signed URLs for Document Previews**
  - Admin signed preview URLs expire in 300 seconds (5 minutes) and use HMAC-SHA256 tokens rather than embedding master admin credentials.
- [ ] **File Type & Size Restrictions Enforced**
  - Upload allowlist strictly restricted to `image/jpeg`, `image/png`, `image/webp`, and `application/pdf` (for KYC).
  - Dangerous formats (`image/svg+xml`, `text/html`, executables) unconditionally rejected.
  - Maximum upload size capped at 25MB (15MB for KYC).

---

## 4. Cashfree Payment Gateway & Payouts Hardening

- [ ] **Production API Credentials Configured**
  - `CASHFREE_ENV=production`.
  - Valid `CASHFREE_APP_ID` and `CASHFREE_SECRET_KEY` provisioned from Cashfree Merchant Dashboard.
- [ ] **Cashfree Webhook Signature Verification Active**
  - Every incoming webhook strictly verified against `CASHFREE_PG_WEBHOOK_SECRET` using HMAC-SHA256.
  - Sandbox signature bypass deactivated in production.
- [ ] **Webhook Replay Protection Enforced**
  - `x-webhook-timestamp` freshness enforced with 5-minute maximum tolerance.
- [ ] **Idempotent Order Confirmation**
  - Orders already marked `paid` cannot be double-processed or trigger duplicate stock deductions.
- [ ] **Authoritative Pricing & Amount Verification**
  - Client-side prices and totals completely ignored; calculated authoritatively on the backend.
  - Paid amount verified against `order.total` before order confirmation.
- [ ] **Cashfree Payouts Verification (Vendor Settlements)**
  - `CASHFREE_PAYOUT_ENV=production`.
  - Payout webhook signature verified against `CASHFREE_PAYOUT_WEBHOOK_SECRET`.
  - Settlements held for `SETTLEMENT_HOLD_DAYS=7` to allow for customer return windows before transfer.

---

## 5. Shiprocket Logistics Integration Security

- [ ] **Production API Credentials Configured**
  - Valid `SHIPROCKET_EMAIL` and `SHIPROCKET_PASSWORD` configured in server environment.
- [ ] **Token Caching & Secure Storage**
  - Shiprocket JWT token cached in memory with automatic refresh prior to expiration; never exposed to frontend clients.
- [ ] **Seller Address Validation**
  - Pickup addresses validated to prevent courier dispatch failures.

---

## 6. Zoho SMTP & Transactional Email Hardening

- [ ] **Port 465 SSL Connection Active**
  - Verified `SMTP_HOST=smtppro.zoho.in`, `SMTP_PORT=465`, `SMTP_SECURE=true`.
- [ ] **Dedicated App-Specific Password**
  - Uses Zoho 2FA App-Specific Password rather than master account password.
- [ ] **Sender Authentication (SPF / DKIM / DMARC)**
  - DNS records configured on `vastraasaree.com` for Zoho SPF (`include:zoho.in`), DKIM (`zoho._domainkey`), and DMARC (`v=DMARC1; p=quarantine`).
- [ ] **Audit Logging of All Outbound Emails**
  - All transactional emails (order confirmation, dispatch, seller alerts) recorded with deduplication idempotency keys in `email_outbox`.

---

## 7. Network, CORS & HTTP Transport Security

- [ ] **Full HTTPS / TLS 1.3 Transport**
  - Plain HTTP traffic automatically redirected to HTTPS (Port 443).
- [ ] **Strict Transport Security (HSTS)**
  - `Strict-Transport-Security: max-age=31536000; includeSubDomains` header active.
- [ ] **Strict CORS Policy**
  - Wildcard origin reflection disabled. Only `https://vastraasaree.com` and `https://www.vastraasaree.com` permitted to make credentialed API requests.
- [ ] **Standard Defensive Headers Active**
  - `X-Content-Type-Options: nosniff` (MIME sniffing prevention).
  - `X-Frame-Options: SAMEORIGIN` (Clickjacking prevention).
  - `X-XSS-Protection: 1; mode=block`.
  - `Referrer-Policy: strict-origin-when-cross-origin`.
- [ ] **Rate Limiting Active Across Key Endpoints**
  - Authentication (15 requests / 15 mins per IP).
  - Password Reset (5 requests / 15 mins per IP).
  - File Uploads (600 requests / 15 mins per vendor).
  - Coupon Validation (20 requests / 10 mins).
  - PDF Invoices (15 downloads / 5 mins).

---

## 8. Role-Based Access Control & Session Governance

- [ ] **Vendor Onboarding Approval Workflow Active**
  - Newly registered vendors default to `status: "pending"`; cannot self-approve.
  - Product additions require vendor authentication and valid approval status.
- [ ] **Vendor Isolation Verified**
  - Vendors can only view and mutate their own products, inventory, orders, and settlements.
- [ ] **Customer Profile Isolation Verified**
  - Customers can only access their own addresses, wishlists, and order histories.
- [ ] **Super Admin 2FA Gate**
  - Admin 2FA enabled in `site_settings`. Session tokens require two-factor verification for administrative actions.
- [ ] **Session Invalidation on Logout**
  - Session tokens flagged `isRevoked: true` on logout, terminating subsequent JWT authorizations.

---

## 9. Sign-Off & Deployment Authorization

| Role | Sign-Off Status | Date |
| :--- | :--- | :--- |
| **Lead Application Security Engineer** | **APPROVED** | November 2026 |
| **DevSecOps / SRE Lead** | **PENDING PRODUCTION DEPLOY** | ____________ |
| **Super Administrator** | **PENDING PRODUCTION DEPLOY** | ____________ |

