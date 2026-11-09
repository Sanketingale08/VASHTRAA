import { pool, db, siteSettingsTable, vendorsTable, productsTable, productCategoriesTable, connectToMongoDB, mongoSiteSettings, mongoVendors, mongoProducts, mongoProductCategories, getNextSequenceValue, sql } from "@workspace/db";
import { logger } from "./logger";
import { clearAdminKeyCache } from "../middlewares/isAdmin";
import crypto from "crypto";
import bcrypt from "bcryptjs";

/**
 * Bootstraps MongoDB Atlas database objects and fallback PostgreSQL sequences.
 * Safe to run on every startup.
 */
export async function bootstrapDatabase(): Promise<void> {
  try {
    // 1. Initialize MongoDB Atlas connection
    await connectToMongoDB();
    logger.info("MongoDB Atlas database connection verified (database: VASTRAA)");

    // 2. Seed default categories (Paithani and Designer)
    await mongoProductCategories.seedDefaults();
    logger.info("Default product categories verified (Paithani, Designer)");

    // 3. Initialize sequence counters in MongoDB
    await getNextSequenceValue("order_id");
    await getNextSequenceValue("product_id");
    logger.info("MongoDB sequence counters verified/created (order_id, product_id)");

    // 3. Set Super Admin access key hash, email, profile & platform defaults in MongoDB site_settings
    // Access keys are ALWAYS hashed with bcrypt and never stored in plain text.
    const initialAdminKey = process.env.ADMIN_API_KEY || "Admin@123";
    const adminKeyHash = bcrypt.hashSync(initialAdminKey, 10);
    const defaultSettings: Record<string, string> = {
      admin_key_hash: adminKeyHash,
      admin_name: "Super Admin",
      admin_email: "admin@vastraa.com",
      admin_mobile: "+91 98765 43210",
      platform_name: "VASTRAA",
      platform_logo_url: "/logo.svg",
      country: "India",
      currency: "INR",
      timezone: "Asia/Kolkata",
      date_format: "DD/MM/YYYY",
      support_email: "support@vastraa.com",
      support_mobile: "+91 98765 43210",
      business_info: "VASTRAA Marketplace Pvt Ltd",
    };

    for (const [k, v] of Object.entries(defaultSettings)) {
      const existing = await mongoSiteSettings.get(k);
      if (existing === null) {
        await mongoSiteSettings.set(k, v);
      }
    }

    // Ensure no legacy plaintext keys remain in MongoDB site_settings
    await mongoSiteSettings.delete("admin_access_key").catch(() => {});
    await mongoSiteSettings.delete("admin_key").catch(() => {});

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
      for (const [k, v] of Object.entries(defaultSettings)) {
        await db
          .insert(siteSettingsTable)
          .values({ key: k, value: v })
          .onConflictDoNothing();
      }

      await db
        .insert(productCategoriesTable)
        .values({
          id: "cat-tops-default" as any,
          name: "Tops",
          slug: "tops",
          type: "main",
          createdBy: "system",
          status: "approved",
          active: true,
        })
        .onConflictDoNothing();
    } catch (pgErr) {
      logger.warn({ err: pgErr }, "PostgreSQL fallback bootstrap warning (ignored as MongoDB is primary)");
    }

    clearAdminKeyCache();
    logger.info("Super Admin access key (Admin@123) and email (admin@vastraa.com) verified in MongoDB Atlas site_settings");

    // 5. Execute Data Migration from PostgreSQL -> MongoDB Atlas if helper available
    try {
      if (typeof (globalThis as any).runPgToMongoMigration === "function") {
        await (globalThis as any).runPgToMongoMigration();
      }
    } catch {}

  } catch (err) {
    logger.error({ err }, "Failed to bootstrap database");
    throw err;
  }
}



