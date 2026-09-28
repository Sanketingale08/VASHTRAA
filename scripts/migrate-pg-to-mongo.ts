import { pool } from "../lib/db/src/index";
import { connectToMongoDB, getMongoDb } from "../lib/db/src/mongo";

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

async function runMigration() {
  console.log("==========================================================================");
  console.log("          VASTRAA DATABASE MIGRATION: PostgreSQL -> MongoDB Atlas         ");
  console.log("==========================================================================");

  const { db: mongoDb } = await connectToMongoDB();
  console.log("[Migration] MongoDB connection verified.");

  const auditReport: Array<{ table: string; collection: string; pgCount: number; mongoCount: number; status: string }> = [];

  for (const item of TABLES_MAPPING) {
    try {
      // 1. Fetch count & rows from PostgreSQL
      const pgCountRes = await pool.query(`SELECT COUNT(*)::int AS count FROM "${item.table}"`);
      const pgCount = pgCountRes.rows[0].count;

      if (pgCount === 0) {
        const currentMongoCount = await mongoDb.collection(item.collection).countDocuments();
        auditReport.push({ table: item.table, collection: item.collection, pgCount: 0, mongoCount: currentMongoCount, status: "PASS" });
        console.log(`[PASS] ${item.table} -> ${item.collection}: 0 records in PG.`);
        continue;
      }

      const pgRows = await pool.query(`SELECT * FROM "${item.table}"`);
      const docs = pgRows.rows.map(row => {
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
        return doc;
      });

      // 2. Bulk upsert into MongoDB
      const col = mongoDb.collection(item.collection);
      for (const doc of docs) {
        if (doc._id) {
          await col.updateOne({ _id: doc._id }, { $set: doc }, { upsert: true });
        } else {
          await col.insertOne(doc);
        }
      }

      // 3. Verify counts
      const mongoCount = await col.countDocuments();
      const status = mongoCount >= pgCount ? "PASS" : "FAIL";
      auditReport.push({ table: item.table, collection: item.collection, pgCount, mongoCount, status });
      console.log(`[${status}] ${item.table} (${pgCount}) -> ${item.collection} (${mongoCount})`);
    } catch (err: any) {
      console.error(`[ERROR] Failed migrating ${item.table}:`, err.message || err);
      auditReport.push({ table: item.table, collection: item.collection, pgCount: -1, mongoCount: -1, status: "FAIL" });
    }
  }

  // 4. Initialize Sequence Counters in MongoDB
  try {
    const orderSeqRes = await pool.query(`SELECT last_value FROM order_id_seq`).catch(() => ({ rows: [] }));
    const productSeqRes = await pool.query(`SELECT last_value FROM product_id_seq`).catch(() => ({ rows: [] }));

    const orderSeq = orderSeqRes.rows[0]?.last_value ? parseInt(orderSeqRes.rows[0].last_value, 10) : 100001;
    const productSeq = productSeqRes.rows[0]?.last_value ? parseInt(productSeqRes.rows[0].last_value, 10) : 100001;

    await mongoDb.collection("counters").updateOne({ _id: "order_id" as any }, { $set: { seq: orderSeq } }, { upsert: true });
    await mongoDb.collection("counters").updateOne({ _id: "product_id" as any }, { $set: { seq: productSeq } }, { upsert: true });
    console.log(`[PASS] Initialized MongoDB sequence counters: order_id (${orderSeq}), product_id (${productSeq})`);
  } catch (err: any) {
    console.warn("[WARN] Sequences default initialization used:", err.message);
  }

  console.log("\n==========================================================================");
  console.log("                     MIGRATION AUDIT & VALIDATION REPORT                   ");
  console.log("==========================================================================");
  console.table(auditReport);
  console.log("==========================================================================");

  process.exit(0);
}

runMigration().catch(err => {
  console.error("Migration fatal error:", err);
  process.exit(1);
});
