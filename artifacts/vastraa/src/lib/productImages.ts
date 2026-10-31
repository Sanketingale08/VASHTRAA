import type { SyntheticEvent } from "react";

export const PRODUCT_IMAGE_FALLBACK = "/images/product-1.png";

/**
 * Resolves the public object-storage path returned by the individual uploader and
 * keeps previously stored direct URLs browser-loadable. Bulk imports are
 * normalized on the server, but this also makes legacy product records safe.
 */
export function getProductImageSrc(image?: string | null): string {
  const value = image?.trim();
  if (!value) return PRODUCT_IMAGE_FALLBACK;
  if (
    value.startsWith("http://") ||
    value.startsWith("https://") ||
    value.startsWith("data:") ||
    value.startsWith("blob:")
  ) {
    return value;
  }
  if (value.startsWith("/api/storage/public-objects/")) return value;
  if (value.startsWith("api/storage/public-objects/")) return `/${value}`;
  if (value.startsWith("/storage/public-objects/")) return `/api${value}`;
  if (value.startsWith("storage/public-objects/")) return `/api/${value}`;

  // Preserve local static frontend assets
  if (
    value.startsWith("/images/") ||
    value.startsWith("/assets/") ||
    value.startsWith("/favicon") ||
    value.startsWith("/placeholder")
  ) {
    return value;
  }

  // Cloudflare R2 object key (e.g. public/products/..., product-images/..., etc.)
  const cleanKey = value.startsWith("/") ? value.slice(1) : value;
  return `/api/storage/public-objects/${cleanKey}`;
}

export function replaceProductImageWithFallback(event: SyntheticEvent<HTMLImageElement>): void {
  const image = event.currentTarget;
  if (image.getAttribute("src") !== PRODUCT_IMAGE_FALLBACK) {
    image.setAttribute("src", PRODUCT_IMAGE_FALLBACK);
  }
}