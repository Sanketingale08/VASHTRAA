import { Router, type IRouter } from "express";
import { isMongoDbConnected } from "@workspace/db";
import { globalCache } from "../lib/cacheEngine";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  const dbOk = isMongoDbConnected();
  const mem = process.memoryUsage();

  const data = {
    status: dbOk ? "ok" : "degraded",
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
    memory: {
      heapUsedMB: Math.round(mem.heapUsed / 1024 / 1024),
      heapTotalMB: Math.round(mem.heapTotal / 1024 / 1024),
      rssMB: Math.round(mem.rss / 1024 / 1024),
    },
    database: {
      engine: "MongoDB Atlas",
      connected: dbOk,
    },
    cache: globalCache.getMetrics(),
  };

  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  res.status(dbOk ? 200 : 503).json(data);
});

export default router;
