import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
try {
  const envPath = path.resolve(__dirname, "../.env");
  process.loadEnvFile?.(envPath);
} catch (e) {
  console.error("Failed to load .env:", e);
}

// Import db packages
const { connectToMongoDB, mongoOrders, mongoProducts, mongoSellers, mongoGeneric } = await import("../artifacts/api-server/dist/packages/db/index.js");

await connectToMongoDB();

console.log("Connected to MongoDB.");
const orders = await mongoOrders.findMany({});
console.log(`Total orders in mongoOrders: ${orders.length}`);

for (const o of orders) {
  console.log({
    id: o._id || o.id,
    orderId: o.orderId,
    status: o.status,
    paymentStatus: o.paymentStatus || o.payment?.status,
    totalAmount: o.totalAmount || o.total,
    items: o.items?.map((it) => ({
      productId: it.productId,
      name: it.name || it.title,
      price: it.price,
      basePrice: it.basePrice,
      sellerBasePrice: it.sellerBasePrice,
      originalPrice: it.originalPrice,
      quantity: it.quantity,
      vendorId: it.vendorId || it.sellerId,
    })),
  });
}

const sellers = await mongoSellers.findMany({});
console.log(`Total sellers: ${sellers.length}`);
for (const s of sellers) {
  console.log(`Seller: ${s._id || s.id} | ${s.shopName || s.name} | status: ${s.status}`);
}

process.exit(0);
