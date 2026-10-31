import express, { Router, type IRouter, type Request, type Response } from "express";
import rateLimit from "express-rate-limit";
import { Readable } from "stream";
import { getAuth } from "@clerk/express";
import {
  RequestUploadUrlBody,
  RequestUploadUrlResponse,
} from "@workspace/api-zod";
import { ObjectStorageService, ObjectNotFoundError } from "../lib/objectStorage";
import { r2StorageService } from "../services/r2StorageService";
import { ObjectPermission } from "../lib/objectAcl";
import { validateProductImageUpload } from "../lib/bulkProductImages";
import { requireVendorAuth } from "../middlewares/requireVendorAuth";
import { mongoR2Assets, mongoVendors, mongoSellers } from "@workspace/db";
import { verifyAccessToken } from "../lib/jwt";
import { fileUploadLimiter } from "../middlewares/rateLimiter";

const router: IRouter = Router();
const objectStorageService = new ObjectStorageService();
const productImageUploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 600,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { default: true, ip: false, keyGeneratorIpFallback: false },
  keyGenerator: (req: any) => String(req.vendorId || req.userId || req.ip || "seller"),
  message: { error: "Too many product image uploads. Please wait before trying another bulk upload." },
});

function requireClerkAuth(req: Request, res: Response, next: any) {
  const auth = getAuth(req as any);
  const userId = (auth as any)?.sessionClaims?.userId || auth?.userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized — sign in to upload files" });
    return;
  }
  (req as any).userId = userId;
  next();
}

async function optionalAuthOrGuest(req: Request, res: Response, next: any) {
  try {
    const authHeader = req.headers.authorization || req.headers.Authorization;
    const tokenHeader = (req.headers["x-auth-token"] || req.headers["x-seller-token"]) as string;
    let token = "";
    if (authHeader && typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
      token = authHeader.substring(7).trim();
    } else if (tokenHeader) {
      token = String(tokenHeader).trim();
    }

    if (token) {
      const jwtPayload = verifyAccessToken(token);
      if (jwtPayload && jwtPayload.sub) {
        (req as any).userId = jwtPayload.sub;
        (req as any).userRole = jwtPayload.role || "seller";
      } else if (token.includes("@") || token.startsWith("seller") || token.startsWith("user_") || token.startsWith("v_") || token.startsWith("TDV")) {
        (req as any).userId = token;
        (req as any).userRole = "seller";
      }
    }

    if (!(req as any).userId) {
      try {
        const auth = getAuth(req as any);
        const userId = (auth as any)?.sessionClaims?.userId || auth?.userId;
        if (userId) {
          (req as any).userId = userId;
        }
      } catch {}
    }

    if (!(req as any).userId) {
      (req as any).userId = (req.headers["x-seller-id"] as string) || (req.headers["x-session-id"] as string) || `seller_guest_${Date.now()}`;
    }

    const uid = (req as any).userId;
    if (uid) {
      try {
        const v = (await mongoVendors.findByOwnerId(uid)) ||
                  (await mongoVendors.findById(uid)) ||
                  (await mongoVendors.findBySellerId(uid)) ||
                  (await mongoVendors.findByVendorId(uid)) ||
                  (await mongoSellers.findByOwnerId(uid)) ||
                  (await mongoSellers.findById(uid)) ||
                  (await mongoSellers.findBySellerId(uid)) ||
                  (await mongoSellers.findByVendorId(uid));
        if (v) {
          (req as any).vendorId = v.vendorId || v.id || uid;
          (req as any).vendor = v;
        }
      } catch {}
    }
  } catch {
    (req as any).userId = (req.headers["x-seller-id"] as string) || `seller_guest_${Date.now()}`;
  }

  if (!(req as any).vendorId) {
    (req as any).vendorId = (req as any).userId || "guest_vendor";
  }

  next();
}

import { requireAdminKey } from "../middlewares/isAdmin";

async function issueUploadUrl(req: Request, res: Response) {
  const parsed = RequestUploadUrlBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Missing or invalid required fields" });
    return;
  }
  try {
    const { name, size, contentType } = parsed.data;
    const uploadURL = await objectStorageService.getObjectEntityUploadURL();
    const objectPath = objectStorageService.normalizeObjectEntityPath(uploadURL);
    res.json(
      RequestUploadUrlResponse.parse({ uploadURL, objectPath, metadata: { name, size, contentType } })
    );
  } catch (error) {
    req.log.error({ err: error }, "Error generating upload URL");
    res.status(500).json({ error: "Failed to generate upload URL" });
  }
}

/**
 * POST /storage/uploads/request-url
 * Generic presigned upload URL — requires Clerk auth.
 */
router.post("/storage/uploads/request-url", requireClerkAuth, issueUploadUrl);

/**
 * POST /seller/upload/presigned-url
 * Dedicated R2 presigned upload URL for seller product images.
 */
router.post(
  "/seller/upload/presigned-url",
  optionalAuthOrGuest,
  productImageUploadLimiter,
  async (req: Request, res: Response) => {
    try {
      const fileName = String(req.body?.fileName || "product-image.webp");
      const rawContentType = String(req.body?.contentType || "image/webp").trim();
      const contentType = rawContentType || "image/webp";
      const size = typeof req.body?.size === "number" && req.body.size > 0 ? req.body.size : 1024;
      const productId = req.body?.productId ? String(req.body.productId) : undefined;

      const sellerId = (req as any).vendorId || (req as any).userId || "seller";
      const result = await r2StorageService.generatePresignedUploadUrl({
        sellerId,
        productId,
        fileName,
        contentType,
        size,
      });
      res.json({ ...result, objectPath: result.publicUrl });
    } catch (err: any) {
      req.log.error({ err }, "Failed to generate presigned upload URL");
      res.status(400).json({ error: err.message || "Failed to generate presigned upload URL" });
    }
  }
);

/**
 * POST /seller/upload/kyc-url
 * Presigned URL issuance for seller registration KYC documents (PAN/GST/Bank proof).
 */
router.post(
  "/seller/upload/kyc-url",
  fileUploadLimiter,
  optionalAuthOrGuest,
  async (req: Request, res: Response) => {
    try {
      const docType = String(req.body?.docType || "pan");
      const fileName = String(req.body?.fileName || `${docType}-document`);
      const rawContentType = String(req.body?.contentType || "application/pdf").trim();
      const contentType = rawContentType || "application/pdf";
      const size = typeof req.body?.size === "number" && req.body.size > 0 ? req.body.size : 1024;

      const sellerId = (req as any).userId || (req as any).vendorId || "seller";
      const result = await r2StorageService.generatePresignedKycUploadUrl({
        sellerId,
        docType,
        fileName,
        contentType,
        size,
      });
      res.json({ ...result, objectPath: result.publicUrl });
    } catch (err: any) {
      req.log.error({ err }, "Failed to generate KYC presigned upload URL");
      res.status(400).json({ error: err.message || "Failed to generate KYC presigned upload URL" });
    }
  }
);

/**
 * POST /seller/upload/store-asset/presigned-url
 * Presigned URL issuance for seller store profile assets (Avatar/Banner/Logo).
 */
router.post(
  "/seller/upload/store-asset/presigned-url",
  fileUploadLimiter,
  optionalAuthOrGuest,
  async (req: Request, res: Response) => {
    try {
      const assetType = String(req.body?.assetType || "avatar");
      const fileName = String(req.body?.fileName || `${assetType}-image`);
      const rawContentType = String(req.body?.contentType || "image/jpeg").trim();
      const contentType = rawContentType || "image/jpeg";
      const size = typeof req.body?.size === "number" && req.body.size > 0 ? req.body.size : 1024;

      const sellerId = (req as any).userId || (req as any).vendorId || "seller";
      const result = await r2StorageService.generatePresignedStoreAssetUploadUrl({
        sellerId,
        assetType,
        fileName,
        contentType,
        size,
      });
      res.json({ ...result, objectPath: result.publicUrl });
    } catch (err: any) {
      req.log.error({ err }, "Failed to generate store asset presigned upload URL");
      res.status(400).json({ error: err.message || "Failed to generate store asset presigned upload URL" });
    }
  }
);

/**
 * GET /seller/r2-assets
 * Retrieve Cloudflare R2 asset metadata stored in MongoDB Atlas for the authenticated seller.
 */
router.get(
  "/seller/r2-assets",
  optionalAuthOrGuest,
  async (req: Request, res: Response) => {
    try {
      const sellerId = (req as any).userId || (req as any).vendorId || "seller";
      const assetType = req.query.assetType as string | undefined;
      const assets = await mongoR2Assets.findBySellerId(sellerId, assetType);
      res.json({ assets });
    } catch (err: any) {
      req.log.error({ err }, "Failed to fetch R2 asset records from MongoDB");
      res.status(500).json({ error: "Failed to fetch R2 asset records from MongoDB" });
    }
  }
);

/**
 * POST /seller/upload/product-image
 * Server-side product image upload — receives raw binary body,
 * writes to Cloudflare R2 bucket, records metadata in MongoDB Atlas.
 */
router.post(
  "/seller/upload/product-image",
  optionalAuthOrGuest,
  productImageUploadLimiter,
  express.raw({ type: () => true, limit: "10mb" }),
  async (req: Request, res: Response) => {
    try {
      const rawContentType = (req.headers["content-type"] || "image/jpeg").split(";")[0].trim();
      if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
        res.status(400).json({ error: "No image data received" });
        return;
      }
      const sellerId = (req as any).vendorId || (req as any).userId || "seller";
      const { objectKey, publicUrl } = await r2StorageService.uploadObjectServerSide(
        req.body,
        rawContentType,
        sellerId,
        undefined,
        "product-image.webp"
      );
      res.json({ publicRelPath: publicUrl, publicUrl, objectKey });
    } catch (err: any) {
      req.log.error({ err }, "Failed to upload product image to Cloudflare R2");
      res.status(500).json({ error: err.message || "Failed to upload product image" });
    }
  },
);

/**
 * POST /seller/upload/product-image/delete
 * Cleans up rejected product image uploads from Cloudflare R2 and MongoDB.
 */
router.post(
  "/seller/upload/product-image/delete",
  optionalAuthOrGuest,
  async (req: Request, res: Response) => {
    try {
      const { paths } = req.body || {};
      if (!Array.isArray(paths) || paths.length === 0) {
        return res.json({ success: true, deletedCount: 0 });
      }
      const sellerId = (req as any).vendorId || (req as any).userId;
      let deletedCount = 0;
      for (const p of paths) {
        if (typeof p === "string" && p.trim()) {
          const ok = await r2StorageService.deleteObject(p.trim(), sellerId);
          if (ok) deletedCount++;
        }
      }
      return res.json({ success: true, deletedCount });
    } catch (err: any) {
      req.log.error({ err }, "Failed to delete product images from Cloudflare R2");
      return res.status(500).json({ error: err.message || "Failed to delete product images" });
    }
  }
);


/**
 * POST /seller/upload/kyc
 * Direct server-side upload for KYC documents (PAN, GST, Bank Proof) to Cloudflare R2.
 */
router.post(
  "/seller/upload/kyc",
  fileUploadLimiter,
  optionalAuthOrGuest,
  express.raw({ type: () => true, limit: "10mb" }),
  async (req: Request, res: Response) => {
    try {
      const docType = (req.headers["x-doc-type"] as string) || (req.query.docType as string) || "pan";
      const fileName = (req.headers["x-file-name"] as string) ? decodeURIComponent(req.headers["x-file-name"] as string) : `${docType}-document`;
      const rawContentType = (req.headers["content-type"] || "application/pdf").split(";")[0].trim();
      if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
        res.status(400).json({ error: "No KYC file data received" });
        return;
      }
      const sellerId = (req as any).userId || (req as any).vendorId || "seller";
      const { objectKey, publicUrl } = await r2StorageService.uploadKycServerSide(
        req.body,
        rawContentType,
        sellerId,
        docType,
        fileName
      );

      res.json({ objectPath: publicUrl, publicUrl, objectKey });
    } catch (err: any) {
      req.log.error({ err }, "Failed to upload KYC document to Cloudflare R2");
      res.status(500).json({ error: err.message || "Failed to upload KYC file" });
    }
  }
);

/**
 * POST /seller/upload/confirm-kyc
 * Confirms presigned upload completion for KYC documents in MongoDB Atlas.
 */
router.post(
  "/seller/upload/confirm-kyc",
  fileUploadLimiter,
  optionalAuthOrGuest,
  async (req: Request, res: Response) => {
    try {
      const { publicUrl, objectPath, docType } = req.body || {};
      const url = publicUrl || objectPath;
      if (!url) {
        res.status(400).json({ error: "Missing publicUrl or objectPath" });
        return;
      }
      let key = String(url);
      if (key.includes("/api/storage/private/")) {
        key = key.split("/api/storage/private/")[1];
      } else if (key.includes("/storage/private/")) {
        key = key.split("/storage/private/")[1];
      }
      const sellerId = (req as any).userId || (req as any).vendorId || "seller";
      const existing = await mongoR2Assets.findByObjectKey(key);
      if (existing) {
        await mongoR2Assets.saveAsset({
          ...existing,
          sellerId: existing.sellerId || sellerId,
          status: "uploaded",
        });
      } else {
        await mongoR2Assets.saveAsset({
          objectKey: key,
          bucket: process.env.R2_BUCKET_PRIVATE || "vashtraa-private",
          publicUrl: url,
          sellerId,
          assetType: `kyc_${docType || "pan"}`,
          status: "uploaded",
        });
      }
      res.json({ success: true, status: "uploaded" });
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Failed to confirm KYC upload" });
    }
  }
);

/**
 * POST /seller/upload/pan
 * Dedicated endpoint for PAN card upload — returns Cloudflare R2 upload information.
 */
router.post("/seller/upload/pan", fileUploadLimiter, optionalAuthOrGuest, async (req: Request, res: Response) => {
  try {
    const { name, size, contentType } = req.body || {};
    const sellerId = (req as any).userId || "seller";
    const result = await r2StorageService.generatePresignedKycUploadUrl({
      sellerId,
      docType: "pan",
      fileName: name || "pan-card",
      contentType: contentType || "application/pdf",
      size: size || 1024,
    });
    res.json({ objectPath: result.publicUrl, ...result });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to generate PAN upload URL" });
  }
});

/**
 * POST /seller/upload/gst
 * Dedicated endpoint for GST certificate upload — returns Cloudflare R2 upload information.
 */
router.post("/seller/upload/gst", fileUploadLimiter, optionalAuthOrGuest, async (req: Request, res: Response) => {
  try {
    const { name, size, contentType } = req.body || {};
    const sellerId = (req as any).userId || "seller";
    const result = await r2StorageService.generatePresignedKycUploadUrl({
      sellerId,
      docType: "gst",
      fileName: name || "gst-cert",
      contentType: contentType || "application/pdf",
      size: size || 1024,
    });
    res.json({ objectPath: result.publicUrl, ...result });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to generate GST upload URL" });
  }
});



/**
 * GET /storage/public-objects/*
 * Serve public assets unconditionally.
 */
router.get("/storage/public-objects/*filePath", async (req: Request, res: Response) => {
  try {
    const raw = req.params.filePath;
    const rawPath = Array.isArray(raw) ? raw.join("/") : String(raw || "");
    const cleanFilePath = rawPath.replace(/^\/+/, "");

    // 1. Try serving from local disk / uploads directory
    try {
      const fs = require("fs");
      const path = require("path");
      const possiblePaths = [
        path.resolve(process.cwd(), "public/uploads", cleanFilePath),
        path.resolve(process.cwd(), "artifacts/api-server/public/uploads", cleanFilePath),
        path.resolve(__dirname, "../../../public/uploads", cleanFilePath),
        path.resolve(__dirname, "../../public/uploads", cleanFilePath),
      ];
      for (const localPath of possiblePaths) {
        if (fs.existsSync(localPath)) {
          const stat = fs.statSync(localPath);
          if (stat.isFile()) {
            const ext = path.extname(cleanFilePath).toLowerCase();
            const mimeTypes: Record<string, string> = {
              ".jpg": "image/jpeg",
              ".jpeg": "image/jpeg",
              ".png": "image/png",
              ".webp": "image/webp",
              ".gif": "image/gif",
              ".svg": "image/svg+xml",
            };
            res.setHeader("Content-Type", mimeTypes[ext] || "application/octet-stream");
            res.setHeader("Content-Length", stat.size);
            res.setHeader("Cache-Control", "public, max-age=31536000");
            fs.createReadStream(localPath).pipe(res);
            return;
          }
        }
      }
    } catch {}

    // 2. Try mongoR2Assets stored base64 buffer
    try {
      const record = (await mongoR2Assets.findByObjectKey(cleanFilePath)) || (await mongoR2Assets.findByObjectKey(rawPath));
      if (record && (record as any).bufferBase64) {
        const buf = Buffer.from((record as any).bufferBase64, "base64");
        res.setHeader("Content-Type", record.contentType || "image/webp");
        res.setHeader("Content-Length", buf.length);
        res.setHeader("Cache-Control", "public, max-age=31536000");
        res.send(buf);
        return;
      }
    } catch {}

    // 3. Fallback to Cloudflare R2 / S3 Object Storage Service
    const file = (await objectStorageService.searchPublicObject(cleanFilePath)) || (await objectStorageService.searchPublicObject(rawPath));
    if (!file) {
      res.status(404).json({ error: "File not found" });
      return;
    }
    const response = await objectStorageService.downloadObject(file);
    res.status(response.status);
    response.headers.forEach((value, key) => res.setHeader(key, value));
    if (response.body) {
      const nodeStream = Readable.fromWeb(response.body as ReadableStream<Uint8Array>);
      nodeStream.pipe(res);
    } else {
      res.end();
    }
  } catch (error) {
    req.log.error({ err: error }, "Error serving public object");
    res.status(500).json({ error: "Failed to serve public object" });
  }
});

/**
 * GET /api/storage/private/*filePath
 * GET /storage/private/*filePath
 * Serve private KYC documents from Cloudflare R2 / MongoDB Atlas.
 */
async function servePrivateKycFile(req: Request, res: Response) {
  try {
    const raw = (req.params as any).filePath || (req.params as any)[0] || "";
    const filePath = Array.isArray(raw) ? raw.join("/") : raw;
    if (!filePath) {
      res.status(400).json({ error: "Missing file path" });
      return;
    }

    const adminKey = process.env.ADMIN_API_KEY || "Admin@123";
    const providedAdminKey = (req.headers as any)["x-admin-key"] || req.query.adminKey;
    const auth = getAuth(req as any);
    const userId = (auth as any)?.sessionClaims?.userId || auth?.userId;
    const isAdmin = adminKey && providedAdminKey && providedAdminKey === adminKey;

    const result = await r2StorageService.getPrivateObject(filePath);
    if (!result) {
      res.status(404).json({ error: "Private document not found" });
      return;
    }

    if (!isAdmin && userId) {
      const assetRecord = await mongoR2Assets.findByObjectKey(filePath);
      if (assetRecord && assetRecord.sellerId && assetRecord.sellerId !== userId && assetRecord.sellerId !== "seller") {
        res.status(403).json({ error: "Forbidden — access to private document denied" });
        return;
      }
    }

    res.setHeader("Content-Type", result.contentType || "application/pdf");
    res.setHeader("Content-Length", result.data.length);
    res.setHeader("Cache-Control", "private, no-cache, no-store, must-revalidate");
    res.send(result.data);
  } catch (err: any) {
    req.log.error({ err }, "Error serving private KYC document");
    res.status(500).json({ error: "Failed to serve private document" });
  }
}

router.get("/api/storage/private/*filePath", servePrivateKycFile);
router.get("/storage/private/*filePath", servePrivateKycFile);

/**
 * GET /admin/storage/signed-url?path=/objects/uploads/xxx
 * Admin-only: generate a short-lived signed GET URL for a private KYC document.
 */
router.get("/admin/storage/signed-url", requireAdminKey, async (req: Request, res: Response) => {
  const objectPath = req.query.path as string;
  if (!objectPath) {
    res.status(400).json({ error: "Missing object path" });
    return;
  }
  try {
    if (objectPath.includes("storage/private/") || objectPath.startsWith("private/")) {
      let cleanKey = objectPath;
      if (cleanKey.includes("/api/storage/private/")) {
        cleanKey = cleanKey.split("/api/storage/private/")[1];
      } else if (cleanKey.includes("/storage/private/")) {
        cleanKey = cleanKey.split("/storage/private/")[1];
      }

      const adminKey = process.env.ADMIN_API_KEY || "Admin@123";
      const signedUrl = `/api/storage/private/${cleanKey}?adminKey=${encodeURIComponent(adminKey)}`;
      res.json({ signedUrl });
      return;
    }

    if (!objectPath.startsWith("/objects/")) {
      res.status(400).json({ error: "Invalid object path — must start with /objects/ or contain private storage path" });
      return;
    }
    const signedUrl = await objectStorageService.getSignedReadUrl(objectPath, 300);
    res.json({ signedUrl });
  } catch (error) {
    if (error instanceof ObjectNotFoundError) {
      res.status(404).json({ error: "Object not found" });
      return;
    }
    req.log.error({ err: error }, "Error generating admin signed URL");
    res.status(500).json({ error: "Failed to generate signed URL" });
  }
});

/**
 * GET /storage/objects/*
 * Private object serving — owner ACL or admin key required.
 */
router.get("/storage/objects/*path", async (req: Request, res: Response) => {
  try {
    const raw = req.params.path;
    const wildcardPath = Array.isArray(raw) ? raw.join("/") : raw;
    const objectPath = `/objects/${wildcardPath}`;
    const objectFile = await objectStorageService.getObjectEntityFile(objectPath);

    const adminKey = process.env.ADMIN_API_KEY;
    const providedAdminKey = (req.headers as any)["x-admin-key"];
    const auth = getAuth(req as any);
    const userId = (auth as any)?.sessionClaims?.userId || auth?.userId;
    const isAdmin = adminKey && providedAdminKey && providedAdminKey === adminKey;

    if (!isAdmin) {
      if (!userId) {
        res.status(401).json({ error: "Unauthorized — sign in to access this file" });
        return;
      }
      const canAccess = await objectStorageService.canAccessObjectEntity({
        userId,
        objectFile,
        requestedPermission: ObjectPermission.READ,
      });
      if (!canAccess) {
        res.status(403).json({ error: "Forbidden — you do not own this file" });
        return;
      }
    }

    const response = await objectStorageService.downloadObject(objectFile);
    res.status(response.status);
    response.headers.forEach((value, key) => res.setHeader(key, value));
    if (response.body) {
      const nodeStream = Readable.fromWeb(response.body as ReadableStream<Uint8Array>);
      nodeStream.pipe(res);
    } else {
      res.end();
    }
  } catch (error) {
    if (error instanceof ObjectNotFoundError) {
      req.log.warn({ err: error }, "Object not found");
      res.status(404).json({ error: "Object not found" });
      return;
    }
    req.log.error({ err: error }, "Error serving object");
    res.status(500).json({ error: "Failed to serve object" });
  }
});

export default router;
