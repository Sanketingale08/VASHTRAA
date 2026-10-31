import { db, mongoSellers, vendorsTable } from "@workspace/db";

export interface ApprovedVendorData {
  ids: Set<string>;
  names: Set<string>;
  suspendedIds: Set<string>;
}

let cachedApprovedVendorData: ApprovedVendorData | null = null;
let lastCacheTime = 0;
const CACHE_TTL_MS = 5000; // 5 seconds cache for fast lookup

/**
 * Fetch approved & active vendor IDs and shop names across MongoDB and PostgreSQL.
 */
export async function getApprovedVendorData(forceRefresh: boolean = false): Promise<ApprovedVendorData> {
  const now = Date.now();
  if (!forceRefresh && cachedApprovedVendorData && now - lastCacheTime < CACHE_TTL_MS) {
    return cachedApprovedVendorData;
  }

  const ids = new Set<string>();
  const names = new Set<string>();
  const suspendedIds = new Set<string>();

  // 1. MongoDB Sellers (covers sellers, vendors, inMemorySellersMap)
  try {
    const sellers = await mongoSellers.findMany({});
    for (const s of sellers) {
      const isTestSeller =
        Boolean((s as any).isDemo) ||
        Boolean((s as any).isTest) ||
        Boolean((s as any).demo) ||
        Boolean((s as any).test) ||
        String(s.id || "").toLowerCase().startsWith("test-") ||
        String(s.sellerId || "").toLowerCase().startsWith("test-") ||
        String(s.vendorId || "").toLowerCase().startsWith("test-") ||
        String(s.id || "").toLowerCase().includes("vend_profile_test") ||
        String(s.email || "").toLowerCase().includes("test-customer") ||
        String(s.email || "").toLowerCase().includes("test-vendor");

      const st = String(s.status || "").toLowerCase().trim();
      const isApproved = !isTestSeller && (st === "approved" || st === "active");

      const allIds = [s.id, s.vendorId, s.sellerId, (s as any).ownerId, (s as any)._id].filter(Boolean).map(String);

      if (!isApproved) {
        for (const id of allIds) {
          suspendedIds.add(id);
          suspendedIds.add(id.toLowerCase());
        }
      } else {
        for (const id of allIds) {
          ids.add(id);
          ids.add(id.toLowerCase());
        }
        if (s.name) names.add(String(s.name).trim().toLowerCase());
        if (s.shopName) names.add(String(s.shopName).trim().toLowerCase());
      }
    }
  } catch {}

  // 2. PostgreSQL vendorsTable
  try {
    const pgVendors = await db.select().from(vendorsTable);
    for (const v of pgVendors) {
      const isTestVendor =
        Boolean((v as any).isDemo) ||
        Boolean((v as any).isTest) ||
        String(v.id || "").toLowerCase().startsWith("test-") ||
        String(v.vendorId || "").toLowerCase().startsWith("test-");

      const st = String(v.status || "").toLowerCase().trim();
      const isApproved = !isTestVendor && (st === "approved" || st === "active");

      const allIds = [v.id, v.vendorId, v.ownerId].filter(Boolean).map(String);

      if (!isApproved) {
        for (const id of allIds) {
          suspendedIds.add(id);
          suspendedIds.add(id.toLowerCase());
        }
      } else {
        for (const id of allIds) {
          ids.add(id);
          ids.add(id.toLowerCase());
        }
        if (v.name) names.add(String(v.name).trim().toLowerCase());
      }
    }
  } catch {}

  cachedApprovedVendorData = { ids, names, suspendedIds };
  lastCacheTime = now;
  return cachedApprovedVendorData;
}

/**
 * Returns true only if product is genuine, approved, active, and belongs to an approved registered seller.
 * Rejects any unassigned vendors, unapproved statuses, test products, or test sellers.
 */
export function isProductVendorValid(
  product: any,
  approvedData: ApprovedVendorData
): boolean {
  if (!product) return false;

  // 1. Check product's active flag
  if (product.active === false) return false;

  // 2. Status MUST be explicitly approved or active
  const st = String(product.status || "").toLowerCase().trim();
  if (st !== "approved" && st !== "active") {
    return false;
  }

  // 3. Reject any test/demo product flags or identifiers
  if (
    product.isDemo === true ||
    product.isTest === true ||
    product.demo === true ||
    product.test === true
  ) {
    return false;
  }
  const prodId = String(product.id || "").toLowerCase().trim();
  const prodName = String(product.name || "").toLowerCase().trim();
  if (
    prodId.startsWith("test-") ||
    prodId.startsWith("demo-") ||
    prodName.includes("[test]") ||
    prodName.includes("[demo]") ||
    prodName.includes("test product") ||
    prodName.includes("demo product") ||
    prodName.includes("dummy product")
  ) {
    return false;
  }

  // 4. Must reference a genuine seller/vendor. Missing seller is NEVER permitted!
  const vendorId = product.vendorId || product.sellerId || (product as any).vendor_id;
  if (!vendorId) {
    return false;
  }

  const vIdStr = String(vendorId).trim();
  const vIdLower = vIdStr.toLowerCase();

  // Test seller / demo vendor IDs are never valid
  if (
    vIdLower.startsWith("test-") ||
    vIdLower.startsWith("demo-") ||
    vIdLower.includes("test_vendor") ||
    vIdLower.includes("test-vendor") ||
    vIdLower.includes("vend_profile_test")
  ) {
    return false;
  }

  // If vendor is suspended, rejected, pending, or unapproved, block product
  if (approvedData.suspendedIds.has(vIdStr) || approvedData.suspendedIds.has(vIdLower)) {
    return false;
  }

  // Must match approved vendor ID or approved vendor shop name
  const isIdApproved = approvedData.ids.has(vIdStr) || approvedData.ids.has(vIdLower);
  if (isIdApproved) {
    return true;
  }

  const vendorName = (product.vendorName || product.sellerName || product.shopName || "").trim().toLowerCase();
  if (vendorName && approvedData.names.has(vendorName)) {
    return true;
  }

  return false;
}
