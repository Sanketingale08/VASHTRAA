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

export default router;
