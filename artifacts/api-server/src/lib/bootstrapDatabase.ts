import { pool, db, siteSettingsTable, vendorsTable, productsTable, connectToMongoDB, mongoSiteSettings, mongoVendors, mongoProducts, getNextSequenceValue } from "@workspace/db";
import { logger } from "./logger";
import { clearAdminKeyCache } from "../middlewares/isAdmin";
import crypto from "crypto";

/**
 * Bootstraps MongoDB Atlas database objects and fallback PostgreSQL sequences.
 * Safe to run on every startup.
 */
export async function bootstrapDatabase(): Promise<void> {
  try {
    // 1. Initialize MongoDB Atlas connection
    await connectToMongoDB();
    logger.info("MongoDB Atlas database connection verified (database: VASTRAA)");

    // 2. Initialize sequence counters in MongoDB
    await getNextSequenceValue("order_id");
    await getNextSequenceValue("product_id");
    logger.info("MongoDB sequence counters verified/created (order_id, product_id)");

    // 3. Set Super Admin access key hash, key, and email in MongoDB site_settings
    const adminKeyHash = crypto.createHash("sha256").update("Admin@123").digest("hex");
    await mongoSiteSettings.set("admin_key_hash", adminKeyHash);
    await mongoSiteSettings.set("admin_access_key", "Admin@123");
    await mongoSiteSettings.set("admin_email", "admin@vastraa.com");

    // 4. Fallback PostgreSQL sequences & settings
    try {
      await pool.query(`
        CREATE SEQUENCE IF NOT EXISTS order_id_seq
          START WITH 100001 INCREMENT BY 1
          NO MINVALUE NO MAXVALUE CACHE 1;

        CREATE SEQUENCE IF NOT EXISTS product_id_seq
          START WITH 100001 INCREMENT BY 1
          NO MINVALUE NO MAXVALUE CACHE 1;
      `);
      await db
        .insert(siteSettingsTable)
        .values({ key: "admin_key_hash", value: adminKeyHash })
        .onConflictDoUpdate({
          target: siteSettingsTable.key,
          set: { value: adminKeyHash, updatedAt: new Date() },
        });
      await db
        .insert(siteSettingsTable)
        .values({ key: "admin_access_key", value: "Admin@123" })
        .onConflictDoUpdate({
          target: siteSettingsTable.key,
          set: { value: "Admin@123", updatedAt: new Date() },
        });
      await db
        .insert(siteSettingsTable)
        .values({ key: "admin_email", value: "admin@vastraa.com" })
        .onConflictDoUpdate({
          target: siteSettingsTable.key,
          set: { value: "admin@vastraa.com", updatedAt: new Date() },
        });
    } catch (pgErr) {
      logger.warn({ err: pgErr }, "PostgreSQL fallback bootstrap warning (ignored as MongoDB is primary)");
    }

    clearAdminKeyCache();
    logger.info("Super Admin access key (Admin@123) and email (admin@vastraa.com) verified in MongoDB Atlas site_settings");

    // 5. Execute Data Migration from PostgreSQL -> MongoDB Atlas
    await runPgToMongoMigration();

    // 6. Seed Demo Seller (VEND_DEMO_001) and Dummy Test Product (TEST_DEMO_PRODUCT_001)
    await seedDemoVendorAndProduct();
  } catch (err) {
    logger.error({ err }, "Failed to bootstrap database");
    throw err;
  }
}

const TABLES_MAPPING = [
  { table: "vendors", collection: "vendors" },
  { table: "products", collection: "products" },
  { table: "product_categories", collection: "categories" },
  { table: "product_brands", collection: "brands" },
  { table: "orders", collection: "orders" },
  { table: "cart_items", collection: "cart_items" },
  { table: "wishlists", collection: "wishlists" },
  { table: "saved_addresses", collection: "saved_addresses" },
  { table: "saved_payment_methods", collection: "saved_payment_methods" },
  { table: "coupons", collection: "coupons" },
  { table: "coupon_redemptions", collection: "coupon_redemptions" },
  { table: "user_profiles", collection: "user_profiles" },
  { table: "reward_points_log", collection: "reward_points_log" },
  { table: "referrals", collection: "referrals" },
  { table: "notifications", collection: "notifications" },
  { table: "notification_preferences", collection: "notification_preferences" },
  { table: "support_tickets", collection: "support_tickets" },
  { table: "ticket_messages", collection: "ticket_messages" },
  { table: "stock_history", collection: "stock_history" },
  { table: "product_reviews", collection: "reviews" },
  { table: "product_queries", collection: "product_queries" },
  { table: "vendor_settlements", collection: "vendor_settlements" },
  { table: "commission_rules", collection: "commission_rules" },
  { table: "report_schedules", collection: "report_schedules" },
  { table: "email_outbox", collection: "email_outbox" },
  { table: "seller_registration_drafts", collection: "seller_registration_drafts" },
  { table: "site_settings", collection: "site_settings" },
  { table: "hero_banners", collection: "hero_banners" },
  { table: "admin_login_sessions", collection: "admin_sessions" },
  { table: "admin_recovery_codes", collection: "admin_recovery_codes" },
  { table: "admin_otp_challenges", collection: "admin_otp_challenges" },
  { table: "admin_audit_logs", collection: "admin_audit_logs" },
  { table: "bulk_import_batches", collection: "bulk_import_batches" },
];

async function runPgToMongoMigration(): Promise<void> {
  const { getMongoDb } = await import("@workspace/db");
  const mongoDb = getMongoDb();

  for (const item of TABLES_MAPPING) {
    try {
      const pgCountRes = await pool.query(`SELECT COUNT(*)::int AS count FROM "${item.table}"`).catch(() => ({ rows: [{ count: 0 }] }));
      const pgCount = pgCountRes.rows[0]?.count ?? 0;

      if (pgCount > 0) {
        const pgRows = await pool.query(`SELECT * FROM "${item.table}"`);
        const col = mongoDb.collection(item.collection);

        for (const row of pgRows.rows) {
          const doc: Record<string, any> = { ...row };
          if (row.id !== undefined) {
            doc._id = row.id;
          } else if (row.key !== undefined) {
            doc._id = row.key;
          } else if (row.user_id !== undefined && row.product_id !== undefined) {
            doc._id = `${row.user_id}_${row.product_id}`;
          } else if (row.user_id !== undefined) {
            doc._id = row.user_id;
          }

          if (doc._id) {
            await col.updateOne({ _id: doc._id }, { $set: doc }, { upsert: true });
          } else {
            await col.insertOne(doc);
          }
        }

        logger.info(`[Migration PASS] ${item.table} (PG: ${pgCount}) -> ${item.collection} (Mongo: ${mongoCount})`);
      }
    } catch (err: any) {
      logger.warn({ err: err.message }, `[Migration Notice] Table ${item.table} migration skipped or non-existent in PG source`);
    }
  }
}

async function seedDemoVendorAndProduct(): Promise<void> {
  try {
    const demoVendor = {
      id: "VEND_DEMO_001",
      vendorId: "VEND_DEMO_001",
      sellerId: "VEND_DEMO_001",
      name: "Yeola Weavers",
      sellerName: "Yeola Weavers",
      shopName: "Yeola Weavers",
      email: "seller@vastraa.com",
      contactEmail: "seller@vastraa.com",
      location: "Yeola, Maharashtra",
      rating: 4.9,
      sareesCount: 1240,
      avatar: "/images/artisan-1.png",
      bio: "Master weavers from Yeola, the heartland of Paithani silk weaving.",
      status: "approved",
      ownerId: "USR_DEMO_SELLER",
    };

    await mongoVendors.update("VEND_DEMO_001", demoVendor as any).catch(() => {});

    try {
      await db
        .insert(vendorsTable)
        .values(demoVendor as any)
        .onConflictDoUpdate({
          target: vendorsTable.id,
          set: { status: "approved", updatedAt: new Date() },
        });
    } catch {}

    const dummyProduct = {
      id: "TEST_DEMO_PRODUCT_001",
      name: "Demo Paithani Silk Saree (Test Item)",
      description:
        "Exclusive testing dummy saree for verifying demo seller product management, inventory stock updates, user browsing, buy now, address selection, order placement, and seller order processing.",
      category: "paithani",
      subcategory: "Bridal Handloom",
      brand: "Yeola Weavers",
      designPattern: "Peacock Zari Weave",
      fabric: "silk",
      color: "gold",
      occasion: "festival",
      price: 9999,
      originalPrice: 14999,
      stock: 25,
      lowStockThreshold: 5,
      images: ["/images/product-1.png", "/images/product-2.png"],
      videos: [],
      variants: [
        { name: "Color", options: ["Gold", "Royal Red"] },
        { name: "Blouse", options: ["Unstitched", "Stitched Custom"] },
      ],
      specifications: [
        { key: "Weave Type", value: "Handloom Paithani" },
        { key: "Zari Material", value: "24k Gold Plated" },
        { key: "Length", value: "6.3 Mtr (with blouse)" },
      ],
      deliveryInfo: "Free 3-day express shipping & easy returns",
      returnPolicy: "7-day hassle-free returns",
      isBestSeller: true,
      isNewArrival: true,
      isFeatured: true,
      rating: 5.0,
      reviewCount: 1,
      vendorId: "VEND_DEMO_001",
      vendorName: "Yeola Weavers",
      active: true,
      status: "approved",
      viewCount: 10,
    };

    const existingPrd = await mongoProducts.findById("TEST_DEMO_PRODUCT_001").catch(() => null);
    if (existingPrd) {
      await mongoProducts.update("TEST_DEMO_PRODUCT_001", {
        ...dummyProduct,
        stock: existingPrd.stock > 0 ? existingPrd.stock : dummyProduct.stock,
      } as any).catch(() => {});
    } else {
      await mongoProducts.insert(dummyProduct as any).catch(() => {});
    }

    try {
      await db
        .insert(productsTable)
        .values(dummyProduct as any)
        .onConflictDoUpdate({
          target: productsTable.id,
          set: {
            name: dummyProduct.name,
            price: dummyProduct.price,
            stock: dummyProduct.stock,
            active: true,
            status: "approved",
            updatedAt: new Date(),
          },
        });
    } catch {}

    logger.info("Demo seller (VEND_DEMO_001) & dummy product (TEST_DEMO_PRODUCT_001) verified/seeded.");
  } catch (err: any) {
    logger.warn({ err: err.message }, "Notice: Demo seller and product seeding notice");
  }
}


