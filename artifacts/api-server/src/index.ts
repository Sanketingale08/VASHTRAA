import app from "./app";
import { logger } from "./lib/logger";
import { deleteExpiredRegistrationDrafts } from "./routes/sellerRegistrationDraft";
import { bootstrapDatabase } from "./lib/bootstrapDatabase";
import { startEmailOutboxWorker, startSellerRegistrationNudgeWorker } from "./lib/transactionalEmail";
import { startWeeklyAdminReportWorker } from "./workers/weeklyAdminReport";
import { db } from "@workspace/db";
import { productsTable } from "@workspace/db";
import { eq, and, isNotNull, lt, sql } from "@workspace/db";

import path from "path";
import fs from "fs";

const possibleEnvPaths = [
  path.resolve(process.cwd(), ".env"),
  path.resolve(import.meta.dirname || __dirname, "../../../.env"),
  path.resolve(import.meta.dirname || __dirname, "../../.env"),
];
for (const envPath of possibleEnvPaths) {
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, "utf-8");
    for (const line of envContent.split("\n")) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith("#") && trimmed.includes("=")) {
        const idx = trimmed.indexOf("=");
        const key = trimmed.slice(0, idx).trim();
        const val = trimmed.slice(idx + 1).trim();
        if (val) {
          process.env[key] = val;
        }
      }
    }
    break;
  }
}

import http from "http";
import { initSocketIO } from "./lib/socket";

const rawPort = process.env["API_PORT"] || process.env["API_SERVER_PORT"] || process.env["PORT"] || "5000";
const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid API PORT value: "${rawPort}"`);
}

const server = http.createServer(app);
initSocketIO(server);

server.listen(port, "0.0.0.0", () => {
  logger.info({ port }, "Server listening on port " + port + " with Real-Time Socket.IO");

  bootstrapDatabase()
    .then(() => {
      logger.info("Database bootstrap completed successfully.");
    })
    .catch((bootstrapErr) => {
      logger.warn({ err: bootstrapErr }, "Database bootstrap notice — server running in fallback mode");
    });

  startEmailOutboxWorker();
  startDraftExpiryWorker();
  startSellerRegistrationNudgeWorker();
  startFeaturedExpiryWorker();
  startWeeklyAdminReportWorker();
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

// ── Graceful Shutdown Handling ───────────────────────────────────────────────
function setupGracefulShutdown(): void {
  let isShuttingDown = false;

  const shutdown = (signal: string) => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    logger.info({ signal }, `Received ${signal}. Starting graceful shutdown...`);

    const forceTimer = setTimeout(() => {
      logger.error("Forced shutdown after timeout expiration.");
      process.exit(1);
    }, 10_000);
    forceTimer.unref();

    server.close((err) => {
      clearTimeout(forceTimer);
      if (err) {
        logger.error({ err }, "Error closing HTTP server during shutdown");
        process.exit(1);
      }
      logger.info("HTTP server closed cleanly. Exiting process.");
      process.exit(0);
    });
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

setupGracefulShutdown();

