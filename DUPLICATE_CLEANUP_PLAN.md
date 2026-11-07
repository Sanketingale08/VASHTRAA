# VASTRAA — Duplicate Cleanup & Reconciliation Plan

**Policy:** Non-Destructive Reconciliation, Human Review, Reversible Backup  

---

## 1. Non-Negotiable Safety Principles

1. **Zero Unverified Deletes**: No production customer, seller, order, product, payment, or image record will be deleted automatically.
2. **Reversible Backup First**: Prior to any reconciliation or archival, a full database snapshot must be exported via `mongodump` or JSON archive.
3. **Canonical Record Selection Rule**:
   When legacy records must be reconciled:
   - For users: The record with `isEmailVerified: true` and the most recent login timestamp is selected as the canonical document.
   - For categories: The primary definition in `product_categories` with active status and highest `sortOrder` is preserved.

---

## 2. Identified Legacy Inconsistencies for Review

### 1. Test Accounts in `users`
- **Finding**: Multiple documents with email `existing.user@example.com` created by early automated integration tests.
- **Action Plan**:
  - Do NOT drop live users.
  - Tag legacy test accounts with `isTestAccount: true` or update email to `existing.user+legacy_<timestamp>@example.com`.
  - Once isolated, apply strict single-field unique index `{ email: 1 }`.

### 2. Category Slugs in `product_categories`
- **Finding**: Test runs generated multiple `pure-kanchipuram` subcategories under the same parent.
- **Action Plan**:
  - Reassign any products referencing duplicate category IDs to the primary category ID.
  - Soft-delete or archive the redundant subcategory record (`{ active: false, archived: true }`).
  - Safe compound index `{ parentId: 1, slug: 1 }` is already in place to prevent any new duplicates.

---

## 3. Rollback & Recovery Plan

```bash
# Step 1: Export current state before cleanup
mongodump --uri="$MONGODB_URI" --out="./backup_pre_cleanup_$(date +%Y%m%d)"

# Step 2: Verification of backup
ls -lh ./backup_pre_cleanup_*

# Step 3: Rollback procedure (if needed)
mongorestore --uri="$MONGODB_URI" --drop ./backup_pre_cleanup_*
```

