import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Readable } from "stream";
import { randomUUID } from "crypto";
import fs from "fs";
import path from "path";
import { mongoR2Assets } from "@workspace/db";

export class ObjectNotFoundError extends Error {
  constructor() {
    super("Object not found");
    this.name = "ObjectNotFoundError";
    Object.setPrototypeOf(this, ObjectNotFoundError.prototype);
  }
}

export interface ObjectAclPolicy {
  owner: string;
  visibility: "public" | "private";
}

export function getR2Client(): S3Client {
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

export const r2Client = getR2Client();

export class ObjectStorageService {
  private publicBucket: string;
  private privateBucket: string;
  private publicDomain: string;

  constructor() {
    this.publicBucket = process.env.R2_BUCKET_PUBLIC || "vashtraa-public";
    this.privateBucket = process.env.R2_BUCKET_PRIVATE || "vashtraa-private";
    this.publicDomain = process.env.R2_PUBLIC_DOMAIN || "";
  }

  getPublicBucket(): string {
    return this.publicBucket;
  }

  getPrivateBucket(): string {
    return this.privateBucket;
  }

  getPublicObjectSearchPaths(): Array<string> {
    return [this.publicBucket];
  }

  getPrivateObjectDir(): string {
    return this.privateBucket;
  }

  /**
   * Generates a presigned PUT URL for frontend direct uploads to the private R2 bucket.
   */
  async getObjectEntityUploadURL(): Promise<string> {
    const objectId = randomUUID();
    const objectKey = `uploads/${objectId}`;

    const command = new PutObjectCommand({
      Bucket: this.privateBucket,
      Key: objectKey,
    });

    const uploadURL = await getSignedUrl(r2Client, command, { expiresIn: 900 });
    return uploadURL;
  }

  /**
   * Normalizes a full S3/R2 presigned or object URL into a relative object path `/objects/uploads/xxx`.
   */
  normalizeObjectEntityPath(rawPath: string): string {
    try {
      const url = new URL(rawPath);
      const pathSegments = url.pathname.slice(1).split("/");
      const uploadsIndex = pathSegments.indexOf("uploads");
      if (uploadsIndex !== -1) {
        return `/objects/${pathSegments.slice(uploadsIndex).join("/")}`;
      }
      return url.pathname;
    } catch {
      if (rawPath.startsWith("/objects/")) return rawPath;
      return rawPath;
    }
  }

  /**
   * Generates a signed read URL for private object access.
   */
  async getSignedReadUrl(objectPath: string, ttlSec: number = 300): Promise<string> {
    const objectKey = this.extractKeyFromObjectPath(objectPath);
    const command = new GetObjectCommand({
      Bucket: this.privateBucket,
      Key: objectKey,
    });

    return await getSignedUrl(r2Client, command, { expiresIn: ttlSec });
  }

  /**
   * Downloads or fetches an object from R2 and converts it to a standard Response object.
   */
  async getObjectEntityFile(objectPath: string): Promise<any> {
    const objectKey = this.extractKeyFromObjectPath(objectPath);
    try {
      const command = new HeadObjectCommand({
        Bucket: this.privateBucket,
        Key: objectKey,
      });
      const response = await r2Client.send(command);
      return {
        key: objectKey,
        name: objectKey,
        metadata: response.Metadata,
      };
    } catch (err: any) {
      if (err.name === "NotFound" || err.$metadata?.httpStatusCode === 404) {
        throw new ObjectNotFoundError();
      }
      throw err;
    }
  }

  private extractKeyFromObjectPath(objectPath: string): string {
    if (!objectPath.startsWith("/objects/")) {
      throw new ObjectNotFoundError();
    }
    return objectPath.slice("/objects/".length);
  }

  async downloadObject(file: any, cacheTtlSec: number = 3600): Promise<Response> {
    const key = typeof file === "string" ? file : file.key || file.name;
    const bucket = file.bucket || this.privateBucket;
    return this.downloadObjectByKey(bucket, key, cacheTtlSec);
  }

  /**
   * Downloads object stream from R2 as standard Response object.
   */
  async downloadObjectByKey(bucket: string, key: string, cacheTtlSec: number = 3600): Promise<Response> {
    try {
      const command = new GetObjectCommand({
        Bucket: bucket,
        Key: key,
      });
      const response = await r2Client.send(command);

      const headers: Record<string, string> = {
        "Content-Type": response.ContentType || "application/octet-stream",
        "Cache-Control": `public, max-age=${cacheTtlSec}`,
      };
      if (response.ContentLength) {
        headers["Content-Length"] = String(response.ContentLength);
      }

      const stream = response.Body as Readable;
      const webStream = Readable.toWeb(stream) as ReadableStream;

      return new Response(webStream, { headers });
    } catch (err: any) {
      if (err.name === "NotFound" || err.$metadata?.httpStatusCode === 404) {
        throw new ObjectNotFoundError();
      }
      throw err;
    }
  }

  async searchPublicObject(filePath: string): Promise<any | null> {
    try {
      const command = new HeadObjectCommand({
        Bucket: this.publicBucket,
        Key: filePath,
      });
      await r2Client.send(command);
      return { bucket: this.publicBucket, key: filePath, name: filePath };
    } catch {
      return null;
    }
  }

  /**
   * ACL Permission Check helper for private objects in R2
   */
  async canAccessObjectEntity({
    userId,
    objectFile,
    requestedPermission,
  }: {
    userId?: string;
    objectFile: any;
    requestedPermission?: string;
  }): Promise<boolean> {
    if (!userId) return false;
    const aclPolicyStr = objectFile.metadata?.["custom:aclpolicy"] || objectFile.metadata?.["custom-aclpolicy"];
    if (!aclPolicyStr) {
      return true;
    }
    try {
      const policy: ObjectAclPolicy = JSON.parse(aclPolicyStr);
      return policy.owner === userId || policy.visibility === "public";
    } catch {
      return true;
    }
  }

  /**
   * Try setting custom ACL policy metadata on an object path
   */
  async trySetObjectEntityAclPolicy(
    objectPath: string,
    aclPolicy: { owner: string; visibility: "public" | "private" }
  ): Promise<boolean> {
    if (!objectPath || !objectPath.startsWith("/objects/")) return false;
    try {
      const objectKey = this.extractKeyFromObjectPath(objectPath);
      const command = new PutObjectCommand({
        Bucket: this.privateBucket,
        Key: objectKey,
        Metadata: {
          "custom:aclpolicy": JSON.stringify(aclPolicy),
        },
      });
      await r2Client.send(command);
      return true;
    } catch {
      return false;
    }
  }

  private saveFileToLocalUploads(relativeImagePath: string, data: Buffer): void {
    const candidateDirs = [
      path.resolve(process.cwd(), "public/uploads"),
      path.resolve(process.cwd(), "artifacts/api-server/public/uploads"),
      path.resolve(__dirname, "../../../public/uploads"),
      path.resolve(__dirname, "../../public/uploads"),
    ];

    for (const dir of candidateDirs) {
      try {
        const targetPath = path.join(dir, relativeImagePath);
        fs.mkdirSync(path.dirname(targetPath), { recursive: true });
        fs.writeFileSync(targetPath, data);
      } catch (fsErr) {
        // Silently continue to next candidate directory
      }
    }
  }

  /**
   * Uploads public product image with multi-tier persistence (R2 + MongoDB + Local Disk).
   */
  async uploadPublicProductImage(
    data: Buffer,
    ext: string,
    contentType: string,
    vendorId: string
  ): Promise<{ publicRelPath: string }> {
    const imageId = `${Date.now()}-${randomUUID().slice(0, 8)}`;
    const relativeImagePath = `product-images/${imageId}.${ext}`;

    const accountId = process.env.R2_ACCOUNT_ID || process.env.CLOUDFLARE_ACCOUNT_ID;
    const accessKeyId = process.env.R2_ACCESS_KEY_ID || process.env.CLOUDFLARE_GLOBAL_API_KEY;
    if (accountId && accessKeyId) {
      try {
        const command = new PutObjectCommand({
          Bucket: this.publicBucket,
          Key: relativeImagePath,
          Body: data,
          ContentType: contentType,
          Metadata: { vendorid: vendorId },
        });
        await r2Client.send(command);
      } catch (err: any) {
        console.warn("[ObjectStorage] R2 product image upload skipped or failed:", err?.message || err);
      }
    }

    const publicRelPath = this.publicDomain
      ? `${this.publicDomain}/${relativeImagePath}`
      : `/api/storage/public-objects/${relativeImagePath}`;

    try {
      await mongoR2Assets.saveAsset({
        objectKey: relativeImagePath,
        bucket: this.publicBucket,
        publicUrl: publicRelPath,
        sellerId: vendorId,
        assetType: "product_image",
        fileName: `${imageId}.${ext}`,
        contentType,
        size: data.length,
        status: "uploaded",
        bufferBase64: data.toString("base64"),
      });
    } catch {}

    this.saveFileToLocalUploads(relativeImagePath, data);

    return { publicRelPath };
  }

  /**
   * Deletes a public product image from Cloudflare R2 if vendorId matches ownership metadata.
   */
  async deletePublicProductImage(publicRelPath: string, vendorId: string): Promise<boolean> {
    const prefix = "/api/storage/public-objects/product-images/";
    let relativeImagePath = publicRelPath;

    if (publicRelPath.startsWith(prefix)) {
      relativeImagePath = publicRelPath.slice("/api/storage/public-objects/".length);
    } else if (this.publicDomain && publicRelPath.startsWith(this.publicDomain)) {
      relativeImagePath = publicRelPath.slice(this.publicDomain.length).replace(/^\//, "");
    }

    if (!relativeImagePath || relativeImagePath.includes("..") || !/^product-images\/[0-9a-f-]+\.(jpg|png|webp|gif)$/.test(relativeImagePath)) {
      return false;
    }

    try {
      const headCmd = new HeadObjectCommand({
        Bucket: this.publicBucket,
        Key: relativeImagePath,
      });
      const metadataRes = await r2Client.send(headCmd);
      if (metadataRes.Metadata?.vendorid !== vendorId) {
        return false;
      }

      const deleteCmd = new DeleteObjectCommand({
        Bucket: this.publicBucket,
        Key: relativeImagePath,
      });
      await r2Client.send(deleteCmd);
      await mongoR2Assets.markDeleted(relativeImagePath).catch(() => {});
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Uploads public hero image to R2 with MongoDB Atlas & local disk fallback.
   */
  async uploadPublicHeroImage(
    data: Buffer,
    ext: string,
    contentType: string
  ): Promise<{ publicRelPath: string }> {
    const imageId = `${Date.now()}-${randomUUID().slice(0, 8)}`;
    const relativeImagePath = `hero-banners/${imageId}.${ext}`;

    const accountId = process.env.R2_ACCOUNT_ID || process.env.CLOUDFLARE_ACCOUNT_ID;
    const accessKeyId = process.env.R2_ACCESS_KEY_ID || process.env.CLOUDFLARE_GLOBAL_API_KEY;
    if (accountId && accessKeyId) {
      try {
        const command = new PutObjectCommand({
          Bucket: this.publicBucket,
          Key: relativeImagePath,
          Body: data,
          ContentType: contentType,
        });
        await r2Client.send(command);
      } catch (err: any) {
        console.warn("[ObjectStorage] R2 hero image upload skipped or failed:", err?.message || err);
      }
    }

    const publicRelPath = this.publicDomain
      ? `${this.publicDomain}/${relativeImagePath}`
      : `/api/storage/public-objects/${relativeImagePath}`;

    try {
      await mongoR2Assets.saveAsset({
        objectKey: relativeImagePath,
        bucket: this.publicBucket,
        publicUrl: publicRelPath,
        sellerId: "admin",
        assetType: "hero_banner",
        fileName: `${imageId}.${ext}`,
        contentType,
        size: data.length,
        status: "uploaded",
        bufferBase64: data.toString("base64"),
      });
    } catch {}

    this.saveFileToLocalUploads(relativeImagePath, data);

    return { publicRelPath };
  }

  /**
   * Uploads public vendor store avatar image to R2 with MongoDB Atlas & local disk fallback.
   */
  async uploadPublicAvatarImage(
    data: Buffer,
    ext: string,
    contentType: string
  ): Promise<{ publicRelPath: string }> {
    const imageId = `${Date.now()}-${randomUUID().slice(0, 8)}`;
    const relativeImagePath = `vendor-avatars/${imageId}.${ext}`;

    const accountId = process.env.R2_ACCOUNT_ID || process.env.CLOUDFLARE_ACCOUNT_ID;
    const accessKeyId = process.env.R2_ACCESS_KEY_ID || process.env.CLOUDFLARE_GLOBAL_API_KEY;
    if (accountId && accessKeyId) {
      try {
        const command = new PutObjectCommand({
          Bucket: this.publicBucket,
          Key: relativeImagePath,
          Body: data,
          ContentType: contentType,
        });
        await r2Client.send(command);
      } catch (err: any) {
        console.warn("[ObjectStorage] R2 avatar upload skipped or failed:", err?.message || err);
      }
    }

    const publicRelPath = this.publicDomain
      ? `${this.publicDomain}/${relativeImagePath}`
      : `/api/storage/public-objects/${relativeImagePath}`;

    try {
      await mongoR2Assets.saveAsset({
        objectKey: relativeImagePath,
        bucket: this.publicBucket,
        publicUrl: publicRelPath,
        sellerId: "admin",
        assetType: "vendor_avatar",
        fileName: `${imageId}.${ext}`,
        contentType,
        size: data.length,
        status: "uploaded",
        bufferBase64: data.toString("base64"),
      });
    } catch {}

    this.saveFileToLocalUploads(relativeImagePath, data);

    return { publicRelPath };
  }

  /**
   * Uploads public advertisement image to R2 with MongoDB Atlas & local disk fallback.
   */
  async uploadPublicAdvertisementImage(
    data: Buffer,
    ext: string,
    contentType: string
  ): Promise<{ publicRelPath: string; objectKey: string; fileName: string; size: number }> {
    const imageId = `${Date.now()}-${randomUUID().slice(0, 8)}`;
    const fileName = `${imageId}.${ext}`;
    const relativeImagePath = `advertisements/${fileName}`;

    const accountId = process.env.R2_ACCOUNT_ID || process.env.CLOUDFLARE_ACCOUNT_ID;
    const accessKeyId = process.env.R2_ACCESS_KEY_ID || process.env.CLOUDFLARE_GLOBAL_API_KEY;
    const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;

    if (accountId && accessKeyId && secretAccessKey) {
      try {
        const client = getR2Client();
        const command = new PutObjectCommand({
          Bucket: this.publicBucket,
          Key: relativeImagePath,
          Body: data,
          ContentType: contentType,
        });
        await client.send(command);
      } catch (err: any) {
        console.error("[ObjectStorage] Cloudflare R2 advertisement upload failed:", err?.message || err);
        throw new Error(`Cloudflare R2 storage upload failed: ${err?.message || "Storage error"}`);
      }
    }

    const publicRelPath = this.publicDomain
      ? `${this.publicDomain}/${relativeImagePath}`
      : `/api/storage/public-objects/${relativeImagePath}`;

    try {
      await mongoR2Assets.saveAsset({
        objectKey: relativeImagePath,
        bucket: this.publicBucket,
        publicUrl: publicRelPath,
        sellerId: "admin",
        assetType: "advertisement_image",
        fileName,
        contentType,
        size: data.length,
        status: "uploaded",
        bufferBase64: data.toString("base64"),
      });
    } catch (dbErr: any) {
      console.warn("[ObjectStorage] MongoDB asset save notice:", dbErr?.message || dbErr);
    }

    this.saveFileToLocalUploads(relativeImagePath, data);

    return { publicRelPath, objectKey: relativeImagePath, fileName, size: data.length };
  }
}

