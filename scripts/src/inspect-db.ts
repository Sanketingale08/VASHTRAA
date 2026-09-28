import { pool } from "../../lib/db/src/index.js";
import { connectToMongoDB } from "../../lib/db/src/mongo.js";

async function inspect() {
  console.log("--- INSPECTING DATABASE ---");
  try {
    const { db: mongoDb } = await connectToMongoDB();
    console.log("Connected to Mongo!");
    
    const mongoSellers = await mongoDb.collection("sellers").find({}).toArray();
    console.log(`Mongo Sellers count: ${mongoSellers.length}`);
    for (const s of mongoSellers) {
      console.log("Seller:", { id: s.id, sellerId: s.sellerId, vendorId: s.vendorId, email: s.email, name: s.name, shopName: s.shopName, status: s.status });
    }

    const mongoVendors = await mongoDb.collection("vendors").find({}).toArray();
    console.log(`Mongo Vendors count: ${mongoVendors.length}`);

    const mongoProducts = await mongoDb.collection("products").find({}).toArray();
    console.log(`Mongo Products count: ${mongoProducts.length}`);
    for (const p of mongoProducts) {
      console.log("Product:", {
        id: p.id,
        name: p.name,
        vendorId: p.vendorId,
        sellerId: p.sellerId,
        vendorName: p.vendorName,
        active: p.active,
        status: p.status,
        approvalStatus: p.approvalStatus,
        stock: p.stock,
        price: p.price,
        category: p.category,
        images: p.images,
      });
    }
  } catch (e) {
    console.error("Mongo Error:", e);
  }

  try {
    const pgSellers = await pool.query(`SELECT id, email, name, status FROM vendors`);
    console.log(`PG Vendors count: ${pgSellers.rows.length}`, pgSellers.rows);
    const pgProducts = await pool.query(`SELECT id, name, "vendorId", active, status, stock, price FROM products`);
    console.log(`PG Products count: ${pgProducts.rows.length}`, pgProducts.rows);
  } catch (e: any) {
    console.log("PG Connection info/error:", e?.message);
  }

  process.exit(0);
}

inspect();
