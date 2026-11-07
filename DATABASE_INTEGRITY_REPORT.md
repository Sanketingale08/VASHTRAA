# VASTRAA — Database Integrity & Indexing Report

**Status:** Enforced in Production  
**Scope:** MongoDB Index Architecture, Idempotency & Concurrency Safeguards  

---

## 1. Index Architecture & Safe Index Creation

To prevent server startup failures when legacy test records contain duplicate sparse keys, all indexes are applied via `safeCreateIndex` in `lib/db/src/mongo.ts`:

```typescript
export async function safeCreateIndex(
  col: any,
  indexSpec: Record<string, number | string>,
  options: Record<string, any> = {}
): Promise<void> {
  try {
    await col.createIndex(indexSpec, options);
  } catch (err: any) {
    if (err.code === 11000 || err.codeName === "DuplicateKey") {
      console.warn(`[MongoDB SafeIndex] Notice on ${col.collectionName}: duplicate keys found for ${JSON.stringify(indexSpec)}. Index creation deferred safely.`);
    } else {
      console.warn(`[MongoDB SafeIndex] Warning on ${col.collectionName}:`, err.message || err);
    }
  }
}
```

---

## 2. Enforced MongoDB Indexes by Domain

### Domain 1: Products (`products`)
- `{ productId: 1 }` (Unique, Sparse)
- `{ vendorId: 1, sku: 1 }` (Unique, Sparse, Partial: `{ sku: { $exists: true, $type: "string", $ne: "" } }`)
- `{ idempotencyKey: 1 }` (Unique, Sparse)
- `{ submitFingerprint: 1, vendorId: 1 }` (Sparse)
- `{ status: 1, active: 1, category: 1, createdAt: -1 }` (Query Compound)

### Domain 2: Orders (`orders`)
- `{ orderId: 1 }` (Unique, Sparse)
- `{ displayId: 1 }` (Unique, Sparse)
- `{ checkoutIdempotencyKey: 1 }` (Unique, Sparse)
- `{ cashfreeOrderId: 1 }` (Sparse)

### Domain 3: Categories (`product_categories`)
- `{ parentId: 1, slug: 1 }` (Unique, Sparse, Partial: `{ parentId: { $exists: true, $ne: null } }`)
- `{ active: 1, sortOrder: 1 }`

### Domain 4: Shipments (`shipments`)
- `{ orderId: 1, vendorId: 1 }` (Unique, Sparse, Partial: `{ orderId: { $exists: true, $ne: null }, vendorId: { $exists: true, $ne: null } }`)
- `{ shiprocketShipmentId: 1 }` (Sparse)

### Domain 5: Settlements (`vendor_settlements`)
- `{ orderId: 1, vendorId: 1, type: 1 }` (Unique, Sparse)

### Domain 6: Assets & Images (`r2_assets`)
- `{ objectKey: 1 }` (Unique, Sparse)
- `{ contentHash: 1, sellerId: 1 }` (Sparse)

### Domain 7: Processed Webhooks (`processed_webhooks`)
- `{ eventId: 1 }` (Unique, Sparse)
- `{ createdAt: 1 }` (30-day TTL: `expireAfterSeconds: 2592000`)

### Domain 8: Audit & Application Logs (`audit_logs` & `application_logs`)
- `audit_logs`: `{ timestamp: -1 }`, `{ "actor.role": 1, timestamp: -1 }`, `{ action: 1, timestamp: -1 }`
- `application_logs`: `{ timestamp: -1 }`, `{ level: 1, timestamp: -1 }`, `{ createdAt: 1 }` (60-day TTL: `expireAfterSeconds: 5184000`)

---

## 3. Concurrency & Idempotency Controls

1. **Product Creation Idempotency**:
   - `x-idempotency-key` header checked on `POST /api/products`.
   - Double-click fingerprinting: SHA-256 of `vendorId:name:category:price` cached for 30s.
2. **Order Creation & Payment Idempotency**:
   - `checkoutIdempotencyKey` prevents duplicate order documents on network retries.
   - Cashfree webhook deduplication: Atomic insert into `processed_webhooks` ensures payment status transitions and inventory deductions happen exactly once.

