import app from "./app";
import { logger } from "./lib/logger";
import { deleteExpiredRegistrationDrafts } from "./routes/sellerRegistrationDraft";
import { bootstrapDatabase } from "./lib/bootstrapDatabase";
import { startEmailOutboxWorker, startSellerRegistrationNudgeWorker } from "./lib/transactionalEmail";
import { startWeeklyAdminReportWorker } from "./workers/weeklyAdminReport";
import { db } from "@workspace/db";
import { productsTable } from "@workspace/db";
import { eq, and, isNotNull, lt, sql } from "drizzle-orm";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

bootstrapDatabase()
  .then(() => {
    app.listen(port, (err) => {
      if (err) {
        logger.error({ err }, "Error listening on port");
        process.exit(1);
      }

      logger.info({ port }, "Server listening");
      startEmailOutboxWorker();
      startDraftExpiryWorker();
      startSellerRegistrationNudgeWorker();
      startFeaturedExpiryWorker();
      startWeeklyAdminReportWorker();
    });
  })
  .catch((err) => {
    logger.error({ err }, "Database bootstrap failed — server will not start");
    process.exit(1);
  });

function startDraftExpiryWorker(): void {
  const INTERVAL_MS = 60 * 60 * 1000; // run every hour

  async function run() {
    try {
      const count = await deleteExpiredRegistrationDrafts();
      if (count > 0) {
        logger.info({ count }, "Deleted expired seller registration drafts");
      }
    } catch (err) {
      logger.error({ err }, "Failed to delete expired seller registration drafts");
    }
  }

  // Run once at startup, then on a recurring interval
  run();
  setInterval(run, INTERVAL_MS).unref();
}

function startFeaturedExpiryWorker(): void {
  const INTERVAL_MS = 60 * 60 * 1000; // run every hour

  async function run() {
    try {
      const result = await db
        .update(productsTable)
        .set({ isFeatured: false })
        .where(
          and(
            eq(productsTable.isFeatured, true),
            isNotNull(productsTable.featuredUntil),
            lt(productsTable.featuredUntil, sql`NOW()`)
          )
        )
        .returning({ id: productsTable.id });
      if (result.length > 0) {
        logger.info({ count: result.length }, "Unfeatured expired featured products");
      }
    } catch (err) {
      logger.error({ err }, "Failed to unfeature expired featured products");
    }
  }

  // Run once at startup, then on a recurring interval
  run();
  setInterval(run, INTERVAL_MS).unref();
}
