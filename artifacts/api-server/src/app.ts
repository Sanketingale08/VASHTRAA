import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import path from "path";
import fs from "fs";
import cookieParser from "cookie-parser";
import { createProxyMiddleware } from "http-proxy-middleware";
import { clerkMiddleware } from "@clerk/express";
import { publishableKeyFromHost } from "@clerk/shared/keys";
import {
  CLERK_PROXY_PATH,
  clerkProxyMiddleware,
  getClerkProxyHost,
} from "./middlewares/clerkProxyMiddleware";
import router from "./routes";
import { maintenanceMode } from "./middlewares/maintenanceMode";
import { logger } from "./lib/logger";

const app: Express = express();

app.set("trust proxy", 1);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());

app.use(cors({ credentials: true, origin: true }));

// Bypass top-level express body parsers for upload endpoints handling raw/multipart streams directly
app.use((req, res, next) => {
  if (req.path.startsWith("/api/admin/upload/")) {
    return next();
  }
  return express.json({
    limit: "25mb",
    verify: (req: any, _res, buf) => {
      req.rawBody = buf;
    },
  })(req, res, (err) => {
    if (err) {
      if (err instanceof SyntaxError && "body" in err) {
        return res.status(400).json({ error: "Invalid JSON payload in request body" });
      }
      return next(err);
    }
    next();
  });
});

app.use((req, res, next) => {
  if (req.path.startsWith("/api/admin/upload/")) {
    return next();
  }
  return express.urlencoded({ extended: true, limit: "25mb" })(req, res, next);
});

app.use(cookieParser());

app.use((req, res, next) => {
  const publicPaths = [
    "/api/seller/register",
    "/api/seller/login",
    "/api/seller/send-verification-code",
    "/api/seller/verify-email",
    "/api/seller/resend-verification-code",
    "/api/auth/login",
    "/api/auth/sign-up",
    "/api/admin/login",
  ];
  if (publicPaths.some((p) => req.path.startsWith(p))) {
    return next();
  }

  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey || secretKey.includes("placeholder")) {
    return next();
  }
  return clerkMiddleware((req) => ({
    publishableKey: publishableKeyFromHost(
      getClerkProxyHost(req) ?? "",
      process.env.CLERK_PUBLISHABLE_KEY,
    ),
  }))(req, res, (err?: any) => {
    if (err) return next();
    next();
  });
});

app.use(maintenanceMode);

// Set strict anti-caching headers on dynamic/private API routes to prevent sensitive data leakage across refreshes / sessions,
// while exempting public cacheable assets (storage/public-objects, catalog listings, categories)
app.use("/api", (req, res, next) => {
  const isPublicCacheablePath =
    req.path.startsWith("/storage/public-objects") ||
    req.path.startsWith("/api/storage/public-objects") ||
    req.path === "/categories" ||
    req.path === "/api/categories" ||
    req.path.startsWith("/hero-banners") ||
    req.path.startsWith("/api/hero-banners") ||
    req.path === "/products" ||
    req.path === "/api/products" ||
    req.path === "/products/facets" ||
    req.path === "/api/products/facets" ||
    req.path === "/products/search-suggestions" ||
    req.path === "/api/products/search-suggestions";

  if (!isPublicCacheablePath) {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
  }
  next();
});

// Alias /storage/public-objects to /api/storage/public-objects for reliable asset serving
app.use("/storage/public-objects", (req, res) => {
  res.redirect(301, `/api/storage/public-objects${req.url}`);
});

// Alias /orders/:orderId/invoice to /api/orders/:orderId/invoice
app.get("/orders/:orderId/invoice", (req, res) => {
  const queryStr = req.url.includes("?") ? req.url.substring(req.url.indexOf("?")) : "";
  res.redirect(307, `/api/orders/${req.params.orderId}/invoice${queryStr}`);
});

app.use("/api", router);

// Global error handler for entity too large (HTTP 413) and malformed payloads across all /api routes
app.use("/api", (err: any, _req: any, res: any, next: any) => {
  if (err?.type === "entity.too.large" || err?.status === 413) {
    return res.status(413).json({
      error: "The uploaded file is too large. Please select an image under 25MB.",
    });
  }
  if (err instanceof SyntaxError && "body" in err && (err as any).status === 400) {
    return res.status(400).json({
      error: "Malformed or invalid request payload.",
    });
  }
  next(err);
});

// Handle non-/api requests by serving built static files or proxying to Vite dev server
const vitePort = process.env.PORT || "3000";
const viteDevUrl = `http://127.0.0.1:${vitePort}`;

const staticDirs = [
  path.resolve(process.cwd(), "artifacts/vastraa/dist/public"),
  path.resolve(import.meta.dirname || __dirname, "../../vastraa/dist/public"),
  path.resolve(process.cwd(), "artifacts/twirldrape/dist/public"),
  path.resolve(import.meta.dirname || __dirname, "../../twirldrape/dist/public"),
  path.resolve(process.cwd(), "dist/public"),
];

function getDistDir(): string | null {
  for (const dir of staticDirs) {
    if (fs.existsSync(dir) && fs.existsSync(path.join(dir, "index.html"))) {
      return dir;
    }
  }
  return null;
}

const distDir = getDistDir();
if (distDir) {
  app.use(express.static(distDir));
}

const viteProxy = createProxyMiddleware({
  target: viteDevUrl,
  changeOrigin: true,
  ws: true,
  on: {
    error: (err, req, res) => {
      const currentDist = getDistDir();
      const isAsset = /\.[a-zA-Z0-9]+$/.test(req.url || "") && !req.url?.endsWith(".html");
      if (currentDist && !isAsset && res && "sendFile" in res) {
        (res as express.Response).sendFile(path.join(currentDist, "index.html"));
        return;
      }
      if (res && "writeHead" in res && !res.headersSent) {
        res.writeHead(503, { "Content-Type": "text/html; charset=utf-8" });
        res.end("<!DOCTYPE html><html><head><meta http-equiv='refresh' content='2'></head><body style='font-family:sans-serif;text-align:center;padding:50px;'><h2>VASTRAA Frontend Initializing...</h2><p>Please wait a moment while the frontend server finishes starting.</p></body></html>");
      }
    },
  },
});

app.use((req, res, next) => {
  if (req.path.startsWith("/api")) {
    return next();
  }

  const currentDist = getDistDir();
  const isAsset = /\.[a-zA-Z0-9]+$/.test(req.path) && !req.path.endsWith(".html");

  if (currentDist && !isAsset && req.accepts("html")) {
    return res.sendFile(path.join(currentDist, "index.html"));
  }

  return viteProxy(req, res, next);
});

export default app;
