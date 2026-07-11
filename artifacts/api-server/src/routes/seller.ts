import { Router } from "express";
import { db } from "@workspace/db";
import { ordersTable, productsTable, stockHistoryTable, vendorSettlementsTable, CATEGORIES, FABRICS, OCCASIONS, COLORS } from "@workspace/db";
import { eq, desc, asc, inArray, and, sql } from "drizzle-orm";
import { requireVendorAuth } from "../middlewares/requireVendorAuth";
import { insertOrderStatusNotification } from "../lib/orderNotifications";
import { insertAdminNotification } from "../lib/adminNotifications";
import { recordStockChange } from "../lib/stockHistory";

const router = Router();

router.get("/seller/dashboard", requireVendorAuth, async (req: any, res: any) => {
  const vendor = req.vendor;
  const vendorId = vendor.id;

  try {
    const products = await db
      .select({ id: productsTable.id, name: productsTable.name, rating: productsTable.rating, stock: productsTable.stock, images: productsTable.images, price: productsTable.price })
      .from(productsTable)
      .where(eq(productsTable.vendorId, vendorId));

    const productIdSet = new Set(products.map((p) => p.id));
    const activeListings = products.filter((p) => p.stock > 0).length;

    const allOrders = await db
      .select({ id: ordersTable.id, items: ordersTable.items, createdAt: ordersTable.createdAt, status: ordersTable.status })
      .from(ordersTable)
      .orderBy(desc(ordersTable.createdAt));

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    let monthlyRevenue = 0;
    let allTimeOrderCount = 0;
    const qtySoldMap = new Map<string, number>();
    const recentOrders: any[] = [];

    for (const order of allOrders) {
      const items = (order.items as any[]) ?? [];
      const vendorItems = items.filter((i) => productIdSet.has(i.productId));
      if (vendorItems.length === 0) continue;

      allTimeOrderCount++;

      if (new Date(order.createdAt) >= monthStart) {
        for (const item of vendorItems) {
          monthlyRevenue += (item.price ?? 0) * (item.quantity ?? 1);
        }
      }

      for (const item of vendorItems) {
        qtySoldMap.set(item.productId, (qtySoldMap.get(item.productId) ?? 0) + (item.quantity ?? 1));
      }

      if (recentOrders.length < 5) {
        recentOrders.push({
          id: order.id,
          createdAt: order.createdAt,
          status: order.status,
          vendorItems: vendorItems.map((i) => ({ name: i.name, quantity: i.quantity ?? 1, price: i.price ?? 0 })),
          vendorTotal: vendorItems.reduce((s: number, i: any) => s + (i.price ?? 0) * (i.quantity ?? 1), 0),
        });
      }
    }

    const topProducts = [...qtySoldMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([productId, qtySold]) => {
        const product = products.find((p) => p.id === productId);
        if (!product) return null;
        return {
          id: productId,
          name: product.name,
          qtySold,
          rating: product.rating,
          price: product.price,
          image: ((product.images as string[]) ?? [])[0] ?? null,
        };
      })
      .filter(Boolean);

    res.json({
      monthlyRevenue,
      orderCount: allTimeOrderCount,
      activeListings,
      avgRating: vendor.rating,
      recentOrders,
      topProducts,
    });
  } catch (err: any) {
    req.log?.error({ err }, "seller/dashboard failed");
    res.status(500).json({ error: "Failed to load dashboard" });
  }
});

router.get("/seller/products", requireVendorAuth, async (req: any, res: any) => {
  const vendorId = req.vendorId;
  try {
    const products = await db
      .select()
      .from(productsTable)
      .where(eq(productsTable.vendorId, vendorId))
      .orderBy(asc(productsTable.name));

    res.json({
      products: products.map((p) => ({
        id: p.id,
        name: p.name,
        description: p.description,
        price: p.price,
        originalPrice: p.originalPrice ?? null,
        category: p.category,
        subcategory: p.subcategory ?? null,
        brand: p.brand ?? null,
        designPattern: p.designPattern ?? null,
        fabric: p.fabric,
        color: p.color,
        occasion: p.occasion,
        vendorId: p.vendorId ?? null,
        vendorName: p.vendorName,
        images: Array.isArray(p.images) ? p.images : [],
        videos: Array.isArray(p.videos) ? p.videos : [],
        variants: Array.isArray(p.variants) ? p.variants : [],
        specifications: Array.isArray(p.specifications) ? p.specifications : [],
        deliveryInfo: p.deliveryInfo ?? "",
        returnPolicy: p.returnPolicy ?? "",
        isBestSeller: p.isBestSeller,
        isNewArrival: p.isNewArrival,
        rating: p.rating,
        reviewCount: p.reviewCount,
        stock: p.stock,
        lowStockThreshold: p.lowStockThreshold,
        active: p.active,
      })),
    });
  } catch (err: any) {
    req.log?.error({ err }, "seller/products failed");
    res.status(500).json({ error: "Failed to load products" });
  }
});

router.get("/seller/inventory", requireVendorAuth, async (req: any, res: any) => {
  const vendorId = req.vendorId;
  try {
    const products = await db
      .select()
      .from(productsTable)
      .where(eq(productsTable.vendorId, vendorId))
      .orderBy(asc(productsTable.name));

    const items = products.map((p) => {
      const isOutOfStock = p.stock <= 0;
      const isLowStock = !isOutOfStock && p.stock <= p.lowStockThreshold;
      return {
        id: p.id,
        name: p.name,
        images: Array.isArray(p.images) ? p.images : [],
        stock: p.stock,
        lowStockThreshold: p.lowStockThreshold,
        price: p.price,
        active: p.active,
        variants: Array.isArray(p.variants) ? p.variants : [],
        isLowStock,
        isOutOfStock,
      };
    });

    res.json({
      items,
      summary: {
        totalProducts: items.length,
        lowStockCount: items.filter((i) => i.isLowStock).length,
        outOfStockCount: items.filter((i) => i.isOutOfStock).length,
        stockValue: products.reduce((sum, p) => sum + p.price * p.stock, 0),
      },
    });
  } catch (err: any) {
    req.log?.error({ err }, "seller/inventory failed");
    res.status(500).json({ error: "Failed to load inventory" });
  }
});

router.get("/seller/inventory/history/:productId", requireVendorAuth, async (req: any, res: any) => {
  const vendorId = req.vendorId;
  const { productId } = req.params;
  try {
    const [product] = await db
      .select({ id: productsTable.id, vendorId: productsTable.vendorId, name: productsTable.name })
      .from(productsTable)
      .where(eq(productsTable.id, productId))
      .limit(1);

    if (!product) return res.status(404).json({ error: "Product not found" });
    if (product.vendorId !== vendorId) return res.status(403).json({ error: "Forbidden: you do not own this product" });

    const history = await db
      .select()
      .from(stockHistoryTable)
      .where(eq(stockHistoryTable.productId, productId))
      .orderBy(desc(stockHistoryTable.createdAt))
      .limit(200);

    res.json({ productId, productName: product.name, history });
  } catch (err: any) {
    req.log?.error({ err }, "seller/inventory/history failed");
    res.status(500).json({ error: "Failed to load stock history" });
  }
});

router.get("/seller/inventory/report", requireVendorAuth, async (req: any, res: any) => {
  const vendorId = req.vendorId;
  try {
    const products = await db
      .select()
      .from(productsTable)
      .where(eq(productsTable.vendorId, vendorId));

    const productIds = products.map((p) => p.id);
    const history = productIds.length > 0
      ? await db.select().from(stockHistoryTable).where(inArray(stockHistoryTable.productId, productIds))
      : [];

    const movementMap = new Map<string, number>();
    for (const h of history) {
      movementMap.set(h.productId, (movementMap.get(h.productId) ?? 0) + Math.abs(h.delta));
    }

    const topMovers = [...movementMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([productId, movement]) => {
        const p = products.find((pr) => pr.id === productId);
        return { productId, name: p?.name ?? "Unknown", movement, currentStock: p?.stock ?? 0 };
      });

    res.json({
      stockValue: products.reduce((sum, p) => sum + p.price * p.stock, 0),
      lowStockCount: products.filter((p) => p.stock > 0 && p.stock <= p.lowStockThreshold).length,
      outOfStockCount: products.filter((p) => p.stock <= 0).length,
      totalProducts: products.length,
      topMovers,
    });
  } catch (err: any) {
    req.log?.error({ err }, "seller/inventory/report failed");
    res.status(500).json({ error: "Failed to generate inventory report" });
  }
});

router.post("/seller/inventory/bulk-stock", requireVendorAuth, async (req: any, res: any) => {
  const vendorId = req.vendorId;
  const { updates } = req.body;

  if (!Array.isArray(updates) || updates.length === 0) {
    return res.status(400).json({ error: "updates must be a non-empty array of { productId, stock }" });
  }

  try {
    const productIds = updates.map((u: any) => u.productId).filter(Boolean);
    const existing = await db
      .select({ id: productsTable.id, vendorId: productsTable.vendorId, stock: productsTable.stock, name: productsTable.name })
      .from(productsTable)
      .where(inArray(productsTable.id, productIds));

    const existingMap = new Map(existing.map((p) => [p.id, p]));
    const results: any[] = [];

    for (const u of updates) {
      const p = existingMap.get(u.productId);
      if (!p) { results.push({ productId: u.productId, success: false, error: "Product not found" }); continue; }
      if (p.vendorId !== vendorId) { results.push({ productId: u.productId, success: false, error: "Forbidden" }); continue; }
      const newStock = parseInt(u.stock);
      if (!Number.isInteger(newStock) || newStock < 0) { results.push({ productId: u.productId, success: false, error: "Invalid stock value" }); continue; }

      await db.update(productsTable).set({ stock: newStock }).where(eq(productsTable.id, u.productId));
      await recordStockChange({
        productId: u.productId,
        vendorId,
        previousStock: p.stock,
        newStock,
        source: "bulk",
        reason: "Bulk stock update",
        actorId: req.userId,
      });
      results.push({ productId: u.productId, success: true, previousStock: p.stock, newStock });
    }

    res.json({ results });
  } catch (err: any) {
    req.log?.error({ err }, "seller/inventory/bulk-stock failed");
    res.status(500).json({ error: "Failed to bulk update stock" });
  }
});

router.post("/seller/inventory/bulk-price", requireVendorAuth, async (req: any, res: any) => {
  const vendorId = req.vendorId;
  const { updates } = req.body;

  if (!Array.isArray(updates) || updates.length === 0) {
    return res.status(400).json({ error: "updates must be a non-empty array of { productId, price }" });
  }

  try {
    const productIds = updates.map((u: any) => u.productId).filter(Boolean);
    const existing = await db
      .select({ id: productsTable.id, vendorId: productsTable.vendorId })
      .from(productsTable)
      .where(inArray(productsTable.id, productIds));

    const existingMap = new Map(existing.map((p) => [p.id, p]));
    const results: any[] = [];

    for (const u of updates) {
      const p = existingMap.get(u.productId);
      if (!p) { results.push({ productId: u.productId, success: false, error: "Product not found" }); continue; }
      if (p.vendorId !== vendorId) { results.push({ productId: u.productId, success: false, error: "Forbidden" }); continue; }
      const newPrice = parseInt(u.price);
      if (!Number.isInteger(newPrice) || newPrice <= 0) { results.push({ productId: u.productId, success: false, error: "Invalid price value" }); continue; }

      const updateSet: Record<string, any> = { price: newPrice };
      if (u.originalPrice !== undefined) {
        updateSet.originalPrice = u.originalPrice ? parseInt(u.originalPrice) : null;
      }
      await db.update(productsTable).set(updateSet).where(eq(productsTable.id, u.productId));
      results.push({ productId: u.productId, success: true, newPrice });
    }

    res.json({ results });
  } catch (err: any) {
    req.log?.error({ err }, "seller/inventory/bulk-price failed");
    res.status(500).json({ error: "Failed to bulk update price" });
  }
});

function parseCsv(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return [];
  const headers = lines[0].split(",").map((h) => h.trim().replace(/^"|"$/g, ""));
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => { row[h] = cells[idx] ?? ""; });
    rows.push(row);
  }
  return rows;
}

router.post("/seller/products/bulk-upload", requireVendorAuth, async (req: any, res: any) => {
  const { csv } = req.body;
  if (!csv || typeof csv !== "string" || !csv.trim()) {
    return res.status(400).json({ error: "csv text content is required" });
  }

  try {
    const rows = parseCsv(csv);
    if (rows.length === 0) {
      return res.status(400).json({ error: "CSV has no data rows" });
    }
    if (rows.length > 500) {
      return res.status(400).json({ error: "Maximum 500 rows per upload" });
    }

    const results: Array<{ row: number; success: boolean; error?: string; productId?: string; name?: string }> = [];
    const toInsert: any[] = [];

    rows.forEach((row, idx) => {
      const rowNum = idx + 2; // account for header row
      const name = row.name?.trim();
      const price = parseInt(row.price);
      const category = row.category?.trim();
      const stock = row.stock ? parseInt(row.stock) : 10;

      if (!name) { results.push({ row: rowNum, success: false, error: "Missing name" }); return; }
      if (!category || !(CATEGORIES as readonly string[]).includes(category)) {
        results.push({ row: rowNum, success: false, error: `Invalid category (must be one of: ${CATEGORIES.join(", ")})` });
        return;
      }
      if (!price || isNaN(price) || price <= 0) { results.push({ row: rowNum, success: false, error: "Invalid price" }); return; }
      if (row.fabric && !(FABRICS as readonly string[]).includes(row.fabric.trim())) {
        results.push({ row: rowNum, success: false, error: `Invalid fabric (must be one of: ${FABRICS.join(", ")})` });
        return;
      }
      if (row.color && !(COLORS as readonly string[]).includes(row.color.trim())) {
        results.push({ row: rowNum, success: false, error: `Invalid color (must be one of: ${COLORS.join(", ")})` });
        return;
      }
      if (row.occasion && !(OCCASIONS as readonly string[]).includes(row.occasion.trim())) {
        results.push({ row: rowNum, success: false, error: `Invalid occasion (must be one of: ${OCCASIONS.join(", ")})` });
        return;
      }
      if (!Number.isInteger(stock) || stock < 0) { results.push({ row: rowNum, success: false, error: "Invalid stock" }); return; }

      toInsert.push({
        _rowNum: rowNum,
        name,
        description: row.description?.trim() ?? "",
        category,
        subcategory: row.subcategory?.trim() || null,
        brand: row.brand?.trim() || null,
        designPattern: row.designPattern?.trim() || null,
        fabric: row.fabric?.trim() || "silk",
        color: row.color?.trim() || "red",
        occasion: row.occasion?.trim() || "festival",
        price,
        originalPrice: row.originalPrice ? parseInt(row.originalPrice) : null,
        stock,
        images: row.images ? row.images.split("|").map((s: string) => s.trim()).filter(Boolean) : [],
        vendorId: req.vendorId,
        vendorName: req.vendor.name,
        active: true,
      });
    });

    for (const item of toInsert) {
      const { _rowNum, ...values } = item;
      try {
        const [product] = await db.insert(productsTable).values(values).returning({ id: productsTable.id, name: productsTable.name });
        results.push({ row: _rowNum, success: true, productId: product.id, name: product.name });
      } catch (insertErr: any) {
        results.push({ row: _rowNum, success: false, error: "Failed to save row" });
      }
    }

    results.sort((a, b) => a.row - b.row);
    res.json({
      results,
      summary: {
        total: rows.length,
        succeeded: results.filter((r) => r.success).length,
        failed: results.filter((r) => !r.success).length,
      },
    });
  } catch (err: any) {
    req.log?.error({ err }, "seller/products/bulk-upload failed");
    res.status(500).json({ error: "Failed to process bulk upload" });
  }
});

router.get("/seller/orders", requireVendorAuth, async (req: any, res: any) => {
  const vendorId = req.vendorId;
  const statusFilter = (req.query.status as string | undefined)?.trim();
  const search = (req.query.search as string | undefined)?.toLowerCase().trim();

  try {
    const products = await db
      .select({ id: productsTable.id })
      .from(productsTable)
      .where(eq(productsTable.vendorId, vendorId));

    const productIdSet = new Set(products.map((p) => p.id));
    if (productIdSet.size === 0) {
      return res.json({ orders: [] });
    }

    const allOrders = await db
      .select()
      .from(ordersTable)
      .orderBy(desc(ordersTable.createdAt));

    const vendorOrders: any[] = [];
    for (const order of allOrders) {
      const items = (order.items as any[]) ?? [];
      const vendorItems = items.filter((i) => productIdSet.has(i.productId));
      if (vendorItems.length === 0) continue;

      const address = (order.address as any) ?? {};
      const orderAcceptances = ((order as any).vendorAcceptances as Record<string, any>) ?? {};
      const myOrderAcceptance = orderAcceptances[vendorId];
      const needsAcceptance = order.status === "confirmed" && !myOrderAcceptance;

      vendorOrders.push({
        id: order.id,
        createdAt: order.createdAt,
        status: order.status,
        customerName: String(address.name ?? "Customer").split(" ")[0],
        needsAcceptance,
        vendorItems: vendorItems.map((i) => ({
          productId: i.productId,
          name: i.name,
          price: i.price ?? 0,
          quantity: i.quantity ?? 1,
          images: Array.isArray(i.images) ? i.images : [],
        })),
        vendorTotal: vendorItems.reduce((s: number, i: any) => s + (i.price ?? 0) * (i.quantity ?? 1), 0),
        itemCount: vendorItems.length,
      });
    }

    let filtered = vendorOrders;
    if (statusFilter && statusFilter !== "all") {
      filtered = filtered.filter((o) => o.status === statusFilter);
    }
    if (search) {
      filtered = filtered.filter((o) => o.id.toLowerCase().includes(search));
    }

    res.json({ orders: filtered });
  } catch (err: any) {
    req.log?.error({ err }, "seller/orders failed");
    res.status(500).json({ error: "Failed to load orders" });
  }
});

router.get("/seller/orders/:orderId", requireVendorAuth, async (req: any, res: any) => {
  const vendorId = req.vendorId;
  const { orderId } = req.params;

  try {
    const products = await db
      .select({ id: productsTable.id })
      .from(productsTable)
      .where(eq(productsTable.vendorId, vendorId));

    const productIdSet = new Set(products.map((p) => p.id));

    const [order] = await db
      .select()
      .from(ordersTable)
      .where(eq(ordersTable.id, orderId))
      .limit(1);

    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }

    const items = (order.items as any[]) ?? [];
    const vendorItems = items.filter((i) => productIdSet.has(i.productId));
    if (vendorItems.length === 0) {
      return res.status(403).json({ error: "You don't have any items in this order" });
    }

    const address = (order.address as any) ?? {};
    const acceptances = ((order as any).vendorAcceptances as Record<string, any>) ?? {};
    const myAcceptance = acceptances[vendorId];
    const vendorAcceptanceStatus: "accepted" | "rejected" | "pending" =
      myAcceptance?.status === "accepted" ? "accepted" :
      myAcceptance?.status === "rejected" ? "rejected" : "pending";

    res.json({
      id: order.id,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
      status: order.status,
      statusHistory: order.statusHistory,
      shippingCity: address.city ?? "",
      shippingState: address.state ?? "",
      deliveryMethod: order.deliveryMethod,
      paymentMethod: order.paymentMethod,
      vendorAcceptanceStatus,
      vendorItems: vendorItems.map((i) => ({
        productId: i.productId,
        name: i.name,
        price: i.price ?? 0,
        quantity: i.quantity ?? 1,
        images: Array.isArray(i.images) ? i.images : [],
      })),
      vendorTotal: vendorItems.reduce((s: number, i: any) => s + (i.price ?? 0) * (i.quantity ?? 1), 0),
    });
  } catch (err: any) {
    req.log?.error({ err }, "seller/orders/:orderId failed");
    res.status(500).json({ error: "Failed to load order" });
  }
});

router.get("/seller/payouts", requireVendorAuth, async (req: any, res: any) => {
  const vendorId = req.vendorId;

  try {
    const products = await db
      .select({ id: productsTable.id })
      .from(productsTable)
      .where(eq(productsTable.vendorId, vendorId));

    const productIdSet = new Set(products.map((p) => p.id));
    if (productIdSet.size === 0) {
      return res.json({
        lifetimeEarnings: 0,
        pendingBalance: 0,
        payouts: [],
      });
    }

    const allOrders = await db
      .select({ id: ordersTable.id, items: ordersTable.items, createdAt: ordersTable.createdAt, updatedAt: ordersTable.updatedAt, status: ordersTable.status })
      .from(ordersTable)
      .orderBy(desc(ordersTable.createdAt));

    let lifetimeEarnings = 0;
    let pendingBalance = 0;
    const payouts: any[] = [];

    for (const order of allOrders) {
      const items = (order.items as any[]) ?? [];
      const vendorItems = items.filter((i) => productIdSet.has(i.productId));
      if (vendorItems.length === 0) continue;
      if (order.status !== "delivered") continue;

      const vendorTotal = vendorItems.reduce((s: number, i: any) => s + (i.price ?? 0) * (i.quantity ?? 1), 0);
      lifetimeEarnings += vendorTotal;
      pendingBalance += vendorTotal;

      payouts.push({
        orderId: order.id,
        deliveredAt: order.updatedAt,
        itemCount: vendorItems.length,
        amount: vendorTotal,
        status: "pending",
      });
    }

    res.json({
      lifetimeEarnings,
      pendingBalance,
      payouts,
    });
  } catch (err: any) {
    req.log?.error({ err }, "seller/payouts failed");
    res.status(500).json({ error: "Failed to load payouts" });
  }
});

router.post("/orders/:orderId/dispatch", requireVendorAuth, async (req: any, res: any) => {
  const { orderId } = req.params;
  const { courierName, trackingNumber } = req.body;

  if (!courierName || !String(courierName).trim()) {
    return res.status(400).json({ error: "Courier name is required" });
  }
  if (!trackingNumber || !String(trackingNumber).trim()) {
    return res.status(400).json({ error: "Tracking number is required" });
  }

  const vendorId = req.vendorId;

  try {
    const myProducts = await db
      .select({ id: productsTable.id })
      .from(productsTable)
      .where(eq(productsTable.vendorId, vendorId));

    const myProductIdSet = new Set(myProducts.map((p) => p.id));

    const [order] = await db
      .select()
      .from(ordersTable)
      .where(eq(ordersTable.id, orderId))
      .limit(1);

    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }

    const items = (order.items as any[]) ?? [];
    const myItems = items.filter((i) => myProductIdSet.has(i.productId));
    if (myItems.length === 0) {
      return res.status(403).json({ error: "You don't have any items in this order" });
    }

    const dispatchAcceptances = ((order as any).vendorAcceptances as Record<string, any>) ?? {};
    const myDispatchAcceptance = dispatchAcceptances[vendorId];
    if (!myDispatchAcceptance || myDispatchAcceptance.status !== "accepted") {
      return res.status(400).json({ error: "You must accept this order before marking it as dispatched" });
    }

    if (order.status === "confirmed") {
      return res.status(400).json({ error: "All vendors must respond before dispatching — order is not yet in processing" });
    }
    if (order.status === "cancelled") {
      return res.status(400).json({ error: "Cannot dispatch a cancelled order" });
    }
    if (order.status === "delivered") {
      return res.status(400).json({ error: "Order already delivered" });
    }

    const history = Array.isArray(order.statusHistory) ? [...(order.statusHistory as any[])] : [];

    const alreadyDispatched = history.some((h) => h.status === "vendor_dispatched" && h.vendorId === vendorId);
    if (alreadyDispatched) {
      return res.status(400).json({ error: "You have already dispatched your items for this order" });
    }

    history.push({
      status: "vendor_dispatched",
      vendorId,
      timestamp: new Date().toISOString(),
      note: `Dispatched via ${String(courierName).trim()} — Tracking: ${String(trackingNumber).trim()}`,
      courierName: String(courierName).trim(),
      trackingNumber: String(trackingNumber).trim(),
    });

    const allProductIdsInOrder = items.map((i: any) => i.productId).filter(Boolean);
    const allOrderProducts = allProductIdsInOrder.length > 0
      ? await db
          .select({ id: productsTable.id, vendorId: productsTable.vendorId })
          .from(productsTable)
          .where(inArray(productsTable.id, allProductIdsInOrder))
      : [];

    const orderAcceptancesMap = ((order as any).vendorAcceptances as Record<string, any>) ?? {};
    const allVendorIdsInOrder = new Set<string>(
      allOrderProducts
        .map((p) => p.vendorId)
        .filter((vid): vid is string => !!vid && orderAcceptancesMap[vid]?.status === "accepted")
    );

    const dispatchedVendorIds = new Set(
      history.filter((h) => h.status === "vendor_dispatched").map((h) => h.vendorId)
    );
    const allDispatched = [...allVendorIdsInOrder].every((vid) => dispatchedVendorIds.has(vid));

    const newStatus = allDispatched ? "dispatched" : order.status;

    if (allDispatched) {
      history.push({
        status: "dispatched",
        timestamp: new Date().toISOString(),
        note: "All vendors have dispatched — order fully dispatched",
      });
    }

    await db
      .update(ordersTable)
      .set({ status: newStatus, statusHistory: history, updatedAt: new Date() })
      .where(eq(ordersTable.id, orderId));

    if (allDispatched) {
      const allItems = items as Array<{ name: string }>;
      await insertOrderStatusNotification({
        userId: order.userId,
        type: "order_shipped",
        orderId: order.id,
        itemName: allItems?.[0]?.name ?? "your order",
        extraItemCount: allItems.length > 1 ? allItems.length - 1 : 0,
        trackingNumber: String(trackingNumber).trim(),
      });
    }

    res.json({ success: true, allDispatched });
  } catch (err: any) {
    req.log?.error({ err }, "orders/dispatch failed");
    res.status(500).json({ error: "Failed to dispatch order" });
  }
});

router.get("/seller/analytics", requireVendorAuth, async (req: any, res: any) => {
  const vendorId = req.vendorId;
  const period = Math.min(Math.max(parseInt(String(req.query.period ?? "30"), 10) || 30, 1), 365);

  try {
    const products = await db
      .select({ id: productsTable.id, name: productsTable.name, images: productsTable.images })
      .from(productsTable)
      .where(eq(productsTable.vendorId, vendorId));

    const productIdSet = new Set(products.map((p) => p.id));
    const productMap = new Map(products.map((p) => [p.id, p]));

    if (productIdSet.size === 0) {
      const emptyDays = Array.from({ length: period }, (_, i) => {
        const d = new Date();
        d.setDate(d.getDate() - (period - 1 - i));
        return { date: d.toISOString().slice(0, 10), revenue: 0, orders: 0 };
      });
      return res.json({ dailyRevenue: emptyDays, ordersByStatus: {}, topProducts: [], customerStates: [] });
    }

    const since = new Date();
    since.setDate(since.getDate() - period);

    const allOrders = await db.select().from(ordersTable).orderBy(desc(ordersTable.createdAt));

    const dailyRevMap = new Map<string, { revenue: number; orders: number }>();
    const ordersByStatus: Record<string, number> = {};
    const productQtyMap = new Map<string, { qty: number; revenue: number }>();
    const stateMap = new Map<string, number>();

    for (const order of allOrders) {
      const items = (order.items as any[]) ?? [];
      const vendorItems = items.filter((i) => productIdSet.has(i.productId));
      if (vendorItems.length === 0) continue;

      const vendorTotal = vendorItems.reduce((s: number, i: any) => s + (i.price ?? 0) * (i.quantity ?? 1), 0);

      ordersByStatus[order.status] = (ordersByStatus[order.status] ?? 0) + 1;

      for (const item of vendorItems) {
        const prev = productQtyMap.get(item.productId) ?? { qty: 0, revenue: 0 };
        productQtyMap.set(item.productId, {
          qty: prev.qty + (item.quantity ?? 1),
          revenue: prev.revenue + (item.price ?? 0) * (item.quantity ?? 1),
        });
      }

      const address = (order.address as any) ?? {};
      if (address.state) {
        stateMap.set(address.state, (stateMap.get(address.state) ?? 0) + 1);
      }

      if (new Date(order.createdAt) >= since) {
        const day = new Date(order.createdAt).toISOString().slice(0, 10);
        const prev = dailyRevMap.get(day) ?? { revenue: 0, orders: 0 };
        dailyRevMap.set(day, { revenue: prev.revenue + vendorTotal, orders: prev.orders + 1 });
      }
    }

    const dailyRevenue = Array.from({ length: period }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (period - 1 - i));
      const day = d.toISOString().slice(0, 10);
      const data = dailyRevMap.get(day) ?? { revenue: 0, orders: 0 };
      return { date: day, revenue: data.revenue, orders: data.orders };
    });

    const topProducts = [...productQtyMap.entries()]
      .sort((a, b) => b[1].qty - a[1].qty)
      .slice(0, 5)
      .map(([productId, data]) => {
        const p = productMap.get(productId);
        return {
          productId,
          name: p?.name ?? "Unknown",
          qtySold: data.qty,
          revenue: data.revenue,
          image: ((p?.images as string[]) ?? [])[0] ?? null,
        };
      });

    const customerStates = [...stateMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([state, count]) => ({ state, count }));

    res.json({ dailyRevenue, ordersByStatus, topProducts, customerStates });
  } catch (err: any) {
    req.log?.error({ err }, "seller/analytics failed");
    res.status(500).json({ error: "Failed to load analytics" });
  }
});

router.post("/seller/orders/:orderId/accept", requireVendorAuth, async (req: any, res: any) => {
  const vendorId = req.vendorId as string;
  const { orderId } = req.params;

  try {
    const myProducts = await db.select({ id: productsTable.id })
      .from(productsTable)
      .where(eq(productsTable.vendorId, vendorId));
    const myProductIdSet = new Set(myProducts.map((p) => p.id));

    await db.transaction(async (tx) => {
      const [order] = await tx.select().from(ordersTable).where(eq(ordersTable.id, orderId)).for("update").limit(1);
      if (!order) throw Object.assign(new Error("Order not found"), { status: 404 });

      const items = (order.items as any[]) ?? [];
      const myItems = items.filter((i) => myProductIdSet.has(i.productId));
      if (myItems.length === 0) throw Object.assign(new Error("You don't have items in this order"), { status: 403 });
      if (order.status !== "confirmed") throw Object.assign(new Error("Order cannot be accepted in its current state"), { status: 400 });

      const acceptances = ((order as any).vendorAcceptances as Record<string, any>) ?? {};
      if (acceptances[vendorId]) throw Object.assign(new Error("You have already responded to this order"), { status: 400 });

      acceptances[vendorId] = { status: "accepted", at: new Date().toISOString() };

      const allProductIds = items.map((i: any) => i.productId).filter(Boolean) as string[];
      const allOrderProducts = allProductIds.length > 0
        ? await tx.select({ vendorId: productsTable.vendorId }).from(productsTable).where(inArray(productsTable.id, allProductIds))
        : [];
      const allVendorIds = [...new Set(allOrderProducts.map((p) => p.vendorId).filter(Boolean))] as string[];
      const allResponded = allVendorIds.length > 0 && allVendorIds.every(
        (vid) => acceptances[vid]?.status === "accepted" || acceptances[vid]?.status === "rejected"
      );
      const anyAccepted = allVendorIds.some((vid) => acceptances[vid]?.status === "accepted");

      const history = [...(Array.isArray(order.statusHistory) ? (order.statusHistory as any[]) : [])];
      const updates: Record<string, any> = { vendorAcceptances: acceptances, updatedAt: new Date() };

      if (allResponded && anyAccepted) {
        history.push({ status: "processing", timestamp: new Date().toISOString(), note: "All vendors responded — order is being prepared" });
        updates.status = "processing";
        updates.statusHistory = history;

        await insertOrderStatusNotification({
          tx,
          userId: order.userId,
          type: "order_packed",
          orderId: order.id,
          itemName: (items[0] as any)?.name ?? "your order",
          extraItemCount: items.length > 1 ? items.length - 1 : 0,
        });
      } else {
        history.push({ vendorId, timestamp: new Date().toISOString(), note: "Vendor accepted their portion" });
        updates.statusHistory = history;
      }

      await tx.update(ordersTable).set(updates).where(eq(ordersTable.id, orderId));
    });

    res.json({ success: true });
  } catch (err: any) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    req.log?.error({ err }, "seller/orders/accept failed");
    res.status(500).json({ error: "Failed to accept order" });
  }
});

router.post("/seller/orders/:orderId/reject", requireVendorAuth, async (req: any, res: any) => {
  const vendorId = req.vendorId as string;
  const { orderId } = req.params;
  const reason = String(req.body?.reason ?? "").trim();

  if (!reason) {
    return res.status(400).json({ error: "A rejection reason is required" });
  }

  try {
    const myProducts = await db.select({ id: productsTable.id })
      .from(productsTable)
      .where(eq(productsTable.vendorId, vendorId));
    const myProductIdSet = new Set(myProducts.map((p) => p.id));

    await db.transaction(async (tx) => {
      const [order] = await tx.select().from(ordersTable).where(eq(ordersTable.id, orderId)).for("update").limit(1);
      if (!order) throw Object.assign(new Error("Order not found"), { status: 404 });

      const items = (order.items as any[]) ?? [];
      const myItems = items.filter((i) => myProductIdSet.has(i.productId));
      if (myItems.length === 0) throw Object.assign(new Error("You don't have items in this order"), { status: 403 });
      if (order.status !== "confirmed") throw Object.assign(new Error("Order cannot be rejected in its current state"), { status: 400 });

      const acceptances = ((order as any).vendorAcceptances as Record<string, any>) ?? {};
      if (acceptances[vendorId]) throw Object.assign(new Error("You have already responded to this order"), { status: 400 });

      acceptances[vendorId] = { status: "rejected", reason, at: new Date().toISOString() };

      const allProductIds = items.map((i: any) => i.productId).filter(Boolean) as string[];
      const allOrderProducts = allProductIds.length > 0
        ? await tx.select({ vendorId: productsTable.vendorId }).from(productsTable).where(inArray(productsTable.id, allProductIds))
        : [];
      const allVendorIds = [...new Set(allOrderProducts.map((p) => p.vendorId).filter(Boolean))] as string[];
      const allRejected = allVendorIds.length > 0 && allVendorIds.every((vid) => acceptances[vid]?.status === "rejected");

      const history = [...(Array.isArray(order.statusHistory) ? (order.statusHistory as any[]) : [])];

      if (allRejected) {
        history.push({ status: "cancelled", timestamp: new Date().toISOString(), note: `All vendors rejected. Last reason: ${reason}` });

        for (const item of items as Array<{ productId: string; quantity: number }>) {
          const [prod] = await tx.select({ stock: productsTable.stock, vendorId: productsTable.vendorId })
            .from(productsTable).where(eq(productsTable.id, item.productId)).limit(1);
          await tx.update(productsTable)
            .set({ stock: sql`${productsTable.stock} + ${item.quantity}` })
            .where(eq(productsTable.id, item.productId));
          await recordStockChange({
            tx,
            productId: item.productId,
            vendorId: prod?.vendorId ?? null,
            previousStock: prod?.stock ?? 0,
            newStock: (prod?.stock ?? 0) + item.quantity,
            source: "cancel",
            reason: `Vendor rejection: ${reason}`,
            orderId: order.id,
          });
        }

        await tx.update(ordersTable).set({
          status: "cancelled",
          statusHistory: history,
          cancelReason: `Vendor(s) rejected: ${reason}`,
          vendorRejectionReason: reason,
          vendorAcceptances: acceptances,
          refundStatus: "pending",
          refundMethod: (order as any).paymentMethod,
          updatedAt: new Date(),
        } as any).where(eq(ordersTable.id, orderId));

        await insertOrderStatusNotification({
          tx,
          userId: order.userId,
          type: "order_cancelled",
          orderId: order.id,
          itemName: (items[0] as any)?.name ?? "your order",
          extraItemCount: items.length > 1 ? items.length - 1 : 0,
        });

        await insertAdminNotification({
          tx,
          type: "system_error_alert",
          title: "Vendor rejected an order — order cancelled",
          body: `All vendor(s) rejected order #${order.id.slice(0, 8).toUpperCase()}. Last reason: ${reason}`,
          metadata: { orderId: order.id, vendorId },
        });
      } else {
        history.push({ vendorId, timestamp: new Date().toISOString(), note: `Vendor rejected their portion: ${reason}` });

        const allRespondedNow = allVendorIds.length > 0 && allVendorIds.every(
          (vid) => acceptances[vid]?.status === "accepted" || acceptances[vid]?.status === "rejected"
        );
        const anyAcceptedNow = allVendorIds.some((vid) => acceptances[vid]?.status === "accepted");

        const partialUpdates: Record<string, any> = {
          vendorAcceptances: acceptances,
          statusHistory: history,
          updatedAt: new Date(),
        };

        await insertOrderStatusNotification({
          tx,
          userId: order.userId,
          type: "vendor_item_rejected",
          orderId: order.id,
          itemName: (items[0] as any)?.name ?? "your order",
          extraItemCount: items.length > 1 ? items.length - 1 : 0,
        });

        if (allRespondedNow && anyAcceptedNow) {
          history.push({ status: "processing", timestamp: new Date().toISOString(), note: "Some vendors accepted — order proceeding with accepted items" });
          partialUpdates.status = "processing";
          partialUpdates.statusHistory = history;

          await insertOrderStatusNotification({
            tx,
            userId: order.userId,
            type: "order_packed",
            orderId: order.id,
            itemName: (items[0] as any)?.name ?? "your order",
            extraItemCount: items.length > 1 ? items.length - 1 : 0,
          });
        }

        await tx.update(ordersTable).set(partialUpdates as any).where(eq(ordersTable.id, orderId));

        await insertAdminNotification({
          tx,
          type: "system_error_alert",
          title: "Vendor rejected items in an order",
          body: `Vendor rejected their portion of order #${order.id.slice(0, 8).toUpperCase()}. Reason: ${reason}`,
          metadata: { orderId: order.id, vendorId },
        });
      }
    });

    res.json({ success: true });
  } catch (err: any) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    req.log?.error({ err }, "seller/orders/reject failed");
    res.status(500).json({ error: "Failed to reject order" });
  }
});

router.post("/seller/settlements/payout-request", requireVendorAuth, async (req: any, res: any): Promise<void> => {
  const vendorId = req.vendorId as string;

  try {
    const result = await db.transaction(async (tx) => {
      const [existing] = await tx
        .select({ id: vendorSettlementsTable.id })
        .from(vendorSettlementsTable)
        .where(and(
          eq(vendorSettlementsTable.vendorId, vendorId),
          eq(vendorSettlementsTable.type, "payout"),
          eq(vendorSettlementsTable.status, "pending"),
        ))
        .limit(1);

      if (existing) {
        return { conflict: true } as const;
      }

      const processing = await tx
        .select()
        .from(vendorSettlementsTable)
        .where(and(
          eq(vendorSettlementsTable.vendorId, vendorId),
          eq(vendorSettlementsTable.status, "processing"),
        ));

      if (processing.length === 0) {
        return { empty: true } as const;
      }

      const sourceIds = processing.map((s) => s.id);
      const totalAmount = processing.reduce((s, x) => s + (x.netPayout ?? x.amount), 0);

      await tx
        .update(vendorSettlementsTable)
        .set({ status: "approved", reviewedAt: new Date() })
        .where(inArray(vendorSettlementsTable.id, sourceIds));

      const [payout] = await tx.insert(vendorSettlementsTable).values({
        vendorId,
        amount: totalAmount,
        type: "payout",
        status: "pending",
        note: `Payout request for ${processing.length} settlement(s). Source IDs: ${sourceIds.join(",")}`,
      }).returning();

      return { payout, settlementsIncluded: processing.length, totalAmount };
    });

    if ("conflict" in result) {
      res.status(409).json({ error: "A payout request is already pending review. Please wait for admin to process it before submitting another." });
      return;
    }
    if ("empty" in result) {
      res.status(400).json({ error: "No settlements in 'processing' status to request a payout for." });
      return;
    }

    res.status(201).json(result);
  } catch (err: any) {
    req.log?.error({ err }, "seller/settlements/payout-request failed");
    res.status(500).json({ error: "Failed to create payout request" });
  }
});

router.get("/seller/settlements", requireVendorAuth, async (req: any, res: any) => {
  const vendorId = req.vendorId;
  const statusFilter = (req.query.status as string | undefined)?.trim();
  const page = Math.max(1, parseInt((req.query.page as string) || "1"));
  const limit = 20;
  const offset = (page - 1) * limit;

  try {
    const all = await db
      .select()
      .from(vendorSettlementsTable)
      .where(eq(vendorSettlementsTable.vendorId, vendorId))
      .orderBy(desc(vendorSettlementsTable.createdAt));

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    let totalEarnedThisMonth = 0;
    let totalPending = 0;
    let totalPaid = 0;
    let processingCount = 0;
    let hasPendingPayoutRequest = false;

    for (const s of all) {
      const net = s.netPayout ?? s.amount;
      if (new Date(s.createdAt) >= monthStart) totalEarnedThisMonth += net;
      if (s.status === "processing" || s.status === "pending" || s.status === "approved") totalPending += net;
      if (s.status === "paid" || s.status === "completed") totalPaid += net;
      if (s.status === "processing" && s.type !== "payout") processingCount++;
      if (s.type === "payout" && s.status === "pending") hasPendingPayoutRequest = true;
    }

    const filtered = statusFilter && statusFilter !== "all" ? all.filter((s) => s.status === statusFilter) : all;
    const total = filtered.length;
    const settlements = filtered.slice(offset, offset + limit);

    res.json({
      settlements,
      total,
      page,
      totalPages: Math.ceil(total / limit),
      summary: { totalEarnedThisMonth, totalPending, totalPaid, processingCount, hasPendingPayoutRequest },
    });
  } catch (err: any) {
    req.log?.error({ err }, "seller/settlements failed");
    res.status(500).json({ error: "Failed to load settlements" });
  }
});

router.get("/seller/settlements/:settlementId", requireVendorAuth, async (req: any, res: any) => {
  const vendorId = req.vendorId;
  const { settlementId } = req.params;

  try {
    const [settlement] = await db
      .select()
      .from(vendorSettlementsTable)
      .where(and(
        eq(vendorSettlementsTable.id, settlementId),
        eq(vendorSettlementsTable.vendorId, vendorId),
      ))
      .limit(1);

    if (!settlement) {
      return res.status(404).json({ error: "Settlement not found" });
    }

    res.json({ settlement });
  } catch (err: any) {
    req.log?.error({ err }, "seller/settlements/:id failed");
    res.status(500).json({ error: "Failed to load settlement" });
  }
});

export default router;
