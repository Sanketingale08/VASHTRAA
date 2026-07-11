import express, { Router, type IRouter, type Request, type Response } from "express";
import { Readable } from "stream";
import { getAuth } from "@clerk/express";
import {
  RequestUploadUrlBody,
  RequestUploadUrlResponse,
} from "@workspace/api-zod";
import { ObjectStorageService, ObjectNotFoundError } from "../lib/objectStorage";
import { ObjectPermission } from "../lib/objectAcl";

const router: IRouter = Router();
const objectStorageService = new ObjectStorageService();

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

function requireAdminKey(req: Request, res: Response, next: any) {
  const adminKey = process.env.ADMIN_API_KEY;
  const provided = (req.headers as any)["x-admin-key"];
  if (!adminKey || !provided || provided !== adminKey) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  next();
}

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
 * POST /seller/upload/product-image
 * Server-side product image upload — receives raw binary body (Content-Type: image/*),
 * writes to the public GCS path, returns the publicly accessible relative path.
 */
router.post(
  "/seller/upload/product-image",
  requireClerkAuth,
  express.raw({ type: "image/*", limit: "10mb" }),
  async (req: Request, res: Response) => {
    try {
      const rawContentType = (req.headers["content-type"] || "image/jpeg").split(";")[0].trim();
      const rawExt = rawContentType.split("/")[1] || "jpg";
      const ext = rawExt === "jpeg" ? "jpg" : ["jpg", "png", "webp", "gif"].includes(rawExt) ? rawExt : "jpg";
      if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
        res.status(400).json({ error: "No image data received" });
        return;
      }
      const { publicRelPath } = await objectStorageService.uploadPublicProductImage(req.body, ext, rawContentType);
      res.json({ publicRelPath });
    } catch (err) {
      req.log.error({ err }, "Failed to upload product image");
      res.status(500).json({ error: "Failed to upload image" });
    }
  },
);

/**
 * POST /seller/upload/pan
 * Dedicated endpoint for PAN card upload — requires Clerk auth (seller).
 */
router.post("/seller/upload/pan", requireClerkAuth, issueUploadUrl);

/**
 * POST /seller/upload/gst
 * Dedicated endpoint for GST certificate upload — requires Clerk auth (seller).
 */
router.post("/seller/upload/gst", requireClerkAuth, issueUploadUrl);

/**
 * GET /storage/public-objects/*
 * Serve public assets unconditionally.
 */
router.get("/storage/public-objects/*filePath", async (req: Request, res: Response) => {
  try {
    const raw = req.params.filePath;
    const filePath = Array.isArray(raw) ? raw.join("/") : raw;
    const file = await objectStorageService.searchPublicObject(filePath);
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
 * GET /admin/storage/signed-url?path=/objects/uploads/xxx
 * Admin-only: generate a short-lived signed GET URL for a private KYC document.
 * Admins cannot attach headers to anchor tags, so we generate a bearer-signed URL instead.
 */
router.get("/admin/storage/signed-url", requireAdminKey, async (req: Request, res: Response) => {
  const objectPath = req.query.path as string;
  if (!objectPath || !objectPath.startsWith("/objects/")) {
    res.status(400).json({ error: "Invalid object path — must start with /objects/" });
    return;
  }
  try {
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
