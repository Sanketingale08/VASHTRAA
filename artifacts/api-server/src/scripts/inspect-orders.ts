import path from "path";
try {
  const envPath = path.resolve(process.cwd(), "../../.env");
  (process as any).loadEnvFile?.(envPath);
} catch {}

import { connectToMongoDB, mongoProducts, mongoGeneric } from "@workspace/db";

async function main() {
  await connectToMongoDB();
  const prods = await mongoProducts.findMany({});
  console.log(`Total products: ${prods.length}`);
  const p62 = prods.find((p: any) => p.id === "PS62" || p._id === "PS62" || p.productId === "PS62");
  console.log("PS62 product:", p62);
  for (const p of prods) {
    console.log({
      id: p.id || p._id,
      name: p.name || p.title,
      price: p.price,
      basePrice: p.basePrice,
      sellerBasePrice: p.sellerBasePrice,
      originalPrice: p.originalPrice,
      vendorId: p.vendorId || p.sellerId
    });
  }
}

main().then(() => process.exit(0)).catch(err => {
  console.error(err);
  process.exit(1);
});
