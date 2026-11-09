import type { SyntheticEvent } from "react";

export const PRODUCT_IMAGE_FALLBACK = "/images/product-1.png";

/**
 * Appends a cache-busting version parameter (?v=...) to an image URL.
 * Preserves data: and blob: URIs without appending query parameters.
 */
export function appendImageVersion(url: string, version?: string | number | Date | null): string {
  if (!url || !version) return url;
  if (url.startsWith("data:") || url.startsWith("blob:")) return url;

  const versionVal = version instanceof Date ? version.getTime() : String(version).trim();
  if (!versionVal) return url;

  // If URL already has ?v= or &v=, replace it with the latest version
  if (/[?&]v=[^&#]*/.test(url)) {
    return url.replace(/([?&]v=)[^&#]*/, `$1${encodeURIComponent(versionVal)}`);
  }

  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}v=${encodeURIComponent(versionVal)}`;
}

/**
 * Resolves the public object-storage path returned by the individual uploader and
 * keeps previously stored direct URLs browser-loadable. Bulk imports are
 * normalized on the server, but this also makes legacy product records safe.
 *
 * Supports an optional version timestamp / identifier (?v=...) to prevent stale
 * browser and CDN disk cache hits when images are updated.
 */
export function getProductImageSrc(
  image?: string | null,
  version?: string | number | Date | null
): string {
  const value = image?.trim();
  if (!value) return PRODUCT_IMAGE_FALLBACK;

  let resolvedUrl: string;

  if (
    value.startsWith("http://") ||
    value.startsWith("https://") ||
    value.startsWith("data:") ||
    value.startsWith("blob:")
  ) {
    resolvedUrl = value;
  } else if (value.startsWith("/api/storage/public-objects/")) {
    resolvedUrl = value;
  } else if (value.startsWith("api/storage/public-objects/")) {
    resolvedUrl = `/${value}`;
  } else if (value.startsWith("/storage/public-objects/")) {
    resolvedUrl = `/api${value}`;
  } else if (value.startsWith("storage/public-objects/")) {
    resolvedUrl = `/api/${value}`;
  } else if (
    value.startsWith("/images/") ||
    value.startsWith("/assets/") ||
    value.startsWith("/favicon") ||
    value.startsWith("/placeholder")
  ) {
    // Local static frontend assets
    resolvedUrl = value;
  } else {
    // Cloudflare R2 object key (e.g. public/products/..., product-images/..., categories/..., etc.)
    const cleanKey = value.startsWith("/") ? value.slice(1) : value;
    resolvedUrl = `/api/storage/public-objects/${cleanKey}`;
  }

  return appendImageVersion(resolvedUrl, version);
}

export function replaceProductImageWithFallback(event: SyntheticEvent<HTMLImageElement>): void {
  const image = event.currentTarget;
  if (image.getAttribute("src") !== PRODUCT_IMAGE_FALLBACK) {
    image.setAttribute("src", PRODUCT_IMAGE_FALLBACK);
  }
}
