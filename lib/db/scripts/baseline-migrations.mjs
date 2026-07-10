/**
 * Baseline `drizzle.__drizzle_migrations` against `drizzle/meta/_journal.json`.
 *
 * Historically this database's schema was evolved with `drizzle-kit push`,
 * which applies schema changes directly without recording them in the
 * migrations tracking table. That left `__drizzle_migrations` empty while
 * the schema already matched every migration file on disk. Running
 * `drizzle-kit migrate` in that state re-applies migration 0000 from
 * scratch and fails on "relation already exists" (drizzle-kit swallows the
 * error and just exits 1 with no message).
 *
 * This script inserts one row per journal entry using the exact same
 * sha256(fileContents) hash and `when` timestamp that drizzle-orm's migrator
 * computes internally, so `drizzle-kit migrate` treats already-applied
 * migrations as applied and only runs genuinely new ones going forward.
 *
 * Safe to re-run: it skips any hash that is already recorded.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const drizzleDir = path.join(__dirname, "..", "drizzle");

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL, ensure the database is provisioned");
  }

  const journalPath = path.join(drizzleDir, "meta", "_journal.json");
  const journal = JSON.parse(readFileSync(journalPath, "utf8"));

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  try {
    await client.query("CREATE SCHEMA IF NOT EXISTS drizzle");
    await client.query(
      "CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (id SERIAL PRIMARY KEY, hash text NOT NULL, created_at bigint)",
    );

    const existing = await client.query(
      "SELECT hash FROM drizzle.__drizzle_migrations",
    );
    const existingHashes = new Set(existing.rows.map((r) => r.hash));

    for (const entry of journal.entries) {
      const sqlPath = path.join(drizzleDir, `${entry.tag}.sql`);
      const sql = readFileSync(sqlPath, "utf8");
      const hash = createHash("sha256").update(sql).digest("hex");

      if (existingHashes.has(hash)) {
        console.log(`skip (already recorded): ${entry.tag}`);
        continue;
      }

      await client.query(
        "INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ($1, $2)",
        [hash, entry.when],
      );
      console.log(`baselined: ${entry.tag}`);
    }
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
