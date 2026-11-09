# 🛍️ VASTRAA — Enterprise Multi-Vendor Fashion & Ethnic Wear Marketplace

VASTRAA is a modern, full-stack, multi-vendor fashion and handloom apparel e-commerce ecosystem. Built with TypeScript across a pnpm monorepo architecture, VASTRAA provides an end-to-end shopping experience for customers, a dedicated seller portal for vendor onboarding and catalog management, an administrative command center for super admins, a cross-platform mobile client, and a high-performance Express backend with enterprise-grade audit logging.

---

### 💰 Pricing & Seller Settlement Engine (v2 Model)
- **Customer Side**: Customer pays `taxable = base + shipping` and `gst = round(taxable * productGstRate)` (5%). Commission is NEVER shown or charged to the customer.
- **Seller Side**: Platform commission (18%) is deducted ONLY from the seller base price.
  - `commission = round(base * 18%)` (1800 BPS)
  - `gstOnCommission = round(commission * 5%)` (500 BPS configurable)
  - `tcs = round(base * 1%)` (100 BPS)
  - `sellerSettlement = base - commission - gstOnCommission - tcs`
  - `platformKeeps = commission + gstOnCommission`
- **Integer Paise Math**: All monetary calculations execute in exact integer paise, rounded half-up once per line.
- **Order Versioning (`pricingVersion`)**: Existing stored orders remain preserved as `v1`. New orders receive `v2`. UI and financial reporting dynamically branch on `pricingVersion`.

---

## 🚀 Key Features

### 🛒 Customer Storefront (`@workspace/vastraa`)
- **Product Discovery**: Browse authentic ethnic apparel, sarees, and lehengas categorized by craft technique (Banarasi, Kanjeevaram, Chanderi, Bandhani, Paithani, Tussar Silk), regional clusters, fabric purity, and occasion.
- **Cart & Fast Checkout**: Real-time shopping cart drawer, saved cards, UPI payment methods, address book with autocomplete, and Cashfree payment gateway integration.
- **Account & Orders**: Order history, order tracking timeline, returns & refunds management, user preferences, and cross-device persistent wishlist.

### 👔 Vendor & Seller Portal
- **Seller Onboarding & KYC**: Multi-step registration draft flow with document submission, bank details, pickup address, and approval status tracking.
- **Catalog Management**: Product publishing with approval workflows, single and bulk CSV product uploads, multi-image gallery asset managers, and stock management.
- **Fulfillment & Analytics**: Order processing, shipment generation via Shiprocket, real-time sales reporting, payout tracking, and customer communication.

### 🛡️ Super Admin Control Dashboard
- **Vendor Governance**: Multi-tier approval workflows, vendor KYC approval/rejection, account suspension, reactivation, and compliance audits across all 16 marketplace modules.
- **Catalog Moderation**: Category and subcategory hierarchy, image asset management, and bulk product approvals/rejections.
- **Financial Operations**: Settlement deduplication, automated payout schedules, dispute resolution, and revenue metrics.
- **Promotions & Content**: Site-wide coupon management with usage limits, banner configuration, system notifications, and 2FA authentication.
- **Audit & Application Log Explorer (`/admin/logs`)**: Dedicated real-time log viewer with search, multi-attribute filtering (role, actor, action, level, date range), and one-click CSV export.

### 📱 Mobile Experience (`@workspace/vastraa-mobile`)
- Native mobile client powered by **React Native & Expo**, featuring mobile product navigation, shopper cart/checkout flow, and seller dashboard views.

---

## 🔒 Enterprise Structured Logging System

VASTRAA implements structured, centralized, persistent logging across all seller and admin operations without storing plain credentials, tokens, or customer PII:

1. **`audit_logs` Collection**:
   - Records high-value governance and business actions (`SELLER_APPROVED`, `PRODUCT_STATUS_UPDATE`, `REFUND_ISSUED`, `COMMISSION_UPDATED`).
   - Indexed on `timestamp`, `actor.id`, `actor.role`, `action`, and `resource.id`.
2. **`application_logs` Collection**:
   - Captures operational events, errors, uncaught exceptions, and external API responses (Shiprocket & Cashfree).
   - Configured with an automated **60-day MongoDB TTL index** (`expireAfterSeconds: 5184000`) for cost and storage hygiene.
3. **Correlation Tracking**:
   - Unique `X-Request-Id` generated for every incoming request and propagated to third-party API telemetry for trace analysis.

---

## 📦 Project Architecture & Workspace Layout

The repository is structured as a `pnpm` monorepo workspace split into `artifacts/` (applications) and `lib/` (shared packages & drivers):

```text
VASTRAA/
├── artifacts/
│   ├── api-server/         # Express 5 REST API Server & background worker services
│   ├── vastraa/            # Vite + React web application (Storefront, Seller & Admin)
│   ├── vastraa mobile/     # Expo / React Native mobile application
│   └── mockup-sandbox/     # Isolated component playground & design testing sandbox
├── lib/
│   ├── db/                 # MongoDB Atlas driver, schemas, repositories, and index management
│   ├── api-spec/           # OpenAPI 3.0 specification (`openapi.yaml`)
│   ├── api-zod/            # Auto-generated Zod request/response validation schemas
│   ├── api-client-react/   # Auto-generated TanStack React Query API client hooks (via Orval)
│   └── object-storage-web/ # Web object storage utilities & file handling helpers
├── scripts/                # Build and workspace utility scripts
├── vercel.json             # Multi-service Vercel deployment orchestration
├── .env                    # Environment configuration variables
├── pnpm-workspace.yaml     # pnpm workspace definition & catalog constraints
└── package.json            # Workspace root package configuration
```

---

## 🛠️ Technology Stack

| Category | Technology |
|---|---|
| **Monorepo & Package Manager** | `pnpm` Workspaces, Node.js 22+, TypeScript 5.9 |
| **Backend API Server** | Express 5, Pino Logger, Vitest, ESBuild |
| **Database & Persistence** | MongoDB Atlas (Native Driver with indexed collections & TTL support) |
| **Cloud Storage** | Cloudflare R2 with SHA-256 content-hash deduplication |
| **Payments & Logistics** | Cashfree Payment Gateway, Shiprocket Logistics API |
| **Authentication & Security** | Clerk Authentication, 2FA, Admin API Key Middleware, Sensitive Data Redaction |
| **Web Frontend** | React 19, Vite, Tailwind CSS, Radix UI Primitives, Wouter Router, Lucide Icons |
| **Mobile Frontend** | React Native, Expo |
| **API Contract & Codegen** | OpenAPI 3.0, Orval Codegen (`@workspace/api-spec` ➔ `@workspace/api-client-react`, `@workspace/api-zod`) |
| **Transactional Email** | Zoho SMTP / Resend with persistent outbox & retry queue |
| **Deployment** | Vercel Multi-Service (`vercel.json`) |

---

## 🚦 Getting Started

### Prerequisites
- **Node.js**: v20.x or higher
- **pnpm**: v9.x or higher (`corepack enable pnpm`)
- **MongoDB Atlas**: Cluster URI with read/write credentials

### 1. Installation
Clone the repository and install all workspace dependencies:
```bash
git clone https://github.com/Sanketingale08/VASHTRAA.git
cd VASHTRAA
pnpm install
```

### 2. Environment Setup
Create a `.env` file in the root directory:
```bash
# Application & Server
NODE_ENV=development
PORT=5000
FRONTEND_URL=http://localhost:5173
ADMIN_API_KEY=your-admin-api-key

# Database (MongoDB Atlas)
MONGODB_URI=mongodb+srv://<username>:<password>@cluster0.mongodb.net/vastraa?retryWrites=true&w=majority
DATABASE_NAME=vastraa

# Authentication (Clerk)
CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
VITE_CLERK_PUBLISHABLE_KEY=pk_test_...

# Payments (Cashfree)
CASHFREE_APP_ID=your-cashfree-app-id
CASHFREE_SECRET_KEY=your-cashfree-secret-key
CASHFREE_ENV=TEST

# Logistics (Shiprocket)
SHIPROCKET_EMAIL=your-shiprocket-email@domain.com
SHIPROCKET_PASSWORD=your-shiprocket-password

# Cloud Storage (Cloudflare R2)
R2_ACCOUNT_ID=your-r2-account-id
R2_ACCESS_KEY_ID=your-r2-access-key-id
R2_SECRET_ACCESS_KEY=your-r2-secret-access-key
R2_BUCKET_NAME=vastraa-assets
R2_PUBLIC_URL=https://assets.vastraa.com

# Transactional Email
SMTP_HOST=smtppro.zoho.in
SMTP_PORT=465
SMTP_USER=support@vastraa.com
SMTP_PASS=your-smtp-password
```

### 3. Running the Development Servers

Start both frontend and backend concurrently:
```bash
pnpm dev
```

Or run individual services:

Start the **Backend API Server**:
```bash
pnpm dev:api
```

Start the **Web Application** (Storefront, Seller & Admin Dashboards):
```bash
pnpm dev:frontend
```

---

## 📜 Available Workspace Commands

Run commands from the repository root using `pnpm`:

| Command | Description |
|---|---|
| `pnpm run build` | Full typecheck and production build across all workspace packages |
| `pnpm run typecheck` | Runs TypeScript type checking across all workspace applications and libraries |
| `pnpm dev` | Starts both the web frontend and API server concurrently in development mode |
| `pnpm dev:api` | Starts the Express backend server in development mode |
| `pnpm dev:frontend` | Starts the web frontend storefront and admin dashboard in dev mode |
| `pnpm --filter @workspace/api-spec run codegen` | Regenerates Zod schemas and React Query hooks from `openapi.yaml` |
| `pnpm --filter @workspace/api-server run test` | Runs backend unit and controller tests with Vitest |
| `pnpm --filter @workspace/api-server run test:integration` | Runs full database integration tests |

---

## 🔑 Environment Variables Reference

| Variable | Description | Default / Example |
|---|---|---|
| `NODE_ENV` | Environment mode (`development`, `production`, `test`) | `development` |
| `PORT` | API server listening port | `5000` |
| `MONGODB_URI` | MongoDB Atlas connection URI | `mongodb+srv://...` |
| `DATABASE_NAME` | Primary database name | `vastraa` |
| `CLERK_PUBLISHABLE_KEY` | Clerk authentication publishable key | `pk_test_...` |
| `CLERK_SECRET_KEY` | Clerk backend secret key | `sk_test_...` |
| `VITE_CLERK_PUBLISHABLE_KEY` | Clerk publishable key exposed to Vite web client | `pk_test_...` |
| `ADMIN_API_KEY` | Secret key for administrative API route access | `admin-secret-key` |
| `CASHFREE_APP_ID` | Cashfree payment gateway client ID | `...` |
| `CASHFREE_SECRET_KEY` | Cashfree payment gateway client secret | `...` |
| `SHIPROCKET_EMAIL` | Shiprocket logistics account email | `...` |
| `SHIPROCKET_PASSWORD` | Shiprocket logistics account password | `...` |
| `R2_ACCOUNT_ID` | Cloudflare R2 Account ID for media storage | `...` |
| `R2_BUCKET_NAME` | Cloudflare R2 asset bucket name | `vastraa-assets` |
| `SUPER_ADMIN_EMAIL` | Admin email recipient for reports & system alerts | `admin@vastraa.com` |

---

## 🌐 Deployment (Vercel Multi-Service)

VASTRAA is configured for unified multi-service deployment on **Vercel** via [`vercel.json`](vercel.json):

- **Storefront & Admin Dashboards**: Served at the root path `/`
- **Admin Log Explorer**: Accessible at `/admin/logs`
- **API Server Endpoints**: Routed seamlessly under `/api/(.*)`

```bash
vercel --prod
```

---

## 📄 License

This project is proprietary and confidential. All rights reserved by **VASTRAA**.
