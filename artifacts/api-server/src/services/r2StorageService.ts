import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID, createHash } from "crypto";
import { mongoR2Assets } from "@workspace/db";

export interface PresignedUploadRequest {
  sellerId: string;
  productId?: string;
  fileName: string;
  contentType: string;
  size: number;
}

export interface PresignedUploadResult {
  uploadURL: string;
  objectKey: string;
  publicUrl: string;
  expiresAt: string;
  metadata: {
    fileName: string;
    contentType: string;
    size: number;
    sellerId: string;
    productId?: string;
  };
}

export interface ImageMetadata {
  objectKey: string;
  url: string;
  fileName: string;
  contentType: string;
  size: number;
  sortOrder: number;
  isPrimary: boolean;
  uploadedAt: string;
}

const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

function getR2Client(): S3Client {
  const accountId =
    process.env.R2_ACCOUNT_ID ||
    process.env.CLOUDFLARE_ACCOUNT_ID ||
    "";
  const accessKeyId =
    process.env.R2_ACCESS_KEY_ID ||
    process.env.CLOUDFLARE_GLOBAL_API_KEY ||
    "";
  const secretAccessKey =
    process.env.R2_SECRET_ACCESS_KEY ||
    process.env.CLOUDFLARE_ACCOUNT_ID ||
    "";

  const endpoint = process.env.R2_ENDPOINT
    ? process.env.R2_ENDPOINT
    : accountId
    ? `https://${accountId}.r2.cloudflarestorage.com`
    : undefined;

  return new S3Client({
    region: "auto",
    endpoint,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });
}

export class R2StorageService {
  private client: S3Client;
  private bucketName: string;
  private publicDomain: string;

  constructor() {
    this.client = getR2Client();
    this.bucketName =
      process.env.R2_BUCKET_NAME ||
      process.env.R2_BUCKET_PUBLIC ||
      "vashtraa-public";
    this.publicDomain = process.env.R2_PUBLIC_DOMAIN || "";
  }

  getBucketName(): string {
    return this.bucketName;
  }

  validateFileMetadata(contentType: string, size: number): { ok: boolean; error?: string } {
    const normType = (contentType || "").toLowerCase().split(";")[0].trim();
    const SAFE_IMAGE_TYPES = new Set([
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/jpg",
      "image/jfif",
    ]);
    if (!SAFE_IMAGE_TYPES.has(normType) || normType.includes("svg") || normType.includes("html") || normType.includes("xml")) {
      return {
        ok: false,
        error: "Invalid file format. Allowed image formats: JPG, PNG, WEBP.",
      };
    }
    if (size > MAX_FILE_SIZE) {
      return {
        ok: false,
        error: `File size exceeds limit of ${MAX_FILE_SIZE / (1024 * 1024)}MB.`,
      };
    }
    return { ok: true };
  }

  generateUniqueObjectKey(sellerId: string, productId?: string, fileName?: string, contentType?: string): string {
    return this.generateProductObjectKey(sellerId, productId, fileName, contentType);
  }

  generateProductObjectKey(sellerId: string, productId?: string, fileName?: string, contentType?: string): string {
    let ext = "webp";
    if (contentType) {
      const parts = contentType.split("/");
      if (parts[1]) {
        ext = parts[1].toLowerCase() === "jpeg" ? "jpg" : parts[1].toLowerCase();
      }
    } else if (fileName && fileName.includes(".")) {
      ext = fileName.split(".").pop()!.toLowerCase();
    }
    const sanitizedSeller = (sellerId || "seller").replace(/[^a-zA-Z0-9_-]/g, "");
    const sanitizedProd = (productId || "draft").replace(/[^a-zA-Z0-9_-]/g, "");
    const imageId = `${Date.now()}-${randomUUID().slice(0, 8)}`;
    return `public/products/${sanitizedSeller}/${sanitizedProd}/${imageId}.${ext}`;
  }

  generateKycObjectKey(sellerId: string, docType: string = "pan", fileName?: string, contentType?: string): string {
    let ext = "pdf";
    if (contentType) {
      const parts = contentType.split("/");
      if (parts[1]) {
        ext = parts[1].toLowerCase() === "jpeg" ? "jpg" : parts[1].toLowerCase();
      }
    } else if (fileName && fileName.includes(".")) {
      ext = fileName.split(".").pop()!.toLowerCase();
    }
    const sanitizedSeller = (sellerId || "seller").replace(/[^a-zA-Z0-9_-]/g, "");
    const sanitizedDoc = docType.replace(/[^a-zA-Z0-9_-]/g, "");
    const docId = `${Date.now()}-${randomUUID().slice(0, 8)}`;
    return `private/sellers/${sanitizedSeller}/kyc/${sanitizedDoc}-${docId}.${ext}`;
  }

  generateStoreProfileObjectKey(sellerId: string, assetType: string = "avatar", fileName?: string, contentType?: string): string {
    let ext = "webp";
    if (contentType) {
      const parts = contentType.split("/");
      if (parts[1]) {
        ext = parts[1].toLowerCase() === "jpeg" ? "jpg" : parts[1].toLowerCase();
      }
    } else if (fileName && fileName.includes(".")) {
      ext = fileName.split(".").pop()!.toLowerCase();
    }
    const sanitizedSeller = (sellerId || "seller").replace(/[^a-zA-Z0-9_-]/g, "");
    const sanitizedAsset = assetType.replace(/[^a-zA-Z0-9_-]/g, "");
    const assetId = `${Date.now()}-${randomUUID().slice(0, 8)}`;
    return `public/sellers/${sanitizedSeller}/profile/${sanitizedAsset}-${assetId}.${ext}`;
  }

  getObjectPublicUrl(objectKey: string): string {
    if (this.publicDomain) {
      const domain = this.publicDomain.endsWith("/") ? this.publicDomain.slice(0, -1) : this.publicDomain;
      return `${domain}/${objectKey}`;
    }
    return `/api/storage/public-objects/${objectKey}`;
  }

  async generatePresignedKycUploadUrl({
    sellerId,
    docType,
    fileName,
    contentType,
    size,
  }: {
    sellerId: string;
    docType: string;
    fileName: string;
    contentType: string;
    size: number;
  }): Promise<PresignedUploadResult> {
    const normType = (contentType || "").toLowerCase().split(";")[0].trim();
    const ALLOWED_KYC_TYPES = new Set([
      "application/pdf",
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/jpg",
    ]);
    if (!ALLOWED_KYC_TYPES.has(normType) || normType.includes("svg") || normType.includes("html") || normType.includes("xml")) {
      throw new Error("Invalid KYC document format. Allowed formats: PDF, JPG, PNG, WEBP.");
    }
    if (size > 15 * 1024 * 1024) {
      throw new Error("KYC document file size exceeds 15MB limit.");
    }

    const objectKey = this.generateKycObjectKey(sellerId, docType, fileName, contentType);

    const command = new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_PRIVATE || this.bucketName,
      Key: objectKey,
      ContentType: contentType,
      Metadata: {
        sellerid: sellerId,
        doctype: docType,
        filename: encodeURIComponent(fileName || docType),
      },
    });

    const ttlSeconds = 900;
    const uploadURL = await getSignedUrl(this.client, command, { expiresIn: ttlSeconds });
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();
    const publicUrl = `/api/storage/private/${objectKey}`;

    // Store R2 asset record metadata in MongoDB Atlas
    await mongoR2Assets.saveAsset({
      objectKey,
      bucket: process.env.R2_BUCKET_PRIVATE || this.bucketName,
      publicUrl,
      sellerId,
      assetType: `kyc_${docType}`,
      fileName,
      contentType,
      size,
      status: "presigned_generated",
    }).catch(() => {});

    return {
      uploadURL,
      objectKey,
      publicUrl,
      expiresAt,
      metadata: {
        fileName,
        contentType,
        size,
        sellerId,
      },
    };
  }

  async generatePresignedStoreAssetUploadUrl({
    sellerId,
    assetType,
    fileName,
    contentType,
    size,
  }: {
    sellerId: string;
    assetType: string;
    fileName: string;
    contentType: string;
    size: number;
  }): Promise<PresignedUploadResult> {
    const validation = this.validateFileMetadata(contentType, size);
    if (!validation.ok) {
      throw new Error(validation.error);
    }

    const objectKey = this.generateStoreProfileObjectKey(sellerId, assetType, fileName, contentType);

    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: objectKey,
      ContentType: contentType,
      Metadata: {
        sellerid: sellerId,
        assettype: assetType,
        filename: encodeURIComponent(fileName || assetType),
      },
    });

    const ttlSeconds = 900;
    const uploadURL = await getSignedUrl(this.client, command, { expiresIn: ttlSeconds });
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();
    const publicUrl = this.getObjectPublicUrl(objectKey);

    // Store R2 asset record metadata in MongoDB Atlas
    await mongoR2Assets.saveAsset({
      objectKey,
      bucket: this.bucketName,
      publicUrl,
      sellerId,
      assetType: `store_${assetType}`,
      fileName,
      contentType,
      size,
      status: "presigned_generated",
    }).catch(() => {});

    return {
      uploadURL,
      objectKey,
      publicUrl,
      expiresAt,
      metadata: {
        fileName,
        contentType,
        size,
        sellerId,
      },
    };
  }

  async generatePresignedUploadUrl(req: PresignedUploadRequest): Promise<PresignedUploadResult> {
    const validation = this.validateFileMetadata(req.contentType, req.size);
    if (!validation.ok) {
      throw new Error(validation.error);
    }

    const objectKey = this.generateUniqueObjectKey(req.sellerId, req.productId, req.fileName, req.contentType);

    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: objectKey,
      ContentType: req.contentType,
      Metadata: {
        sellerid: req.sellerId,
        filename: encodeURIComponent(req.fileName || "image"),
      },
    });

    const ttlSeconds = 900; // 15 minutes
    const uploadURL = await getSignedUrl(this.client, command, { expiresIn: ttlSeconds });
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();
    const publicUrl = this.getObjectPublicUrl(objectKey);

    // Store R2 asset record metadata in MongoDB Atlas
    await mongoR2Assets.saveAsset({
      objectKey,
      bucket: this.bucketName,
      publicUrl,
      sellerId: req.sellerId,
      productId: req.productId,
      assetType: "product_image",
      fileName: req.fileName,
      contentType: req.contentType,
      size: req.size,
      status: "presigned_generated",
    }).catch(() => {});

    return {
      uploadURL,
      objectKey,
      publicUrl,
      expiresAt,
      metadata: {
        fileName: req.fileName,
        contentType: req.contentType,
        size: req.size,
        sellerId: req.sellerId,
        productId: req.productId,
      },
    };
  }

  async uploadObjectServerSide(
    data: Buffer,
    contentType: string,
    sellerId: string,
    productId?: string,
    fileName?: string
  ): Promise<{ objectKey: string; publicUrl: string; deduplicated?: boolean }> {
    const normContentType = (contentType || "image/jpeg").toLowerCase().split(";")[0].trim();
    const effectiveContentType = normContentType === "image/jpg" ? "image/jpeg" : normContentType;

    const validation = this.validateFileMetadata(effectiveContentType, data.length);
    if (!validation.ok) {
      throw new Error(validation.error);
    }

    // 1. Content Hash Deduplication
    const contentHash = createHash("sha256").update(data).digest("hex");
    const existingAsset = await mongoR2Assets.findByContentHash(contentHash, sellerId).catch(() => null);
    if (existingAsset && existingAsset.objectKey && existingAsset.publicUrl) {
      return {
        objectKey: existingAsset.objectKey,
        publicUrl: existingAsset.publicUrl,
        deduplicated: true,
      };
    }

    const objectKey = this.generateUniqueObjectKey(sellerId, productId, fileName, effectiveContentType);

    try {
      const command = new PutObjectCommand({
        Bucket: this.bucketName,
        Key: objectKey,
        Body: data,
        ContentType: effectiveContentType,
        Metadata: {
          sellerid: sellerId,
          contenthash: contentHash,
          filename: encodeURIComponent(fileName || "image"),
        },
      });
      await this.client.send(command);
    } catch (err) {
      // Cloudflare R2 direct PUT failed (e.g. dev/local environment without live R2 credentials)
    }

    const publicUrl = this.getObjectPublicUrl(objectKey);

    // Store R2 asset record metadata and base64 buffer in MongoDB Atlas for local/fallback serving
    await mongoR2Assets.saveAsset({
      objectKey,
      bucket: this.bucketName,
      publicUrl,
      sellerId,
      productId,
      assetType: "product_image",
      fileName: fileName || "image",
      contentType: effectiveContentType,
      size: data.length,
      status: "uploaded",
      contentHash,
      bufferBase64: data.toString("base64"),
    }).catch(() => {});

    // Save to local public/uploads directory as well
    try {
      const fs = require("fs");
      const path = require("path");
      const uploadsDir = path.resolve(process.cwd(), "public/uploads");
      const targetPath = path.join(uploadsDir, objectKey);
      fs.mkdirSync(path.dirname(targetPath), { recursive: true });
      fs.writeFileSync(targetPath, data);
    } catch {}

    return { objectKey, publicUrl };
  }

  async uploadKycServerSide(
    data: Buffer,
    contentType: string,
    sellerId: string,
    docType: string = "pan",
    fileName?: string
  ): Promise<{ objectKey: string; publicUrl: string }> {
    const objectKey = this.generateKycObjectKey(sellerId, docType, fileName, contentType);
    const privateBucket = process.env.R2_BUCKET_PRIVATE || "vashtraa-private";

    try {
      const command = new PutObjectCommand({
        Bucket: privateBucket,
        Key: objectKey,
        Body: data,
        ContentType: contentType,
        Metadata: {
          sellerid: sellerId,
          doctype: docType,
          filename: encodeURIComponent(fileName || docType),
        },
      });
      await this.client.send(command);
    } catch (err) {
      // Cloudflare R2 direct PUT failed (e.g. dev environment without live R2 credentials)
    }

    const publicUrl = `/api/storage/private/${objectKey}`;

    // Store R2 asset record metadata in MongoDB Atlas
    await mongoR2Assets.saveAsset({
      objectKey,
      bucket: privateBucket,
      publicUrl,
      sellerId,
      assetType: `kyc_${docType}`,
      fileName: fileName || `${docType}-document`,
      contentType,
      size: data.length,
      status: "uploaded",
      bufferBase64: data.toString("base64"),
    }).catch(() => {});

    return { objectKey, publicUrl };
  }

  async getPrivateObject(objectKey: string): Promise<{ data: Buffer; contentType: string } | null> {
    if (!objectKey) return null;
    let key = objectKey;
    if (key.includes("/api/storage/private/")) {
      key = key.split("/api/storage/private/")[1];
    } else if (key.includes("/storage/private/")) {
      key = key.split("/storage/private/")[1];
    }

    const privateBucket = process.env.R2_BUCKET_PRIVATE || "vashtraa-private";

    // First try Cloudflare R2 GetObjectCommand
    try {
      const command = new GetObjectCommand({
        Bucket: privateBucket,
        Key: key,
      });
      const response = await this.client.send(command);
      if (response.Body) {
        const byteArray = await response.Body.transformToByteArray();
        const buffer = Buffer.from(byteArray);
        return {
          data: buffer,
          contentType: response.ContentType || "application/pdf",
        };
      }
    } catch {
      // Fallback to mongoR2Assets stored buffer
    }

    // Fallback: check mongoR2Assets
    const record = await mongoR2Assets.findByObjectKey(key);
    if (record) {
      if ((record as any).bufferBase64) {
        return {
          data: Buffer.from((record as any).bufferBase64, "base64"),
          contentType: record.contentType || "application/pdf",
        };
      }
    }

    return null;
  }

  async checkObjectExists(objectKey: string): Promise<boolean> {
    try {
      const command = new HeadObjectCommand({
        Bucket: this.bucketName,
        Key: objectKey,
      });
      await this.client.send(command);
      return true;
    } catch {
      return false;
    }
  }

  async deleteObject(objectKey: string, sellerId?: string, isAdmin?: boolean): Promise<boolean> {
    if (!objectKey) return false;

    let key = objectKey;
    if (key.startsWith("/api/storage/public-objects/")) {
      key = key.slice("/api/storage/public-objects/".length);
    } else if (this.publicDomain && key.startsWith(this.publicDomain)) {
      key = key.slice(this.publicDomain.length).replace(/^\//, "");
    }

    if (!key || key.includes("..")) {
      return false;
    }

    try {
      if (sellerId && !isAdmin) {
        const headCmd = new HeadObjectCommand({
          Bucket: this.bucketName,
          Key: key,
        });
        const meta = await this.client.send(headCmd);
        const owner = meta.Metadata?.sellerid;
        if (owner && owner !== sellerId) {
          return false;
        }
      }

      const deleteCmd = new DeleteObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      });
      await this.client.send(deleteCmd);

      // Mark asset deleted in MongoDB Atlas
      await mongoR2Assets.markDeleted(key).catch(() => {});
      return true;
    } catch {
      return false;
    }
  }
}

export const r2StorageService = new R2StorageService();
