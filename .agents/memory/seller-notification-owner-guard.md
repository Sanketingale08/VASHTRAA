---
name: Seller notification requires vendor.ownerId
description: insertSellerNotification must skip vendors with no ownerId or it crashes the order transaction
---

Seeded/demo vendors often have `owner_id = NULL` in `vendorsTable` (no seller
account claimed yet). `notifications.user_id` is NOT NULL, so any helper that
inserts a seller notification using `vendor.ownerId` as `userId` must check
`vendor.ownerId` is truthy before inserting, otherwise it throws a DB
constraint violation.

**Why:** This function is called inside the order-creation DB transaction
(new order, low/out-of-stock alerts). An unguarded insert here doesn't just
fail silently — it can abort the whole order transaction if it throws.

**How to apply:** Any new "notify vendor" helper (in
`artifacts/api-server/src/lib/sellerNotifications.ts` or similar) must early
return when the vendor record has no `ownerId`, rather than assuming every
vendor has a linked seller account.
