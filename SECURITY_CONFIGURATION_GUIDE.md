# VASTRAA Multi-Vendor Marketplace — Security Configuration Guide

This guide provides operational and configuration instructions for DevOps engineers, Site Reliability Engineers (SREs), and System Administrators deploying and maintaining the **VASTRAA** e-commerce marketplace in production.

---

## 1. Production Secret Generation & Management

### 1.1 Generating Cryptographically Secure Secrets
Run the following commands on an isolated workstation or CI/CD runner to generate strong secrets:

```bash
# Generate 64-character JWT Signing Secret
openssl rand -base64 48

# Generate 64-character Session Secret
openssl rand -base64 48

# Generate 32-character Super Admin Master Key
openssl rand -hex 24
```

### 1.2 Required Production Environment Variables
Configure these variables in your secure environment (AWS Parameter Store, Doppler, Kubernetes Secrets, or Railway/Render Environment Settings):

```ini
# Environment Mode
NODE_ENV=production
PORT=5000
LOG_LEVEL=info

# URLs
FRONTEND_URL=https://vastraasaree.com
BACKEND_URL=https://api.vastraasaree.com

# Core Cryptographic Secrets
JWT_SECRET=paste_64_char_base64_secret_here
SESSION_SECRET=paste_64_char_base64_secret_here
ADMIN_API_KEY=paste_strong_admin_key_here

# MongoDB Atlas Production URI
MONGODB_URI=mongodb+srv://vastraa_app_user:<SECURE_PASSWORD>@cluster0.xxxxx.mongodb.net/VASTRAA?retryWrites=true&w=majority&ssl=true
MONGODB_DB_NAME=VASTRAA

# Cashfree Production Credentials
CASHFREE_APP_ID=your_cashfree_prod_app_id
CASHFREE_SECRET_KEY=your_cashfree_prod_secret_key
CASHFREE_ENV=production
CASHFREE_API_VERSION=2023-08-01
CASHFREE_PG_WEBHOOK_SECRET=your_cashfree_pg_webhook_secret

# Cashfree Payouts (Vendor Auto-Settlements)
CASHFREE_PAYOUT_CLIENT_ID=your_cashfree_payout_client_id
CASHFREE_PAYOUT_CLIENT_SECRET=your_cashfree_payout_client_secret
CASHFREE_PAYOUT_ENV=production
CASHFREE_PAYOUT_WEBHOOK_SECRET=your_cashfree_payout_webhook_secret
SETTLEMENT_HOLD_DAYS=7
MINIMUM_PAYOUT_THRESHOLD=50000
PAYOUT_MODE=manual
PAYOUT_ENABLED=false

# Cloudflare R2 Storage (AWS S3 Compatible)
CLOUDFLARE_ACCOUNT_ID=your_cloudflare_account_id
R2_ACCESS_KEY_ID=your_r2_access_key
R2_SECRET_ACCESS_KEY=your_r2_secret_key
R2_BUCKET_PUBLIC=vastraa-public
R2_BUCKET_PRIVATE=vastraa-private-kyc
R2_ENDPOINT=https://<ACCOUNT_ID>.r2.cloudflarestorage.com
R2_PUBLIC_DOMAIN=https://assets.vastraasaree.com

# Zoho SMTP Settings (Port 465 SSL)
SMTP_HOST=smtppro.zoho.in
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=support@vastraasaree.com
SMTP_PASSWORD=your_zoho_app_specific_password_here
SMTP_FROM_NAME=VASTRAA
SMTP_FROM_EMAIL=noreply@vastraasaree.com
SMTP_REPLY_TO=support@vastraasaree.com
SUPER_ADMIN_EMAIL=admin@vastraasaree.com

# Shiprocket Courier Integration
SHIPROCKET_EMAIL=shipping@vastraasaree.com
SHIPROCKET_PASSWORD=your_shiprocket_api_password_here
```

---

## 2. Zero-Downtime Secret Rotation Procedures

### 2.1 Rotating `ADMIN_API_KEY`
1. Navigate to the Super Admin Dashboard -> **Settings** -> **Security**.
2. Click **Rotate Admin Key**.
3. Supply the current admin key, the new generated key, and confirm with your Admin 2FA code.
4. The system calculates a new bcrypt hash with 10 salt rounds and updates the `admin_key_hash` record in MongoDB Atlas `site_settings`.
5. Update your deployment environment variable `ADMIN_API_KEY` to the new key.
6. The in-memory cache expires within 30 seconds, seamlessly migrating to the new key.

### 2.2 Rotating Cashfree Webhook Secrets
1. In the Cashfree Merchant Dashboard, go to **Developers** -> **Webhooks**.
2. Generate a secondary webhook secret.
3. Update `CASHFREE_PG_WEBHOOK_SECRET` in your server environment variables and perform a rolling restart.
4. Decommission the old secret in the Cashfree dashboard.

### 2.3 Rotating `JWT_SECRET`
1. To rotate JWT signing keys without logging out active users abruptly:
   - Deploy new `JWT_SECRET`.
   - Active users with long-lived session records stored in `mongoSessions` will automatically fall back to session lookup on their next refresh request, smoothly re-issuing a new JWT signed with the new key.

---

## 3. Cloudflare R2 Bucket Security & CORS Configuration

### 3.1 Public Bucket Policy (`vastraa-public`)
- **Purpose**: Product catalog images, hero banners, store logos, and category thumbnails.
- **Access**: Read-only public via custom domain (e.g. `assets.vastraasaree.com`).
- **CORS Rule**:
  ```json
  [
    {
      "AllowedOrigins": [
        "https://vastraasaree.com",
        "https://www.vastraasaree.com"
      ],
      "AllowedMethods": ["GET", "HEAD", "PUT"],
      "AllowedHeaders": ["Content-Type", "x-amz-meta-*"],
      "MaxAgeSeconds": 3600
    }
  ]
  ```

### 3.2 Private Bucket Policy (`vastraa-private-kyc`)
- **Purpose**: Confidential seller KYC government documents (PAN cards, GST certificates, bank passbooks).
- **Access**: **Completely private**. No public domain or public read policy assigned.
- **Access Method**: Only accessible via server-mediated signed requests (`/api/storage/private/*`) authorized by authenticated seller ownership or Super Admin HMAC tokens.

---

## 4. MongoDB Atlas Infrastructure Hardening

### 4.1 IP Access List Configuration
1. Log in to the MongoDB Atlas Console.
2. Under **Security**, select **Network Access**.
3. Remove `0.0.0.0/0` (Anywhere).
4. Add individual static outbound IP addresses of your application servers or configure AWS/GCP VPC Peering.

### 4.2 Database User Permissions
1. Under **Database Access**, create a user named `vastraa_app_user`.
2. Assign **Specific Privileges**:
   - Database: `VASTRAA`
   - Privileges: `readWrite`
3. Do **NOT** grant `atlasAdmin`, `userAdminAnyDatabase`, or `clusterMonitor` to the application user.

---

## 5. Zoho SMTP & Transactional Email Setup

### 5.1 App-Specific Password Creation
Because two-factor authentication (2FA) is mandatory on the administrative Zoho account:
1. Log in to `mailadmin.zoho.in`.
2. Go to **My Account** -> **Security** -> **App Passwords**.
3. Generate a new password labeled `VASTRAA_PRODUCTION_SMTP`.
4. Copy the generated 16-character password and set it as `SMTP_PASSWORD` in your server environment.

### 5.2 DNS Records Verification
Verify that the following DNS records are configured on `vastraasaree.com`:
- **SPF**: `TXT` record with value `v=spf1 include:zoho.in ~all`
- **DKIM**: `TXT` record at `zoho._domainkey.vastraasaree.com`
- **DMARC**: `TXT` record at `_dmarc.vastraasaree.com` with `v=DMARC1; p=quarantine;`

---

## 6. Troubleshooting Common Security Errors

| Error Code | HTTP Status | Root Cause | Resolution |
| :--- | :--- | :--- | :--- |
| `ROLE_MISMATCH` | 403 Forbidden | Customer JWT token attempted to access a vendor-only endpoint (`/api/seller/*`). | Ensure client is logged in with seller credentials; check token subject in `AuthContext`. |
| `SESSION_REVOKED` | 401 Unauthorized | JWT payload `sid` points to a revoked or expired session. | Direct user to sign in again to obtain a fresh session. |
| `2FA_REQUIRED` | 403 Forbidden | Admin 2FA is active, but request lacks an `x-admin-session-token` with `two_factor_verified = true`. | Complete TOTP or email OTP verification via `/api/admin/2fa/login/verify`. |
| `INVALID_WEBHOOK_SIGNATURE` | 401 Unauthorized | Cashfree HMAC-SHA256 signature does not match computed digest. | Check that `CASHFREE_PG_WEBHOOK_SECRET` matches the merchant dashboard; verify raw body parsing buffer. |
| `Webhook timestamp expired` | 400 Bad Request | Cashfree webhook `x-webhook-timestamp` differs by > 5 minutes from server clock. | Check NTP time synchronization on the production host server. |
| `Invalid file format` | 400 Bad Request | Client uploaded an unapproved MIME type (e.g. SVG or HTML). | Upload raster images (JPEG, PNG, WEBP) only. |

