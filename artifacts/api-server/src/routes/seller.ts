import { Router } from "express";
import { db } from "@workspace/db";
import { ordersTable, productsTable } from "@workspace/db";
import { eq, desc, asc } from "drizzle-orm";
import { requireVendorAuth } from "../middlewares/requireVendorAuth";

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
        fabric: p.fabric,
        color: p.color,
        occasion: p.occasion,
        vendorId: p.vendorId ?? null,
        vendorName: p.vendorName,
        images: Array.isArray(p.images) ? p.images : [],
        isBestSeller: p.isBestSeller,
        isNewArrival: p.isNewArrival,
        rating: p.rating,
        reviewCount: p.reviewCount,
        stock: p.stock,
        active: p.active,
      })),
    });
  } catch (err: any) {
    req.log?.error({ err }, "seller/products failed");
    res.status(500).json({ error: "Failed to load products" });
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
      vendorOrders.push({
        id: order.id,
        createdAt: order.createdAt,
        status: order.status,
        customerName: String(address.name ?? "Customer").split(" ")[0],
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

    if (order.status === "cancelled") {
      return res.status(400).json({ error: "Cannot dispatch a cancelled order" });
    }
    if (order.status === "delivered") {
      return res.status(400).json({ error: "Order already delivered" });
    }
    if (order.status === "dispatched") {
      return res.status(400).json({ error: "Order already dispatched" });
    }

    const history = Array.isArray(order.statusHistory) ? (order.statusHistory as any[]) : [];
    history.push({
      status: "dispatched",
      timestamp: new Date().toISOString(),
      note: `Dispatched via ${String(courierName).trim()} — Tracking: ${String(trackingNumber).trim()}`,
      courierName: String(courierName).trim(),
      trackingNumber: String(trackingNumber).trim(),
    });

    await db
      .update(ordersTable)
      .set({ status: "dispatched", statusHistory: history, updatedAt: new Date() })
      .where(eq(ordersTable.id, orderId));

    res.json({ success: true });
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

export default router;
