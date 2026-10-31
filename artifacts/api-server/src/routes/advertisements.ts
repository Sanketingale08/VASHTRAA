import { Router } from "express";
import express from "express";
import crypto from "crypto";
import { mongoGeneric, isMongoDbConnected } from "@workspace/db";
import type { AdvertisementDoc } from "@workspace/db";
import { ObjectStorageService } from "../lib/objectStorage";
import { requireAdminKey } from "../middlewares/isAdmin";

const router: Router = Router();
const objectStorageService = new ObjectStorageService();

// In-memory cache/fallback for resilient execution & unit testing
export const inMemoryAdvertisements = new Map<string, AdvertisementDoc>();

/**
 * Computes advertisement status based on current time and dates.
 */
export function computeAdvertisementStatus(ad: {
  isActive: boolean;
  startDate?: string | Date | null;
  endDate?: string | Date | null;
}): "active" | "scheduled" | "expired" | "inactive" {
  if (!ad.isActive) return "inactive";
  const now = new Date();
  if (ad.startDate && new Date(ad.startDate) > now) return "scheduled";
  if (ad.endDate && new Date(ad.endDate) < now) return "expired";
  return "active";
}

/**
 * Checks if an advertisement is currently visible on the public storefront.
 */
export function isAdvertisementActiveNow(ad: {
  isActive: boolean;
  startDate?: string | Date | null;
  endDate?: string | Date | null;
}): boolean {
  return computeAdvertisementStatus(ad) === "active";
}

/**
 * GET /api/advertisements — Public
 * Returns only currently active, non-expired advertisements sorted by displayOrder ASC.
 */
router.get("/advertisements", async (_req, res) => {
  try {
    let ads: AdvertisementDoc[] = [];

    if (isMongoDbConnected()) {
      try {
        const col = mongoGeneric.getCollection<AdvertisementDoc>("advertisements");
        ads = await col.find({ isActive: true }).sort({ displayOrder: 1, createdAt: -1 }).toArray();
      } catch (mongoErr) {
        console.warn("[Advertisements API] Mongo query failed, using in-memory fallback:", mongoErr);
      }
    }

    // Merge in-memory entries (for tests / offline fallback)
    for (const [id, memAd] of inMemoryAdvertisements.entries()) {
      if (memAd.isActive && !ads.some((a) => a.id === id)) {
        ads.push(memAd);
      }
    }

    const activeDocs = ads
      .filter(isAdvertisementActiveNow)
      .sort((a, b) => a.displayOrder - b.displayOrder)
      .map((ad) => ({
        ...ad,
        imageUrl: ad.imageUrl.startsWith("advertisements/")
          ? `/api/storage/public-objects/${ad.imageUrl}`
          : ad.imageUrl,
      }));

    return res.json(activeDocs);
  } catch (err: any) {
    console.error("[Advertisements API] Failed to fetch advertisements:", err);
    return res.status(500).json({ error: "Failed to fetch advertisements" });
  }
});

/**
 * GET /api/admin/advertisements — Admin
 * Returns all advertisements (active, scheduled, expired, inactive) with computed status.
 */
router.get("/admin/advertisements", requireAdminKey, async (_req, res) => {
  try {
    let ads: AdvertisementDoc[] = [];

    if (isMongoDbConnected()) {
      try {
        const col = mongoGeneric.getCollection<AdvertisementDoc>("advertisements");
        ads = await col.find({}).sort({ displayOrder: 1, createdAt: -1 }).toArray();
      } catch (mongoErr) {
        console.warn("[Advertisements API] Mongo fetch all failed, using in-memory:", mongoErr);
      }
    }

    // Merge in-memory entries
    for (const [id, memAd] of inMemoryAdvertisements.entries()) {
      if (!ads.some((a) => a.id === id)) {
        ads.push(memAd);
      }
    }

    ads.sort((a, b) => a.displayOrder - b.displayOrder);

    const adsWithStatus = ads.map((ad) => ({
      ...ad,
      imageUrl: ad.imageUrl.startsWith("advertisements/")
        ? `/api/storage/public-objects/${ad.imageUrl}`
        : ad.imageUrl,
      status: computeAdvertisementStatus(ad),
    }));

    return res.json(adsWithStatus);
  } catch (err: any) {
    console.error("[Advertisements Admin API] Failed to fetch all advertisements:", err);
    return res.status(500).json({ error: "Failed to fetch advertisements" });
  }
});

/**
 * Parses multipart/form-data payload from raw body buffer without external dependencies.
 */
function parseMultipartBuffer(
  buffer: Buffer,
  boundary: string
): { buffer: Buffer; fileName?: string; contentType?: string } | null {
  const boundaryBuf = Buffer.from(`--${boundary}`);
  let startIdx = buffer.indexOf(boundaryBuf);
  if (startIdx === -1) return null;

  while (startIdx !== -1) {
    const afterBoundary = startIdx + boundaryBuf.length;
    // Check if closing boundary (--boundary--)
    if (buffer.slice(afterBoundary, afterBoundary + 2).toString() === "--") {
      break;
    }

    let headerEnd = buffer.indexOf("\r\n\r\n", afterBoundary);
    let delimiterLen = 4;
    if (headerEnd === -1) {
      headerEnd = buffer.indexOf("\n\n", afterBoundary);
      delimiterLen = 2;
    }
    if (headerEnd === -1) break;

    const headersStr = buffer.slice(afterBoundary, headerEnd).toString("utf8");
    const bodyStart = headerEnd + delimiterLen;

    const nextBoundary = buffer.indexOf(boundaryBuf, bodyStart);
    if (nextBoundary === -1) break;

    let bodyEnd = nextBoundary;
    if (bodyEnd >= 2 && buffer[bodyEnd - 2] === 13 && buffer[bodyEnd - 1] === 10) {
      bodyEnd -= 2;
    } else if (bodyEnd >= 1 && buffer[bodyEnd - 1] === 10) {
      bodyEnd -= 1;
    }

    const partBody = buffer.slice(bodyStart, bodyEnd);
    let fileName: string | undefined;
    let contentType: string | undefined;

    const lines = headersStr.split(/\r?\n/);
    for (const line of lines) {
      const lower = line.toLowerCase();
      if (lower.startsWith("content-disposition:")) {
        const fnMatch = line.match(/filename\*?=(?:UTF-8'')?"?([^";\r\n]+)"?/i);
        if (fnMatch) {
          try {
            fileName = decodeURIComponent(fnMatch[1].trim());
          } catch {
            fileName = fnMatch[1].trim();
          }
        }
      } else if (lower.startsWith("content-type:")) {
        contentType = line.split(":")[1]?.trim();
      }
    }

    if (partBody.length > 0 && (fileName || (contentType && contentType.startsWith("image/")))) {
      return { buffer: partBody, fileName, contentType };
    }

    startIdx = nextBoundary;
  }

  return null;
}

/**
 * Validates image buffer magic bytes / file signature.
 */
function detectImageFormat(buffer: Buffer): { ext: string; mime: string } | null {
  if (!buffer || buffer.length < 4) return null;
  // PNG: 89 50 4E 47
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
    return { ext: "png", mime: "image/png" };
  }
  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { ext: "jpg", mime: "image/jpeg" };
  }
  // GIF: 47 49 46
  if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) {
    return { ext: "gif", mime: "image/gif" };
  }
  // WebP: RIFF .... WEBP
  if (buffer.length >= 12) {
    const riff = buffer.slice(0, 4).toString("ascii");
    const webp = buffer.slice(8, 12).toString("ascii");
    if (riff === "RIFF" && webp === "WEBP") {
      return { ext: "webp", mime: "image/webp" };
    }
  }
  // SVG: <?xml ... <svg or <svg
  const startStr = buffer.slice(0, 300).toString("utf8").toLowerCase().trim();
  if (startStr.includes("<svg") || (startStr.startsWith("<?xml") && startStr.includes("<svg"))) {
    return { ext: "svg", mime: "image/svg+xml" };
  }
  return null;
}

/**
 * POST /api/admin/upload/advertisement-image — Admin
 * Uploads an advertisement image to Cloudflare R2 / MongoDB Atlas storage.
 * Supports multipart/form-data, raw binary buffer, and JSON base64.
 */
router.post(
  "/admin/upload/advertisement-image",
  requireAdminKey,
  (req: any, res: any, next: any) => {
    express.raw({ type: () => true, limit: "25mb" })(req, res, (err: any) => {
      if (err) {
        if (err.type === "entity.too.large" || err.status === 413) {
          return res.status(413).json({ error: "Image size exceeds 25MB limit. Please choose a smaller image." });
        }
        return next(err);
      }
      next();
    });
  },
  async (req: any, res: any) => {
    try {
      let imageBuffer: Buffer | null = null;
      let contentType = "image/jpeg";
      let customFileName = (req.headers["x-file-name"] || req.headers["x-filename"]) as string | undefined;

      const rawContentType = (req.headers["content-type"] || "").trim();
      const headerContentType = rawContentType.split(";")[0].trim().toLowerCase();

      // 1. Multipart Form Data handling
      if (headerContentType === "multipart/form-data") {
        const boundaryMatch = rawContentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
        let boundary = boundaryMatch ? (boundaryMatch[1] || boundaryMatch[2] || "").trim() : null;

        if (!boundary && Buffer.isBuffer(req.body) && req.body.length > 2) {
          const firstLineEnd = req.body.indexOf("\n");
          if (firstLineEnd > 2) {
            const firstLine = req.body.slice(0, firstLineEnd).toString("utf8").trim();
            if (firstLine.startsWith("--")) {
              boundary = firstLine.slice(2).trim();
            }
          }
        }

        if (boundary && Buffer.isBuffer(req.body)) {
          const parsed = parseMultipartBuffer(req.body, boundary);
          if (parsed) {
            imageBuffer = parsed.buffer;
            if (parsed.fileName) customFileName = parsed.fileName;
            if (parsed.contentType) contentType = parsed.contentType;
          }
        }
      }

      // 1b. Multipart auto-detection if Content-Type was generic, missing boundary, or misconfigured
      if (!imageBuffer && Buffer.isBuffer(req.body) && req.body.length > 4) {
        if (req.body[0] === 0x2d && req.body[1] === 0x2d) {
          const firstLineEnd = req.body.indexOf("\n");
          if (firstLineEnd > 2) {
            const firstLine = req.body.slice(0, firstLineEnd).toString("utf8").trim();
            if (firstLine.startsWith("--")) {
              const detectedBoundary = firstLine.slice(2).trim();
              if (detectedBoundary) {
                const parsed = parseMultipartBuffer(req.body, detectedBoundary);
                if (parsed) {
                  imageBuffer = parsed.buffer;
                  if (parsed.fileName) customFileName = parsed.fileName;
                  if (parsed.contentType) contentType = parsed.contentType;
                }
              }
            }
          }
        }
      }

      // 2. Raw binary buffer handling
      if (!imageBuffer && Buffer.isBuffer(req.body) && req.body.length > 0) {
        // Check if raw body is actually a JSON string (e.g. from axios/fetch application/json)
        const firstByte = req.body[0];
        if (firstByte === 0x7b /* '{' */) {
          try {
            const parsedJson = JSON.parse(req.body.toString("utf8"));
            const rawBase64 = parsedJson.imageBase64 || parsedJson.image || parsedJson.dataUrl || parsedJson.buffer;
            if (typeof rawBase64 === "string" && rawBase64.length > 0) {
              const match = rawBase64.match(/^data:([a-zA-Z0-9]+\/[a-zA-Z0-9-+.]+);base64,(.+)$/);
              if (match) {
                contentType = match[1];
                imageBuffer = Buffer.from(match[2], "base64");
              } else {
                imageBuffer = Buffer.from(rawBase64, "base64");
              }
            }
            if (parsedJson.fileName) customFileName = parsedJson.fileName;
            if (parsedJson.contentType) contentType = parsedJson.contentType;
          } catch {}
        }

        if (!imageBuffer) {
          imageBuffer = req.body;
          if (headerContentType && (headerContentType.startsWith("image/") || headerContentType === "application/octet-stream")) {
            contentType = headerContentType === "application/octet-stream" ? "image/jpeg" : headerContentType;
          }
        }
      } else if (!imageBuffer && req.body && typeof req.body === "object") {
        // 3. Fallback for JSON body parsed upstream
        const rawBase64 = req.body.imageBase64 || req.body.image || req.body.dataUrl || req.body.buffer;
        if (typeof rawBase64 === "string" && rawBase64.length > 0) {
          const match = rawBase64.match(/^data:([a-zA-Z0-9]+\/[a-zA-Z0-9-+.]+);base64,(.+)$/);
          if (match) {
            contentType = match[1];
            imageBuffer = Buffer.from(match[2], "base64");
          } else {
            imageBuffer = Buffer.from(rawBase64, "base64");
          }
        }
        if (req.body.fileName) customFileName = req.body.fileName;
        if (req.body.contentType) contentType = req.body.contentType;
      }

      if (!imageBuffer || imageBuffer.length === 0) {
        return res.status(400).json({ error: "No image data received or file is empty" });
      }

      if (imageBuffer.length > 25 * 1024 * 1024) {
        return res.status(413).json({ error: "Image size exceeds 25MB limit" });
      }

      // 4. Validate image magic bytes / file signature
      const detected = detectImageFormat(imageBuffer);
      if (!detected) {
        return res.status(400).json({ error: "Only image files (JPEG, PNG, WebP, GIF, SVG) are allowed" });
      }

      // Determine extension from detected format, customFileName, or contentType
      let ext = detected.ext;
      contentType = detected.mime;
      if (customFileName && customFileName.includes(".")) {
        let decodedName = customFileName;
        try {
          decodedName = decodeURIComponent(customFileName);
        } catch {
          decodedName = customFileName;
        }
        const fileExt = decodedName.split(".").pop()?.toLowerCase();
        if (fileExt && ["jpg", "jpeg", "png", "webp", "gif", "svg"].includes(fileExt)) {
          ext = fileExt === "jpeg" ? "jpg" : fileExt;
        }
      }

      const uploadResult = await objectStorageService.uploadPublicAdvertisementImage(
        imageBuffer,
        ext,
        contentType
      );

      return res.status(200).json({
        success: true,
        message: "Image uploaded successfully",
        publicUrl: uploadResult.publicRelPath,
        publicRelPath: uploadResult.publicRelPath,
        objectKey: uploadResult.objectKey,
        fileName: uploadResult.fileName,
        size: uploadResult.size,
        contentType,
      });
    } catch (err: any) {
      console.error("[Advertisements Upload] Upload failed:", err);
      return res.status(500).json({
        error: err?.message || "Storage upload failed: Internal server error",
      });
    }
  }
);

/**
 * POST /api/admin/advertisements — Admin
 * Creates a new advertisement.
 */
router.post(
  "/admin/advertisements",
  requireAdminKey,
  express.json(),
  async (req: any, res: any) => {
    try {
      const {
        title,
        description,
        imageUrl,
        uploadedImageUrl,
        externalImageUrl,
        imageSource,
        linkUrl,
        displayOrder,
        isActive,
        startDate,
        endDate,
        objectKey,
      } = req.body;

      // Rule: Title is optional
      const resolvedTitle = typeof title === "string" ? title.trim() : "";

      // Rule: Mutual exclusivity between uploaded image and external image URL
      const rawHasUploaded = Boolean(uploadedImageUrl && typeof uploadedImageUrl === "string" && uploadedImageUrl.trim());
      const rawHasExternal = Boolean(externalImageUrl && typeof externalImageUrl === "string" && externalImageUrl.trim());

      if (rawHasUploaded && rawHasExternal) {
        return res.status(400).json({ error: "Please provide either an uploaded image or an image URL, but not both." });
      }

      let resolvedImageUrl = "";
      let resolvedImageSource: "upload" | "url" = "upload";
      let resolvedObjectKey = objectKey ? String(objectKey).trim() : null;

      if (rawHasUploaded) {
        resolvedImageUrl = uploadedImageUrl.trim();
        resolvedImageSource = "upload";
      } else if (rawHasExternal) {
        resolvedImageUrl = externalImageUrl.trim();
        resolvedImageSource = "url";
        resolvedObjectKey = null;
      } else if (imageUrl && typeof imageUrl === "string" && imageUrl.trim()) {
        resolvedImageUrl = imageUrl.trim();
        resolvedImageSource =
          imageSource === "url" || resolvedImageUrl.startsWith("http://") || resolvedImageUrl.startsWith("https://")
            ? "url"
            : "upload";
      } else {
        return res.status(400).json({ error: "Please upload an image or enter an image URL." });
      }

      if (resolvedImageSource === "url") {
        if (!/^https?:\/\/.+/i.test(resolvedImageUrl) && !resolvedImageUrl.startsWith("/") && !resolvedImageUrl.startsWith("data:")) {
          return res.status(400).json({ error: "Please enter a valid, publicly accessible image URL" });
        }
      }

      if (!resolvedObjectKey && resolvedImageUrl.includes("advertisements/")) {
        const parts = resolvedImageUrl.split("advertisements/");
        resolvedObjectKey = `advertisements/${parts[1]}`;
      }

      if (resolvedImageUrl.startsWith("advertisements/")) {
        resolvedImageUrl = `/api/storage/public-objects/${resolvedImageUrl}`;
      }

      const id = crypto.randomUUID();
      const parsedDisplayOrder = typeof displayOrder === "number" && !isNaN(displayOrder)
        ? displayOrder
        : inMemoryAdvertisements.size + 1;

      const newAd: AdvertisementDoc = {
        id,
        _id: id,
        title: resolvedTitle,
        description: description?.trim() || null,
        imageUrl: resolvedImageUrl,
        imageSource: resolvedImageSource,
        objectKey: resolvedObjectKey,
        linkUrl: linkUrl?.trim() || null,
        displayOrder: parsedDisplayOrder,
        isActive: isActive !== false,
        startDate: startDate ? new Date(startDate) : null,
        endDate: endDate ? new Date(endDate) : null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      if (isMongoDbConnected()) {
        try {
          const col = mongoGeneric.getCollection<AdvertisementDoc>("advertisements");
          await col.insertOne(newAd as any);
        } catch (mongoErr: any) {
          console.error("[Advertisements API] Mongo insert failed:", mongoErr);
          return res.status(500).json({
            error: `Failed to save advertisement to database: ${mongoErr?.message || "Database error"}`,
          });
        }
      }

      inMemoryAdvertisements.set(id, newAd);

      return res.status(201).json({
        ...newAd,
        status: computeAdvertisementStatus(newAd),
      });
    } catch (err: any) {
      console.error("[Advertisements API] Failed to create advertisement:", err);
      return res.status(500).json({ error: "Failed to create advertisement" });
    }
  }
);

/**
 * PUT /api/admin/advertisements/:id — Admin
 * Updates an existing advertisement.
 */
router.put(
  "/admin/advertisements/:id",
  requireAdminKey,
  express.json(),
  async (req: any, res: any) => {
    try {
      const { id } = req.params;
      const {
        title,
        description,
        imageUrl,
        uploadedImageUrl,
        externalImageUrl,
        imageSource,
        linkUrl,
        displayOrder,
        isActive,
        startDate,
        endDate,
        objectKey,
      } = req.body;

      let existingAd: AdvertisementDoc | null = inMemoryAdvertisements.get(id) || null;

      if (isMongoDbConnected()) {
        try {
          const col = mongoGeneric.getCollection<AdvertisementDoc>("advertisements");
          const found = await col.findOne({ $or: [{ id }, { _id: id as any }] });
          if (found) existingAd = found;
        } catch {}
      }

      if (!existingAd) {
        return res.status(404).json({ error: "Advertisement not found" });
      }

      const rawHasUploaded = Boolean(uploadedImageUrl && typeof uploadedImageUrl === "string" && uploadedImageUrl.trim());
      const rawHasExternal = Boolean(externalImageUrl && typeof externalImageUrl === "string" && externalImageUrl.trim());

      if (rawHasUploaded && rawHasExternal) {
        return res.status(400).json({ error: "Please provide either an uploaded image or an image URL, but not both." });
      }

      let resolvedImageUrl = existingAd.imageUrl;
      let resolvedImageSource: "upload" | "url" = existingAd.imageSource || "upload";
      let resolvedObjectKey = objectKey !== undefined ? (objectKey ? String(objectKey).trim() : null) : existingAd.objectKey;

      if (rawHasUploaded) {
        resolvedImageUrl = uploadedImageUrl.trim();
        resolvedImageSource = "upload";
      } else if (rawHasExternal) {
        resolvedImageUrl = externalImageUrl.trim();
        resolvedImageSource = "url";
        resolvedObjectKey = null;
      } else if (imageUrl !== undefined) {
        if (!imageUrl || !String(imageUrl).trim()) {
          return res.status(400).json({ error: "Please upload an image or enter an image URL." });
        }
        resolvedImageUrl = String(imageUrl).trim();
        resolvedImageSource =
          imageSource === "url" || resolvedImageUrl.startsWith("http://") || resolvedImageUrl.startsWith("https://")
            ? "url"
            : "upload";
      }

      if (!resolvedObjectKey && resolvedImageUrl && resolvedImageUrl.includes("advertisements/")) {
        const parts = resolvedImageUrl.split("advertisements/");
        resolvedObjectKey = `advertisements/${parts[1]}`;
      }

      if (resolvedImageUrl && resolvedImageUrl.startsWith("advertisements/")) {
        resolvedImageUrl = `/api/storage/public-objects/${resolvedImageUrl}`;
      }

      const updatedAd: AdvertisementDoc = {
        ...existingAd,
        title: title !== undefined ? String(title).trim() : existingAd.title,
        description: description !== undefined ? (description ? String(description).trim() : null) : existingAd.description,
        imageUrl: resolvedImageUrl,
        imageSource: resolvedImageSource,
        objectKey: resolvedObjectKey,
        linkUrl: linkUrl !== undefined ? (linkUrl ? String(linkUrl).trim() : null) : existingAd.linkUrl,
        displayOrder: typeof displayOrder === "number" && !isNaN(displayOrder) ? displayOrder : existingAd.displayOrder,
        isActive: isActive !== undefined ? Boolean(isActive) : existingAd.isActive,
        startDate: startDate !== undefined ? (startDate ? new Date(startDate) : null) : existingAd.startDate,
        endDate: endDate !== undefined ? (endDate ? new Date(endDate) : null) : existingAd.endDate,
        updatedAt: new Date(),
      };

      if (isMongoDbConnected()) {
        try {
          const col = mongoGeneric.getCollection<AdvertisementDoc>("advertisements");
          await col.updateOne(
            { $or: [{ id }, { _id: id as any }] },
            { $set: updatedAd as any }
          );
        } catch (mongoErr: any) {
          console.error("[Advertisements API] Mongo update failed:", mongoErr);
          return res.status(500).json({
            error: `Failed to update advertisement in database: ${mongoErr?.message || "Database error"}`,
          });
        }
      }

      inMemoryAdvertisements.set(id, updatedAd);

      return res.json({
        ...updatedAd,
        status: computeAdvertisementStatus(updatedAd),
      });
    } catch (err: any) {
      console.error("[Advertisements API] Failed to update advertisement:", err);
      return res.status(500).json({ error: "Failed to update advertisement" });
    }
  }
);

/**
 * PATCH /api/admin/advertisements/:id/toggle-status — Admin
 * Toggles active/inactive state of an advertisement.
 */
router.patch(
  "/admin/advertisements/:id/toggle-status",
  requireAdminKey,
  express.json(),
  async (req: any, res: any) => {
    try {
      const { id } = req.params;
      let existingAd: AdvertisementDoc | null = inMemoryAdvertisements.get(id) || null;

      if (isMongoDbConnected()) {
        try {
          const col = mongoGeneric.getCollection<AdvertisementDoc>("advertisements");
          const found = await col.findOne({ $or: [{ id }, { _id: id as any }] });
          if (found) existingAd = found;
        } catch {}
      }

      if (!existingAd) {
        return res.status(404).json({ error: "Advertisement not found" });
      }

      const nextActive = req.body?.isActive !== undefined ? Boolean(req.body.isActive) : !existingAd.isActive;
      existingAd.isActive = nextActive;
      existingAd.updatedAt = new Date();

      if (isMongoDbConnected()) {
        try {
          const col = mongoGeneric.getCollection<AdvertisementDoc>("advertisements");
          await col.updateOne(
            { $or: [{ id }, { _id: id as any }] },
            { $set: { isActive: nextActive, updatedAt: existingAd.updatedAt } }
          );
        } catch {}
      }

      inMemoryAdvertisements.set(id, existingAd);

      return res.json({
        id,
        isActive: nextActive,
        status: computeAdvertisementStatus(existingAd),
      });
    } catch (err: any) {
      console.error("[Advertisements API] Failed to toggle advertisement status:", err);
      return res.status(500).json({ error: "Failed to toggle status" });
    }
  }
);

/**
 * DELETE /api/admin/advertisements/:id — Admin
 * Deletes an advertisement.
 */
router.delete(
  "/admin/advertisements/:id",
  requireAdminKey,
  async (req: any, res: any) => {
    try {
      const { id } = req.params;

      if (isMongoDbConnected()) {
        try {
          const col = mongoGeneric.getCollection<AdvertisementDoc>("advertisements");
          await col.deleteOne({ $or: [{ id }, { _id: id as any }] });
        } catch {}
      }

      inMemoryAdvertisements.delete(id);

      return res.json({ success: true, message: "Advertisement deleted successfully" });
    } catch (err: any) {
      console.error("[Advertisements API] Failed to delete advertisement:", err);
      return res.status(500).json({ error: "Failed to delete advertisement" });
    }
  }
);

export default router;
