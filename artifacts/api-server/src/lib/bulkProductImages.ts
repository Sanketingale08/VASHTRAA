export type BulkImageNormalizationResult =
  | { ok: true; images: string[] }
  | { ok: false; error: string };

const PUBLIC_PRODUCT_IMAGE_PATH = "/api/storage/public-objects/";
const BLOCKED_IMAGE_HOSTS = new Set([
  "pinterest.com",
  "pin.it",
  "instagram.com",
  "facebook.com",
  "youtube.com",
  "tiktok.com",
]);
const DIRECT_IMAGE_EXTENSION = /\.(?:avif|bmp|gif|heic|jpeg|jpg|png|svg|webp)$/i;
const IMAGE_DELIVERY_HOSTS = [
  "images.unsplash.com",
  "source.unsplash.com",
  "res.cloudinary.com",
  "images.ctfassets.net",
  "cdn.sanity.io",
];

function isBlockedPageHost(hostname: string): boolean {
  return [...BLOCKED_IMAGE_HOSTS].some(
    (host) => hostname === host || hostname.endsWith(`.${host}`),
  );
}

function isClearlyAPageOrShareLink(url: URL): boolean {
  if (isBlockedPageHost(url.hostname.toLowerCase())) return true;

  return /\/(?:pin|share|post|posts|status|watch)(?:\/|$)/i.test(url.pathname);
}

function isKnownImageDeliveryHost(hostname: string): boolean {
  return IMAGE_DELIVERY_HOSTS.some(
    (host) => hostname === host || hostname.endsWith(`.${host}`),
  );
}

function hasPathTraversal(value: string): boolean {
  return value.split(/[/?#]/).some((segment) => segment === "..");
}

/**
 * Converts bulk spreadsheet image values into the public URL shape understood by
 * browsers. This deliberately validates only the input contract; it never fetches
 * remote URLs during an import.
 */
function normalizeBulkProductImage(value: string): string | null {
  if (hasPathTraversal(value)) return null;

  if (value.startsWith(PUBLIC_PRODUCT_IMAGE_PATH)) return value;
  if (value.startsWith(PUBLIC_PRODUCT_IMAGE_PATH.slice(1))) return `/${value}`;

  // A seller may paste the object-storage relative name returned by an existing
  // upload/export instead of the API path. Keep it compatible with image uploads.
  if (value.startsWith("product-images/")) return `${PUBLIC_PRODUCT_IMAGE_PATH}${value}`;
  if (value.startsWith("/product-images/")) return `${PUBLIC_PRODUCT_IMAGE_PATH}${value.slice(1)}`;

  // Existing static images are valid browser paths as well.
  if (value.startsWith("/images/")) return value;
  if (value.startsWith("images/")) return `/${value}`;

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (isClearlyAPageOrShareLink(url)) return null;
  if (!DIRECT_IMAGE_EXTENSION.test(url.pathname) && !isKnownImageDeliveryHost(url.hostname.toLowerCase())) {
    return null;
  }
  return url.toString();
}

/**
 * Normalizes a pipe-separated Images cell for either bulk-import endpoint.
 *
 * An omitted image cell remains valid because product images are optional. Once a
 * value is supplied, every pipe-separated entry must be a direct browser-loadable
 * image URL or a supported public image path; partial lists are not persisted.
 */
export function normalizeBulkProductImages(rawValue: unknown): BulkImageNormalizationResult {
  if (rawValue == null || String(rawValue).trim() === "") {
    return { ok: true, images: [] };
  }

  const values = String(rawValue).split("|");
  if (values.some((value) => value.trim() === "")) {
    return { ok: false, error: "Images cannot contain blank entries" };
  }

  const images: string[] = [];
  for (const rawImage of values) {
    const image = normalizeBulkProductImage(rawImage.trim());
    if (!image) {
      return {
        ok: false,
        error: "Use direct http(s) image URLs or public product image paths, not page/share links",
      };
    }
    images.push(image);
  }

  return { ok: true, images };
}