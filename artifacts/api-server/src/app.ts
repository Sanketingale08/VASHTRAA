import express, { type Express } from "express";
import cors from "cors";
import pinoHttpDefault, { pinoHttp as pinoHttpNamed } from "pino-http";
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
import { requestCorrelationMiddleware } from "./middleware/requestCorrelation";
import { centralErrorHandler } from "./middleware/errorHandler";

const pinoHttp = (
  typeof pinoHttpDefault === "function"
    ? pinoHttpDefault
    : ((pinoHttpDefault as any)?.default || pinoHttpNamed)
) as typeof pinoHttpNamed;

const app: Express = express();

app.set("trust proxy", 1);
app.use(requestCorrelationMiddleware);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req: any) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res: any) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());

// ── Security Headers (OWASP Production Hardening) ────────────────────────────
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  if (process.env.NODE_ENV === "production") {
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
  next();
});

// ── Hardened CORS ────────────────────────────────────────────────────────────
const allowedOrigins = [
  process.env.FRONTEND_URL,
  "https://vastraasaree.com",
  "https://www.vastraasaree.com",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:5000",
  "http://127.0.0.1:5000",
].filter(Boolean) as string[];

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (process.env.NODE_ENV !== "production") return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      return callback(null, false);
    },
    credentials: true,
  })
);

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

// ── NoSQL Operator Injection Sanitizer ───────────────────────────────────────
function sanitizeMongoOperators(obj: any): any {
  if (!obj || typeof obj !== "object") return obj;
  if (Array.isArray(obj)) {
    return obj.map(sanitizeMongoOperators);
  }
  for (const key of Object.keys(obj)) {
    if (key.startsWith("$")) {
      delete obj[key];
    } else {
      obj[key] = sanitizeMongoOperators(obj[key]);
    }
  }
  return obj;
}

app.use((req, _res, next) => {
  if (req.body && typeof req.body === "object" && !req.path.startsWith("/api/admin/reports")) {
    sanitizeMongoOperators(req.body);
  }
  if (req.query && typeof req.query === "object") {
    sanitizeMongoOperators(req.query);
  }
  next();
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

// Static Logo endpoints for email templates, storefront, and invoices
app.get(["/logo.png", "/images/logo.png", "/api/logo.png", "/api/images/logo.png"], (_req, res) => {
  const candidatePaths = [
    path.resolve(process.cwd(), "public", "images", "logo.png"),
    path.resolve(process.cwd(), "public", "logo.png"),
    path.resolve(process.cwd(), "artifacts", "api-server", "public", "images", "logo.png"),
    path.resolve(process.cwd(), "artifacts", "api-server", "public", "logo.png"),
    path.resolve(process.cwd(), "artifacts", "api-server", "invoice-template", "logo.png"),
    path.resolve(process.cwd(), "artifacts", "vastraa", "public", "images", "logo.png"),
    path.resolve(process.cwd(), "artifacts", "vastraa", "public", "logo.png"),
    path.resolve(process.cwd(), "invoice-template", "logo.png"),
  ];
  for (const p of candidatePaths) {
    if (fs.existsSync(p)) {
      res.setHeader("Content-Type", "image/png");
      res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      return res.sendFile(p);
    }
  }
  return res.status(404).end("Logo not found");
});

app.get(["/logo.svg", "/images/logo.svg", "/api/logo.svg", "/api/images/logo.svg"], (_req, res) => {
  const candidatePaths = [
    path.resolve(process.cwd(), "public", "images", "logo.svg"),
    path.resolve(process.cwd(), "public", "logo.svg"),
    path.resolve(process.cwd(), "artifacts", "api-server", "public", "images", "logo.svg"),
    path.resolve(process.cwd(), "artifacts", "api-server", "public", "logo.svg"),
    path.resolve(process.cwd(), "artifacts", "api-server", "invoice-template", "logo.svg"),
    path.resolve(process.cwd(), "artifacts", "vastraa", "public", "images", "logo.svg"),
    path.resolve(process.cwd(), "artifacts", "vastraa", "public", "logo.svg"),
    path.resolve(process.cwd(), "invoice-template", "logo.svg"),
  ];
  for (const p of candidatePaths) {
    if (fs.existsSync(p)) {
      res.setHeader("Content-Type", "image/svg+xml");
      res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      return res.sendFile(p);
    }
  }
  return res.status(404).end("Logo not found");
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

app.use("/api", centralErrorHandler);

// Handle non-/api requests by serving built static files in production or proxying to Vite dev server in development
const isProduction = process.env.NODE_ENV === "production";
const apiPort = Number(process.env["API_PORT"] || process.env["API_SERVER_PORT"] || "5000");
const rawVitePort = process.env.VITE_PORT || process.env.FRONTEND_PORT || (process.env.PORT && Number(process.env.PORT) !== apiPort ? process.env.PORT : "3000") || "3000";
const vitePort = Number(rawVitePort);
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

// Helper to check if a request path targets a code module, Vite internal, or static asset
function isModuleOrAssetPath(reqPath: string): boolean {
  if (
    reqPath.startsWith("/src/") ||
    reqPath.startsWith("/@") ||
    reqPath.startsWith("/node_modules/") ||
    reqPath.includes("/src/")
  ) {
    return true;
  }
  return /\.[a-zA-Z0-9]+$/.test(reqPath) && !reqPath.endsWith(".html");
}

if (isProduction && distDir) {
  // Production mode: serve built assets from distDir
  app.use(express.static(distDir, {
    index: false,
    immutable: true,
    maxAge: "1d",
  }));

  // Production SPA fallback: return index.html with anti-caching headers for navigation routes
  app.use((req, res, next) => {
    if (req.path.startsWith("/api")) {
      return next();
    }
    // If an asset was requested but not found in dist, return 404, NEVER index.html!
    if (isModuleOrAssetPath(req.path)) {
      return res.status(404).end("Not found");
    }
    if (req.accepts("html")) {
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
      return res.sendFile(path.join(distDir, "index.html"));
    }
    next();
  });
} else {
  // Development mode: proxy ALL non-/api requests to the live Vite dev server
  const viteProxy = createProxyMiddleware({
    target: viteDevUrl,
    changeOrigin: true,
    ws: true,
    on: {
      error: (err, req, res) => {
        const isModule = isModuleOrAssetPath(req.url || "");
        if (isModule && res && "status" in res && "json" in res) {
          // NEVER return index.html for module scripts on proxy failure!
          (res as express.Response).status(503).json({
            error: "Vite dev server is compiling or unavailable. Please retry in a moment.",
          });
          return;
        }
        if (res && "writeHead" in res && !res.headersSent) {
          res.writeHead(503, { "Content-Type": "text/html; charset=utf-8" });
          res.end(
            "<!DOCTYPE html><html><head><meta http-equiv='refresh' content='2'></head><body style='font-family:sans-serif;text-align:center;padding:50px;'><h2>VASTRAA Frontend Initializing...</h2><p>Please wait a moment while the frontend server finishes starting.</p></body></html>"
          );
        }
      },
    },
  });

  app.use((req, res, next) => {
    if (req.path.startsWith("/api")) {
      return next();
    }
    return viteProxy(req, res, next);
  });
}


export default app;
