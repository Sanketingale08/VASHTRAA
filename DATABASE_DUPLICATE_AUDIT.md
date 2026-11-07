# VASTRAA — Database Duplicate & Integrity Audit Report

**Date:** November 2026  
**Auditor:** Senior Backend Engineer & MongoDB Database Architect  
**Database:** MongoDB Atlas Cluster (`VASTRAA`)  
**Scope:** Multi-vendor E-Commerce Platform Database  

---

## 1. Executive Summary

A comprehensive duplicate data audit was conducted across all 13 core collections of the VASTRAA multi-vendor marketplace database. Using empirical automated queries (`scripts/audit-database-duplicates.mjs`), document counts, unique key definitions, and legacy anomaly states were cataloged.

The audit confirmed:
- Zero duplicate product identifiers (`id` or `productId`).
- Zero duplicate Cloudflare R2 object keys (`objectKey`).
- Zero duplicate coupon codes (`code`).
- Legitimate multi-vendor orders with separate vendor shipments (confirming that shipments must have a compound uniqueness constraint of `{ orderId: 1, vendorId: 1 }`).
- Legacy mock user emails in automated integration test accounts (`existing.user@example.com`, etc.) that necessitate safe, non-destructive indexing.

---

## 2. Collection-by-Collection Audit Findings

| Collection | Total Docs | Unique Identifier | Duplicate Findings | Uniqueness Constraint Type |
| :--- | :--- | :--- | :--- | :--- |
| **`products`** | 7 | `id`, `productId` | **0 duplicates found.** Products correctly preserve seller ownership (`vendorId`). | Unique sparse on `productId`, partial compound `{ vendorId: 1, sku: 1 }` |
| **`r2_assets`** | 107 | `objectKey` | **0 duplicate keys found.** | Unique sparse on `objectKey`, compound `{ contentHash: 1, sellerId: 1 }` |
| **`coupons`** | 7 | `code` | **0 duplicate codes found.** | Unique sparse on `code` (case-insensitive) |
| **`product_categories`** | 280 | `slug`, `id` | Legacy test runs contained repeated subcategory entries (e.g. `pure-kanchipuram`). | Compound unique on `{ parentId: 1, slug: 1 }` |
| **`orders`** | 22 | `id`, `orderId`, `displayId` | **0 duplicate orders found.** | Unique on `displayId`, unique on `checkoutIdempotencyKey` |
| **`shipments`** | 12 | `id` | Multi-vendor orders create 1 shipment per vendor. | Compound unique on `{ orderId: 1, vendorId: 1 }` |
| **`vendor_settlements`** | 8 | `id` | No duplicate settlement payouts for identical vendor order. | Compound unique on `{ orderId: 1, vendorId: 1, type: 1 }` |
| **`users`** | 304 | `email` | Integration test runs created repeated test accounts (`existing.user@example.com`). | Unique sparse on `email` with `safeCreateIndex` fallback |
| **`sellers`** | 15 | `id`, `vendorId` | No duplicate active sellers. | Unique sparse on `id`, `vendorId` |
| **`email_outbox`** | 45 | `id` | No duplicate emails sent. | Unique sparse on `idempotencyKey` |
| **`processed_webhooks`** | 18 | `eventId` | Zero duplicate webhook processing. | Unique on `eventId` with 30-day TTL |
| **`audit_logs`** | Dynamic | `_id`, `requestId` | Dedicated business audit trail. | Compound on `{ actor.role: 1, timestamp: -1 }` |
| **`application_logs`** | Dynamic | `_id`, `requestId` | Operational error & third-party logs. | TTL index on `createdAt: 1` (60 days) |

---

## 3. High-Risk Multi-Vendor Business Rules Verified

1. **Shipment Uniqueness Must Be Compound**:
   - In a multi-vendor checkout, an order containing items from Seller A and Seller B requires two distinct shipment records in `shipments`.
   - A single-field unique index on `orderId` would corrupt multi-vendor checkouts.
   - **Remediation**: Implemented compound partial index: `{ orderId: 1, vendorId: 1 }`.

2. **Category Taxonomy Case-Insensitivity**:
   - Categories like `Paithani`, `paithani`, and `PAITHANI` represent the same category and must not be created multiple times.
   - Subcategories with identical names (e.g. `Bridal`) legitimately belong to different parent categories (e.g. `Sarees -> Bridal` vs `Kurtis -> Bridal`).
   - **Remediation**: Implemented compound unique index `{ parentId: 1, slug: 1 }` with regex-normalized pre-check in `mongoProductCategories.create`.

3. **Vendor SKU Scoping**:
   - Different independent sellers may legitimately use standard SKUs like `BL-01` or `SILK-100`.
   - A global unique index on `sku` would cause false conflicts across vendors.
   - **Remediation**: Scoped uniqueness to `{ vendorId: 1, sku: 1 }`.

