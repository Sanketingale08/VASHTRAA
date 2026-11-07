# VASTRAA Multi-Vendor Marketplace — Security Test Plan

This document establishes the **Automated and Manual Security Verification Test Plan** for the VASTRAA e-commerce marketplace. It defines repeatable test cases to prevent security regressions across future deployments.

---

## 1. Test Suite Architecture & Overview

Security testing is divided into two operational tiers:
1. **Automated Continuous Integration (CI) Security Test Suites**: Executed via Vitest in `artifacts/api-server/src/__tests__`.
2. **Manual & Penetration Verification Scenarios**: HTTP curl/Postman test vectors for staging and production pre-flight checks.

---

## 2. Automated Security Test Suites

### 2.1 Core Security Suite: `security-remediation-audit.test.ts`
- **Location**: `artifacts/api-server/src/__tests__/security-remediation-audit.test.ts`
- **Command**:
  ```bash
  npm --prefix artifacts/api-server test -- src/__tests__/security-remediation-audit.test.ts
  ```
- **Coverage**:
  - JWT runtime secret generation in production (prohibiting static fallback strings).
  - JWT signature tamper detection.
  - Safe raster MIME validation (JPG, PNG, WEBP).
  - Stored XSS defense: strict rejection of `image/svg+xml` and HTML payloads.
  - File upload size cap enforcement (> 25MB rejected).
  - Production admin key verification: strict rejection of `Admin@123` when uninitialized.
  - Underpayment defense: rejection of order payment confirmations where `amount < order.total`.

### 2.2 Rate Limit & Abuse Suite: `rate-limit-abuse.test.ts`
- **Location**: `artifacts/api-server/src/__tests__/rate-limit-abuse.test.ts`
- **Command**:
  ```bash
  npm --prefix artifacts/api-server test -- src/__tests__/rate-limit-abuse.test.ts
  ```
- **Coverage**:
  - Brute force protection on `/api/auth/login`.
  - OTP request throttling on `/api/seller/send-verification-code`.
  - Coupon validation rate limits.
  - Support ticket creation limits.

### 2.3 Vendor Isolation Suite: `test-seller-isolation.mjs`
- **Location**: `scripts/test-seller-isolation.mjs`
- **Command**:
  ```bash
  node scripts/test-seller-isolation.mjs
  ```
- **Coverage**:
  - Cross-tenant product modification rejection (Seller A cannot edit Seller B's product).
  - Order item vendor isolation (Seller A cannot view orders belonging exclusively to Seller B).
  - Settlement isolation.

---

## 3. Manual Security Verification Test Cases

### TC-SEC-01: Unauthenticated KYC File Access
- **Objective**: Verify that anonymous users cannot download private seller KYC documents.
- **Preconditions**: A private document exists at `/api/storage/private/sellers/seller-123/kyc/pan.pdf`.
- **Execution**:
  ```bash
  curl -i -X GET https://api.vastraasaree.com/api/storage/private/sellers/seller-123/kyc/pan.pdf
  ```
- **Expected Result**:
  - HTTP Status: `401 Unauthorized`
  - Response Body: `{"error": "Unauthorized: Access to private document requires authentication or admin credentials"}`

---

### TC-SEC-02: Cross-Seller KYC Access (IDOR)
- **Objective**: Verify that Seller B cannot download Seller A's private KYC documents.
- **Preconditions**: Seller B authenticated with a valid JWT token (`Bearer <seller_B_token>`).
- **Execution**:
  ```bash
  curl -i -X GET https://api.vastraasaree.com/api/storage/private/sellers/seller-A/kyc/pan.pdf \
    -H "Authorization: Bearer <seller_B_token>"
  ```
- **Expected Result**:
  - HTTP Status: `403 Forbidden`
  - Response Body: `{"error": "Forbidden — access to private document denied"}`

---

### TC-SEC-03: Default Admin Key Rejection in Production
- **Objective**: Ensure that `Admin@123` is unconditionally rejected when `NODE_ENV=production`.
- **Execution**:
  ```bash
  curl -i -X GET https://api.vastraasaree.com/api/admin/vendors \
    -H "x-admin-key: Admin@123"
  ```
- **Expected Result**:
  - HTTP Status: `403 Forbidden`
  - Response Body: `{"error": "Forbidden"}`

---

### TC-SEC-04: Seller Registration Self-Approval Prevention
- **Objective**: Ensure newly registering vendors cannot promote their account to `approved`.
- **Execution**:
  ```bash
  curl -i -X POST https://api.vastraasaree.com/api/seller/register \
    -H "Content-Type: application/json" \
    -d '{
      "officialShopName": "Hacker Boutique",
      "mobile": "9876543210",
      "panNumber": "ABCDE1234F",
      "panCardUrl": "https://example.com/pan.jpg",
      "bankHolder": "Hacker",
      "bankName": "Hacker Bank",
      "bankAccount": "1234567890",
      "bankIfsc": "HACK0001234",
      "shopCity": "Mumbai",
      "shopState": "Maharashtra",
      "shopPincode": "400001",
      "status": "approved",
      "approvalStatus": "approved"
    }'
  ```
- **Expected Result**:
  - Database verification shows seller record created with `status: "pending"` and `approvalStatus: "pending"`.
  - Storefront does not display the seller until Super Admin manually approves it.

---

### TC-SEC-05: SVG File Upload Rejection (Stored XSS)
- **Objective**: Verify that SVG uploads are blocked when requesting presigned upload URLs.
- **Execution**:
  ```bash
  curl -i -X POST https://api.vastraasaree.com/api/seller/upload/store-asset/presigned-url \
    -H "Content-Type: application/json" \
    -d '{
      "assetType": "avatar",
      "fileName": "avatar.svg",
      "contentType": "image/svg+xml",
      "size": 2048
    }'
  ```
- **Expected Result**:
  - HTTP Status: `400 Bad Request`
  - Response Body contains: `"Invalid file format. Allowed image formats: JPG, PNG, WEBP."`

---

### TC-SEC-06: Cashfree Webhook Replay Protection
- **Objective**: Ensure replayed webhooks with old timestamps are rejected.
- **Execution**:
  ```bash
  # Send webhook with timestamp older than 10 minutes (600,000 ms)
  OLD_TIMESTAMP=$(node -e "console.log(Date.now() - 600000)")
  curl -i -X POST https://api.vastraasaree.com/api/payments/cashfree/webhook \
    -H "Content-Type: application/json" \
    -H "x-webhook-signature: mock_signature" \
    -H "x-webhook-timestamp: $OLD_TIMESTAMP" \
    -d '{"type": "PAYMENT_SUCCESS_WEBHOOK", "data": {"order": {"order_id": "ORD-123"}}}'
  ```
- **Expected Result**:
  - HTTP Status: `400 Bad Request`
  - Response Body: `{"error": "Webhook timestamp expired"}`

---

### TC-SEC-07: NoSQL Operator Injection Sanitization
- **Objective**: Ensure MongoDB operators in JSON bodies are stripped before database evaluation.
- **Execution**:
  ```bash
  curl -i -X POST https://api.vastraasaree.com/api/auth/login \
    -H "Content-Type: application/json" \
    -d '{"email": {"$gt": ""}, "password": {"$gt": ""}}'
  ```
- **Expected Result**:
  - The middleware strips `$gt`, leaving empty/undefined input.
  - HTTP Status: `400 Bad Request` or `401 Unauthorized` (validation error for missing string email). No database error or bypass occurs.

---

### TC-SEC-08: HTTP Security Headers Inspection
- **Objective**: Verify that all standard defensive OWASP headers are present on API responses.
- **Execution**:
  ```bash
  curl -i -I https://api.vastraasaree.com/api/categories
  ```
- **Expected Result**:
  - `X-Content-Type-Options: nosniff`
  - `X-Frame-Options: SAMEORIGIN`
  - `X-XSS-Protection: 1; mode=block`
  - `Referrer-Policy: strict-origin-when-cross-origin`
  - `Strict-Transport-Security: max-age=31536000; includeSubDomains` (in production)

---

## 4. Regression Testing Execution Checklist

Prior to every release tag:
1. Run server build: `node artifacts/api-server/build.mjs`
2. Run frontend build: `npm --prefix artifacts/vastraa run build`
3. Run security audit tests: `npm --prefix artifacts/api-server test -- src/__tests__/security-remediation-audit.test.ts`
4. Run transactional email tests: `npm --prefix artifacts/api-server test -- src/__tests__/zoho-smtp-production-integration.test.ts`
5. Run seller isolation script: `node scripts/test-seller-isolation.mjs`

