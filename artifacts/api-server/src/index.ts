import app from "./app";
import { logger } from "./lib/logger";
import { startEmailOutboxWorker } from "./lib/transactionalEmail";
import { deleteExpiredRegistrationDrafts } from "./routes/sellerRegistrationDraft";
import { bootstrapDatabase } from "./lib/bootstrapDatabase";

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
