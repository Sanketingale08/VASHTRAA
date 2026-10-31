import { db, sql } from "@workspace/db";

async function check() {
  try {
    const res = await db.execute(sql`SELECT nextval('order_id_seq') AS seq`);
    console.log("seqResult type:", typeof res, Array.isArray(res) ? "array" : "object");
    console.log("seqResult keys/content:", JSON.stringify(res));
  } catch (err) {
    console.error("Sequence query error:", err);
  }
  process.exit(0);
}

check();
