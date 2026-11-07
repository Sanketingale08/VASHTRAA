# 🛍️ VASTRAA — Enterprise Multi-Vendor Fashion & Apparel Marketplace

VASTRAA is a modern, full-stack, multi-vendor fashion and apparel e-commerce ecosystem. Built with TypeScript across a pnpm monorepo architecture, VASTRAA provides an end-to-end shopping experience for customers, a dedicated seller portal for vendor management and product onboarding, an administrative control center for super admins, a cross-platform mobile application, and a high-performance Express backend.

### 💰 Pricing & Seller Settlement Engine (v2 Model)

- **Customer Side**: Customer pays `taxable = base + shipping` and `gst = round(taxable * productGstRate)` (5%). Commission is NEVER shown or charged to the customer.
- **Seller Side**: Platform commission (18%) is deducted ONLY from the seller base price.
  - `commission = round(base * 18%)` (1800 BPS)
  - `gstOnCommission = round(commission * 5%)` (500 BPS configurable)
  - `tcs = round(base * 1%)` (100 BPS)
  - `sellerSettlement = base - commission - gstOnCommission - tcs`
  - `platformKeeps = commission + gstOnCommission`
- **Integer Paise Math**: All calculations in exact integer paise, rounded half-up once per line.
- **Versioning (`pricingVersion`)**: Existing stored orders remain untouched as `v1`. New orders receive `v2`. UI and financial reports branch on `pricingVersion`.

---

## 🚀 Key Features

### 🛒 Customer Storefront (`@workspace/vastraa`)

- **Product Discovery**: Browse curated clothing collections, dynamic search, multi-attribute filtering (category, size, color, price, tag), and quick view modals.
- **Cart & Checkout**: Real-time shopping cart drawer, saved cards, saved UPI payment methods, address book with Google Maps autocomplete, and order confirmation.
- **Account & Orders**: Order history, order tracking timeline, returns & refunds management, user preferences, and wishlist synchronization.

### 👔 Vendor & Seller Portal

- **Seller Onboarding**: Multi-step registration draft flow with document submission and status tracking.
- **Catalog Management**: Product publishing, single and bulk CSV product uploads with image gallery asset managers, and featured placement management.
- **Fulfillment & Analytics**: Order processing, shipment updates, real-time sales reporting, payout tracking, and customer message management.

### 🛡️ Super Admin Control Dashboard

- **Vendor Governance**: Multi-tier approval workflows, vendor suspension/reactivation, and compliance audits.
- **Financial Operations**: Settlement deduplication, automated payout schedules, dispute resolution, and revenue metrics.
- **Promotions & Content**: Site-wide coupon management, banner configuration, system notifications, and 2FA authentication.
- **Automated Workers**: Background cron workers for weekly executive reporting, email outbox retry queue, and seller registration nudge automation.

### 📱 Mobile Experience (`@workspace/vastraa-mobile`)

- Native mobile client powered by **React Native & Expo**, featuring mobile product navigation, shopper cart/checkout flow, and seller dashboard views.

---

## 📦 Project Architecture & Workspace Layout

The repository is structured as a `pnpm` monorepo workspace split into `artifacts/` (applications) and `lib/` (shared packages & spec drivers):

```text
VASTRAA/
├── artifacts/
│   ├── api-server/         # Express 5 API Server & background worker services
│   ├── vastraa/            # Vite + React 19 web application (Storefront, Seller & Admin)
│   ├── vastraa-mobile/     # Expo / React Native mobile application
│   └── mockup-sandbox/     # Isolated component playground & design testing sandbox
├── lib/
│   ├── db/                 # PostgreSQL schema, Drizzle ORM models, baseline migrations
│   ├── api-spec/           # OpenAPI 3.0 specification (`openapi.yaml`)
│   ├── api-zod/            # Auto-generated Zod request/response validation schemas
│   ├── api-client-react/   # Auto-generated TanStack React Query API client hooks (via Orval)
│   └── object-storage-web/ # Web object storage utilities & file handling helpers
├── scripts/                # Build and workspace utility scripts
├── .env                    # Environment configuration variables
├── pnpm-workspace.yaml     # pnpm workspace definition & catalog constraints
└── package.json            # Workspace root package configuration
```

---

## 🛠️ Technology Stack

| Category | Technology |
|---|---|
| **Monorepo & Package Manager** | `pnpm` Workspaces, Node.js 24, TypeScript 5.9 |
| **Backend API Server** | Express 5, Pino Logger, Vitest, ESBuild |
| **Database & ORM** | PostgreSQL, Drizzle ORM, Drizzle-Zod |
| **Authentication & Security** | Clerk Authentication (`@clerk/express`, `@clerk/react`), 2FA, Admin Key Middleware |
| **Web Frontend** | React 19, Vite 7, Tailwind CSS v4, Radix UI Primitives, Wouter Router, Lucide Icons |
| **Mobile Frontend** | React Native, Expo |
| **API Contract & Codegen** | OpenAPI 3.0, Orval Codegen (`@workspace/api-spec` ➔ `@workspace/api-client-react`, `@workspace/api-zod`) |
| **Integrations & Utilities** | Resend (Emails), Twilio (SMS/2FA), Google Cloud Storage, PDFKit (Invoices), QRCode |

---

## 🚦 Getting Started

### Prerequisites

- **Node.js**: v24.x or higher
- **pnpm**: v9.x or higher (`corepack enable pnpm`)
- **PostgreSQL**: v15.x or higher database instance

### 1. Installation

Clone the repository and install all workspace dependencies:

```bash
pnpm install
```

### 2. Environment Setup

Create a `.env` file in the root directory (or copy from `.env` template):

```bash
# Example .env configuration
NODE_ENV=development
PORT=5000
DATABASE_URL=
CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
VITE_CLERK_PUBLISHABLE_KEY=pk_test_...
ADMIN_API_KEY=admin-secret-key
RESEND_API_KEY=re_...
SUPER_ADMIN_EMAIL=admin@vastraa.com
```

### 3. Database Migration & Schema Setup

Push the Drizzle database schema to your PostgreSQL database:

```bash
pnpm --filter @workspace/db run push
```

### 4. Running the Development Servers

Start the **API Server** (runs on port 5000):

```bash
pnpm --filter @workspace/api-server run dev
```

Start the **Web Application** (Vite Dev Server):

```bash
pnpm --filter @workspace/vastraa run dev
```

Start the **Mobile Application** (Expo Packager):

```bash
pnpm --filter @workspace/vastraa-mobile run dev
```

---

## 📜 Available Workspace Commands

Run commands from the repository root using `pnpm`:

| Command | Description |
|---|---|
| `pnpm run build` | Full typecheck and production build across all workspace packages |
| `pnpm run typecheck` | Runs TypeScript type checking across all workspace applications and libraries |
| `pnpm --filter @workspace/api-server run dev` | Starts the Express 5 backend server in development mode |
| `pnpm --filter @workspace/vastraa run dev` | Starts the VASTRAA storefront, seller portal & admin dashboard in dev mode |
| `pnpm --filter @workspace/api-spec run codegen` | Regenerates Zod schemas and React Query hooks from `openapi.yaml` |
| `pnpm --filter @workspace/db run push` | Pushes Drizzle schema updates directly to the connected PostgreSQL DB |
| `pnpm --filter @workspace/api-server run test` | Runs backend unit and controller tests with Vitest |
| `pnpm --filter @workspace/api-server run test:integration` | Runs full database integration tests |
| `pnpm --filter @workspace/vastraa run test:e2e` | Executes Playwright end-to-end tests for the VASTRAA web storefront flows |

---

## 🔑 Environment Variables Reference

| Variable | Description | Default / Example |
|---|---|---|
| `NODE_ENV` | Environment mode (`development`, `production`, `test`) | `development` |
| `PORT` | API server listening port | `5000` |
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://user:pass@localhost:5432/vastraa` |
| `CLERK_PUBLISHABLE_KEY` | Clerk authentication publishable key | `pk_test_...` |
| `CLERK_SECRET_KEY` | Clerk backend secret key | `sk_test_...` |
| `VITE_CLERK_PUBLISHABLE_KEY` | Clerk publishable key exposed to Vite web client | `pk_test_...` |
| `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk publishable key exposed to React Native Expo app | `pk_test_...` |
| `ADMIN_API_KEY` | Secret key for administrative API route access | `admin-secret-key` |
| `RESEND_API_KEY` | Resend API key for transactional emails | `re_...` |
| `SUPER_ADMIN_EMAIL` | Admin email recipient for weekly reports & system alerts | `admin@vastraa.com` |
| `TWILIO_ACCOUNT_SID` | Twilio Account SID for SMS / 2FA (optional) | `AC...` |
| `TWILIO_AUTH_TOKEN` | Twilio Auth Token (optional) | `...` |
| `TWILIO_FROM_NUMBER` | Sender phone number for SMS dispatch (optional) | `+15005550006` |
| `PUBLIC_OBJECT_SEARCH_PATHS` | Path directory for public media assets | `./uploads/public` |
| `PRIVATE_OBJECT_DIR` | Directory for private documents/seller uploads | `./uploads/private` |

---

## ⚡ API Specification & Code Generation Workflow

VASTRAA follows an **API-First Design Pattern**. The source of truth for all API contracts is located at:

`lib/api-spec/openapi.yaml`

When API endpoints or schemas change:

1. Update `lib/api-spec/openapi.yaml`.
2. Run code generation:

   ```bash
   pnpm --filter @workspace/api-spec run codegen
   ```

3. Orval will automatically update `@workspace/api-zod` and `@workspace/api-client-react` packages.

---

## 📄 License

This project is released under the [MIT License](LICENSE).
