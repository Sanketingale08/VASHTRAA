import { pool } from "@workspace/db";
import { logger } from "./logger";

/**
 * Creates database objects that are not managed by Drizzle's schema
 * (e.g. sequences used for custom ID generation).
 * Safe to run on every startup — all statements use IF NOT EXISTS.
 */
export async function bootstrapDatabase(): Promise<void> {
  try {
    await pool.query(`
      CREATE SEQUENCE IF NOT EXISTS order_id_seq
        START WITH 100001 INCREMENT BY 1
        NO MINVALUE NO MAXVALUE CACHE 1;

      CREATE SEQUENCE IF NOT EXISTS product_id_seq
        START WITH 100001 INCREMENT BY 1
        NO MINVALUE NO MAXVALUE CACHE 1;
    `);
    logger.info("Database sequences verified/created (order_id_seq, product_id_seq)");
  } catch (err) {
    logger.error({ err }, "Failed to bootstrap database sequences");
    throw err; // prevent server from starting with broken ID generation
  }
}
