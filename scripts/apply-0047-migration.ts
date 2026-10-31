import { db, sql } from "@workspace/db";
import fs from "fs";
import path from "path";

async function main() {
  try {
    const candidatePaths = [
      path.resolve(process.cwd(), "lib/db/drizzle/0047_quick_the_call.sql"),
      path.resolve(process.cwd(), "../../lib/db/drizzle/0047_quick_the_call.sql"),
    ];
    const migrationPath = candidatePaths.find(p => fs.existsSync(p));
    if (!migrationPath) {
      throw new Error(`Migration SQL file not found in candidates: ${candidatePaths.join(", ")}`);
    }
    const content = fs.readFileSync(migrationPath, "utf-8");
    const statements = content.split("--> statement-breakpoint").map(s => s.trim()).filter(Boolean);

    for (const stmt of statements) {
      console.log("Executing SQL statement:", stmt);
      await db.execute(sql`${sql.raw(stmt)}`);
    }
    console.log("Migration 0047 applied successfully!");
  } catch (err: any) {
    if (err?.message?.includes("already exists")) {
      console.log("Columns already exist, migration skipping.");
    } else {
      console.error("Migration error:", err);
    }
  }
}

main();
