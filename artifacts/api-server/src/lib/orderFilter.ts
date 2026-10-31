/**
 * Order Realtime vs Demo Filter Utilities
 * 
 * Ensures the Admin Dashboard order section and administrative stats
 * strictly display genuine realtime customer transactions and exclude
 * demo, seed, or automated test orders.
 */

export function isDemoOrder(order: any): boolean {
  if (!order) return false;

  // 1. Explicit boolean flags
  if (order.isDemo === true || order.isTest === true || order.demo === true || order.test === true) {
    return true;
  }

  // 2. Order ID patterns
  const id = String(order.id || order._id || "").toLowerCase();
  if (id.includes("demo") || id.includes("test")) {
    return true;
  }

  const displayId = String(order.displayId || "").toLowerCase();
  if (displayId.includes("demo") || displayId.includes("test")) {
    return true;
  }

  // 3. Customer and User ID patterns
  const userId = String(order.userId || "").toLowerCase();
  if (
    userId.includes("demo") ||
    userId.includes("test") ||
    userId.includes("example.com") ||
    userId.includes("test-customer") ||
    userId.includes("usr_demo") ||
    userId.includes("usr_test")
  ) {
    return true;
  }

  // JWT token payload inspection (for test customer JWT tokens)
  if (userId.startsWith("eyjhbg")) {
    try {
      const parts = userId.split(".");
      if (parts.length >= 2) {
        const payload = JSON.parse(Buffer.from(parts[1], "base64").toString("utf8"));
        const sub = String(payload.sub || "").toLowerCase();
        const email = String(payload.email || "").toLowerCase();
        if (
          sub.includes("test") ||
          sub.includes("demo") ||
          email.includes("example.com") ||
          email.includes("test") ||
          email.includes("demo")
        ) {
          return true;
        }
      }
    } catch {}
  }

  // 4. Customer Name patterns
  const customerName = String(
    order.customerName ||
    order.address?.name ||
    order.shippingAddress?.name ||
    ""
  ).trim().toLowerCase();

  if (
    customerName === "checkout tester" ||
    customerName.includes("test customer") ||
    customerName.includes("tester") ||
    customerName.includes("demo")
  ) {
    return true;
  }

  // 5. Customer Email patterns
  const customerEmail = String(
    order.customerEmail ||
    order.address?.email ||
    order.shippingAddress?.email ||
    ""
  ).toLowerCase();

  if (
    customerEmail.includes("example.com") ||
    customerEmail.includes("test@") ||
    customerEmail.includes("@test.") ||
    customerEmail.includes("demo@") ||
    customerEmail.includes("@demo.")
  ) {
    return true;
  }

  // 6. Items, Vendor, and Product indicators
  const items = Array.isArray(order.items) ? order.items : [];
  for (const item of items) {
    if (item.isDemo === true || item.isTest === true) return true;

    const vId = String(item.vendorId || "").toLowerCase();
    if (
      vId.includes("demo") ||
      vId.includes("test") ||
      vId.includes("vendor-seller-p4") ||
      vId === "p4" ||
      vId === "vend_demo_001"
    ) {
      return true;
    }

    const pId = String(item.productId || "").toLowerCase();
    if (
      pId.includes("demo") ||
      pId.includes("test") ||
      pId === "650000000000000000000001" ||
      pId === "650000000000000000000002"
    ) {
      return true;
    }

    const pName = String(item.name || "").toLowerCase();
    if (
      pName.includes("(test item)") ||
      pName.includes("dummy") ||
      pName.includes("exclusive testing dummy")
    ) {
      return true;
    }

    const vName = String(item.vendorName || "").toLowerCase();
    if (vName.includes("phase 4") || vName.includes("demo seller") || vName.includes("test vendor")) {
      return true;
    }
  }

  return false;
}

export function isRealtimeOrder(order: any): boolean {
  return !isDemoOrder(order);
}

/**
 * Filters an array of orders to only include genuine realtime orders.
 */
export function filterRealtimeOrders<T = any>(orders: T[]): T[] {
  if (!Array.isArray(orders)) return [];
  return orders.filter(isRealtimeOrder);
}

/**
 * Builds a MongoDB query filter ensuring demo orders are excluded at the database level.
 */
export function buildRealtimeOrderMongoFilter(baseFilter: Record<string, any> = {}): Record<string, any> {
  return {
    ...baseFilter,
    isDemo: { $ne: true },
    isTest: { $ne: true },
    demo: { $ne: true },
    test: { $ne: true },
  };
}
