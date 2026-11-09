# VASTRAA Architecture & Debugging Report: Stale Images and Cached Data Root Cause Analysis

**Project**: VASTRAA E-Commerce Platform  
**Date**: November 9, 2026  
**Status**: Root Cause Identified & Validated  
**Author**: Senior Full-Stack & Systems Debugging Engineering  

---

## 1. Executive Summary

Users and administrators of the VASTRAA platform experienced an issue where reopening or refreshing the web application continued to display stale product images, outdated category card images, and cached catalog responses. Even after administrators updated category cover images or sellers uploaded new product photos, user sessions frequently showed images that were replaced days or weeks earlier.

A comprehensive audit of the entire VASTRAA data pipeline—spanning MongoDB persistence, in-memory caching layers, Express HTTP routes, Cloudflare R2 / local storage proxy endpoints, and React Query client state—uncovered **eight compounding root causes**. Together, these factors created a multi-tier caching trap where stale assets and API responses were locked in browser disk caches, server caches, and client state.

---

## 2. System Architecture & Asset Data Flow

The following sequence illustrates the complete lifecycle of category and product images in VASTRAA:

```
[Admin / Seller Client]
        │
        ▼ (Upload Binary Asset)
[Cloudflare R2 / Object Storage] ── (Generates Object Key / Public URL)
        │
        ▼ (Save Metadata: Key, Title, Timestamp)
[MongoDB Atlas / Cluster] ── (Collections: product_categories, products)
        │
        ▼ (Read & Invalidate)
[In-Memory Cache Engine (LRU)] ── (api-server globalCache)
        │
        ▼ (HTTP REST Responses with Cache-Control)
[Client Browser Disk & Memory Cache]
        │
        ▼ (React Query Cache / Stale-While-Revalidate)
[VASTRAA React Frontend UI]
```

When any individual layer fails to invalidate or inappropriately applies long-lived cache headers, subsequent requests never reach the updated source of truth.

---

## 3. Deep Root Cause Analysis

### Root Cause 1: Aggressive HTTP Response Caching on Dynamic API Endpoints
- **Location**: `artifacts/api-server/src/routes/adminCategories.ts` (Lines 37–42) & `artifacts/api-server/src/routes/products.ts`
- **Mechanism**: The public catalog route `GET /categories` previously emitted the following header:
  ```http
  Cache-Control: public, max-age=180, stale-while-revalidate=120
  ```
- **Failure Mode**: When a user visited the homepage or reopened the browser tab within 3 to 5 minutes of an admin change, the browser bypassed the network completely and served the cached JSON payload directly from its disk cache (`200 OK (from disk cache)`). The client never queried the server for updated category images or names.

### Root Cause 2: Storage Object Caching Without Version Identifiers
- **Location**: `artifacts/api-server/src/routes/storage.ts` (Lines 87–93)
- **Mechanism**: The object storage retrieval route `GET /storage/public-objects/*` returned an aggressive 1-year immutable cache header for all requests:
  ```http
  Cache-Control: public, max-age=31536000
  ```
- **Failure Mode**: If an admin updated an image using the same object key or standard CDN URL, the user's browser cached the original binary file for up to one year. Because neither the URL nor the query parameters changed, the browser never issued an `If-Modified-Since` or `ETag` conditional request, freezing the old image in place indefinitely.

### Root Cause 3: Silent Discarding of Image Fields in Admin Product Updates
- **Location**: `artifacts/api-server/src/routes/adminProducts.ts`
- **Mechanism**: The handler `PATCH /admin/products/:id` enforced a strict whitelist of fields permitted for modification:
  ```typescript
  // Old whitelist:
  const allowed = ["title", "description", "category", "price", "salePrice", "status", ...];
  // "images" and "image" were omitted from the whitelist!
  ```
- **Failure Mode**: When administrators edited a product to replace its images, the backend accepted the request with a `200 OK` status code, but the field filter stripped `images` from the update payload. The database was never updated with the new images, while the admin UI falsely reported success.

### Root Cause 4: Database Repository Error Swallowing & False Positives
- **Location**: `lib/db/src/mongoRepositories.ts` (`mongoProductCategories.update` and `mongoProducts.update`)
- **Mechanism**: Update functions wrapped database calls in `try/catch` blocks that logged errors to the console, swallowed the exception, and returned an in-memory cached copy:
  ```typescript
  // Vulnerable pattern:
  try {
    await col.updateOne({ id }, { $set: updateData });
  } catch (err) {
    console.error("Failed to update in Mongo", err);
    // Swallowed error! Continued execution and returned old memory copy
  }
  ```
- **Failure Mode**: If a MongoDB write timeout or replica set failover occurred during an image upload, the API reported success (`{ success: true }`). The frontend assumed the update succeeded, but the database retained the old image URL.

### Root Cause 5: Runtime Exceptions in In-Memory Cache Invalidation
- **Location**: `artifacts/api-server/src/lib/cacheEngine.ts`
- **Mechanism**: In `adminCategories.ts`, mutation handlers attempted to clear the cache via `globalCache.invalidate("categories:active")`. However, `CacheEngine` had defined `.delete(key)` and `.clear()`, but did not implement an `.invalidate()` method.
- **Failure Mode**: The call threw an uncaught `TypeError: globalCache.invalidate is not a function`, terminating the request cycle before cache invalidation could execute or leaving the active memory cache in an outdated state.

### Root Cause 6: Static Fallback Desynchronization for Subcategories
- **Location**: `lib/db/src/mongoRepositories.ts` & `artifacts/vastraa/src/constants/categories.ts`
- **Mechanism**: Subcategories were nested inside MongoDB category documents as sub-documents (`subcategories: [{ id, name, image, ... }]`). When an admin updated a subcategory image, only the top-level category document's `updatedAt` was modified; individual subcategory objects lacked explicit `imageUpdatedAt` and `imageVersion` fields.
- **Failure Mode**: When mapping subcategories on the frontend (`CircularCategoryNav`, `Navbar`, and `ProductsListing`), components read static fallback objects or unversioned subcategory URLs, missing recent admin image updates.

### Root Cause 7: Lack of Asset Versioning & Index-Polluted Image URLs
- **Location**: `artifacts/vastraa/src/lib/productImages.ts` & `artifacts/vastraa/src/pages/ProductDetail.tsx`
- **Mechanism**:
  1. `getProductImageSrc` lacked a query string versioning mechanism (`?v=timestamp`), preventing browsers and CDNs from distinguishing updated images from older versions.
  2. In `ProductDetail.tsx`, the code previously mapped gallery images as:
     ```typescript
     product.images.map(getProductImageSrc)
     ```
     Because `Array.prototype.map` passes `(element, index)` to the callback, the array index (`0`, `1`, `2`) was passed as the version parameter, appending `?v=0` and `?v=1` instead of the actual document update timestamp!

### Root Cause 8: React Query Stale-Time Defaults and Missing Window Refetching
- **Location**: `artifacts/vastraa/src/App.tsx`, `artifacts/vastraa/src/pages/Home.tsx`, and `Navbar.tsx`
- **Mechanism**: React Query had queries configured with infinite or long `staleTime`, and `refetchOnWindowFocus` was not explicitly enabled for catalog queries.
- **Failure Mode**: When a user navigated away to another tab and returned, or reopened the browser session, React Query treated the stale in-memory state as fresh and did not trigger background re-validation.

---

## 4. Layer Impact Analysis Matrix

| Layer | Component | Former Behavior | Resulting Defect |
|---|---|---|---|
| **Storage / CDN** | `/storage/public-objects/*` | `max-age=31536000` (1 Year) | Updated images retain previous binary in browser disk cache |
| **API Server Headers** | `/api/categories`, `/api/products` | `max-age=180, stale-while-revalidate=120` | Browser disk cache serves outdated catalog JSON without network contact |
| **API Server Routing** | `PATCH /admin/products/:id` | Allowed list omitted `"images"` | Product image updates were silently discarded on save |
| **Server Cache** | `CacheEngine` | Missing `.invalidate()` method | Uncaught TypeError aborted cache eviction |
| **Database Repositories** | `mongoRepositories.ts` | Caught errors without throwing | False success returned to client when DB write failed |
| **Database Schema** | `product_categories`, `products` | Lacked `imageUpdatedAt` & `imageVersion` | No reliable version token existed to bust client caches |
| **Client Cache** | React Query `QueryClient` | Missing global `refetchOnWindowFocus` | Returning users saw old memory cache without background fetch |
| **Frontend Helpers** | `productImages.ts` & `ProductDetail.tsx` | Unversioned URLs & array index collision | Browser was unable to distinguish between new and old image revisions |

---

## 5. Conclusion

The persistent display of stale images was not caused by a single isolated bug, but rather by the cumulative effect of long-lived HTTP disk caching, unversioned asset URLs, dropped payload fields in admin routes, and swallowed database errors. Resolving this issue required a coordinated fix across all layers to ensure that every update generates a persistent version token, invalidates intermediate caches, and guarantees real-time cache busting on client devices.
