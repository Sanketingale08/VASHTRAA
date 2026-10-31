import type { ordersTable, productsTable, vendorsTable, vendorSettlementsTable } from "@workspace/db";

export interface DataValidationSummary {
  totalOrdersChecked: number;
  validOrdersCount: number;
  excludedOrdersCount: number;
  totalProductsChecked: number;
  validProductsCount: number;
  orphanedProductsCount: number;
  totalSettlementsChecked: number;
  validSettlementsCount: number;
  excludedSettlementsCount: number;
  duplicateRecordsCount: number;
  hasInconsistencies: boolean;
  warning: string | null;
}

export interface ValidatedRecords<
  O extends typeof ordersTable.$inferSelect = typeof ordersTable.$inferSelect,
  P extends typeof productsTable.$inferSelect = typeof productsTable.$inferSelect,
  V extends typeof vendorsTable.$inferSelect = typeof vendorsTable.$inferSelect,
  S extends typeof vendorSettlementsTable.$inferSelect = typeof vendorSettlementsTable.$inferSelect
> {
  validOrders: O[];
  validProducts: P[];
  validVendors: V[];
  validSettlements: S[];
  summary: DataValidationSummary;
}

export function validateDatabaseRecords<
  O extends typeof ordersTable.$inferSelect,
  P extends typeof productsTable.$inferSelect,
  V extends typeof vendorsTable.$inferSelect,
  S extends typeof vendorSettlementsTable.$inferSelect
>(
  orders: O[],
  products: P[],
  vendors: V[],
  settlements: S[] = []
): ValidatedRecords<O, P, V, S> {
  let duplicateRecordsCount = 0;

  // 1. Validate Vendors & filter duplicate vendor IDs
  const seenVendorIds = new Set<string>();
  const validVendors = vendors.filter((v) => {
    if (!v) return false;
    const vId = typeof v.id === "string" && v.id.trim() ? v.id.trim() : (v.vendorId ? String(v.vendorId).trim() : (v._id ? String(v._id).trim() : ""));
    if (!vId) return false;
    if (seenVendorIds.has(vId)) {
      duplicateRecordsCount++;
      return false;
    }
    seenVendorIds.add(vId);
    return true;
  });

  const vendorIdSet = new Set<string>();
  for (const v of validVendors) {
    if (v.id) {
      vendorIdSet.add(v.id);
      vendorIdSet.add(String(v.id).toLowerCase());
    }
    if (v.vendorId) {
      vendorIdSet.add(v.vendorId);
      vendorIdSet.add(String(v.vendorId).toLowerCase());
    }
    if (v.sellerId) {
      vendorIdSet.add(v.sellerId);
      vendorIdSet.add(String(v.sellerId).toLowerCase());
    }
    if (v.ownerId) {
      vendorIdSet.add(v.ownerId);
      vendorIdSet.add(String(v.ownerId).toLowerCase());
    }
    if (v.userId) {
      vendorIdSet.add(v.userId);
      vendorIdSet.add(String(v.userId).toLowerCase());
    }
    if (v._id) {
      vendorIdSet.add(String(v._id));
      vendorIdSet.add(String(v._id).toLowerCase());
    }
  }

  // 2. Validate Products & detect orphaned/duplicate products
  let orphanedProductsCount = 0;
  const seenProductIds = new Set<string>();
  const validProducts = products.filter((p) => {
    if (!p || typeof p.id !== "string" || !p.id.trim()) return false;
    if (seenProductIds.has(p.id)) {
      duplicateRecordsCount++;
      return false;
    }

    // Normalize price to number
    const priceNum = typeof p.price === "number" ? p.price : parseFloat(p.price as any);
    if (isNaN(priceNum) || priceNum < 0) return false;
    (p as any).price = priceNum;

    if (p.vendorId && !vendorIdSet.has(p.vendorId) && !vendorIdSet.has(String(p.vendorId).toLowerCase())) {
      orphanedProductsCount++;
      return false; // Safely exclude orphaned products from calculations
    }

    seenProductIds.add(p.id);
    return true;
  });

  const productIdSet = new Set(validProducts.map((p) => p.id));

  // 3. Validate Orders & items
  let excludedOrdersCount = 0;
  const seenOrderIds = new Set<string>();
  const validOrders = orders.filter((o) => {
    if (!o || typeof o.id !== "string" || !o.id.trim()) {
      excludedOrdersCount++;
      return false;
    }
    if (seenOrderIds.has(o.id)) {
      duplicateRecordsCount++;
      excludedOrdersCount++;
      return false;
    }

    // Normalize order total
    const totalNum = typeof o.total === "number" ? o.total : parseFloat(o.total as any);
    if (isNaN(totalNum) || totalNum < 0) {
      excludedOrdersCount++;
      return false;
    }
    (o as any).total = totalNum;

    // Items validation: items must be parseable array
    let itemsArray = o.items;
    if (typeof itemsArray === "string") {
      try {
        itemsArray = JSON.parse(itemsArray);
      } catch {
        excludedOrdersCount++;
        return false;
      }
    }
    if (!Array.isArray(itemsArray)) {
      excludedOrdersCount++;
      return false;
    }

    // Sanitize line items and verify product references
    const sanitizedItems = itemsArray
      .map((item) => {
        if (!item || typeof item !== "object") return null;
        const pId = item.productId ?? item.id;
        if (!pId || typeof pId !== "string") return null;

        const itemPrice = typeof item.price === "number" ? item.price : parseFloat(item.price as any) || 0;
        const itemQty = typeof item.quantity === "number" ? Math.max(1, Math.floor(item.quantity)) : 1;

        return {
          ...item,
          productId: pId,
          price: isNaN(itemPrice) ? 0 : itemPrice,
          quantity: itemQty,
        };
      })
      .filter(Boolean);

    (o as any).items = sanitizedItems;
    seenOrderIds.add(o.id);
    return true;
  });

  // 4. Validate Settlements & detect orphaned settlements
  let excludedSettlementsCount = 0;
  const seenSettlementIds = new Set<string>();
  const validSettlements = settlements.filter((s) => {
    if (!s || typeof s.id !== "string" || !s.id.trim()) {
      excludedSettlementsCount++;
      return false;
    }
    if (seenSettlementIds.has(s.id)) {
      duplicateRecordsCount++;
      excludedSettlementsCount++;
      return false;
    }

    const amountNum = typeof s.amount === "number" ? s.amount : parseFloat(s.amount as any);
    if (isNaN(amountNum) || amountNum < 0) {
      excludedSettlementsCount++;
      return false;
    }
    (s as any).amount = amountNum;

    if (s.vendorId && !vendorIdSet.has(s.vendorId) && !vendorIdSet.has(String(s.vendorId).toLowerCase())) {
      excludedSettlementsCount++;
      return false;
    }

    seenSettlementIds.add(s.id);
    return true;
  });

  const hasInconsistencies =
    excludedOrdersCount > 0 || orphanedProductsCount > 0 || excludedSettlementsCount > 0 || duplicateRecordsCount > 0;

  const parts: string[] = [];
  if (excludedOrdersCount > 0) parts.push(`${excludedOrdersCount} invalid order(s)`);
  if (orphanedProductsCount > 0) parts.push(`${orphanedProductsCount} orphaned product(s)`);
  if (excludedSettlementsCount > 0) parts.push(`${excludedSettlementsCount} invalid settlement(s)`);
  if (duplicateRecordsCount > 0) parts.push(`${duplicateRecordsCount} duplicate record(s)`);

  const warning = hasInconsistencies
    ? `Data consistency audit: Safely excluded ${parts.join(", ")} from calculations.`
    : null;

  return {
    validOrders,
    validProducts,
    validVendors,
    validSettlements,
    summary: {
      totalOrdersChecked: orders.length,
      validOrdersCount: validOrders.length,
      excludedOrdersCount,
      totalProductsChecked: products.length,
      validProductsCount: validProducts.length,
      orphanedProductsCount,
      totalSettlementsChecked: settlements.length,
      validSettlementsCount: validSettlements.length,
      excludedSettlementsCount,
      duplicateRecordsCount,
      hasInconsistencies,
      warning,
    },
  };
}
