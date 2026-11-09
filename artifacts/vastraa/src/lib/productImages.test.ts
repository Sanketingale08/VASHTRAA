import { describe, expect, it } from "vitest";
import {
  getProductImageSrc,
  PRODUCT_IMAGE_FALLBACK,
  replaceProductImageWithFallback,
  appendImageVersion,
} from "./productImages";

describe("product image sources", () => {
  it("preserves direct URLs and normalizes public object-storage paths", () => {
    expect(getProductImageSrc(" https://cdn.example.com/saree.webp ")).toBe("https://cdn.example.com/saree.webp");
    expect(getProductImageSrc("/api/storage/public-objects/product-images/saree.jpg")).toBe(
      "/api/storage/public-objects/product-images/saree.jpg",
    );
    expect(getProductImageSrc("product-images/saree.jpg")).toBe(
      "/api/storage/public-objects/product-images/saree.jpg",
    );
    expect(getProductImageSrc("public/products/seller_1/draft/lehenga.webp")).toBe(
      "/api/storage/public-objects/public/products/seller_1/draft/lehenga.webp",
    );
    expect(getProductImageSrc("/images/product-1.png")).toBe("/images/product-1.png");
  });

  it("uses the product fallback for empty image values", () => {
    expect(getProductImageSrc()).toBe(PRODUCT_IMAGE_FALLBACK);
    expect(getProductImageSrc("   ")).toBe(PRODUCT_IMAGE_FALLBACK);
  });

  it("appends cache-busting version parameters to bust stale browser/CDN caching", () => {
    expect(getProductImageSrc("/images/categories/paithani.jpg", 1730000000)).toBe(
      "/images/categories/paithani.jpg?v=1730000000"
    );
    expect(getProductImageSrc("https://cdn.example.com/saree.webp", "v2")).toBe(
      "https://cdn.example.com/saree.webp?v=v2"
    );
    const testDate = new Date("2026-11-09T12:00:00Z");
    expect(getProductImageSrc("/images/product-1.png", testDate)).toBe(
      `/images/product-1.png?v=${testDate.getTime()}`
    );
  });

  it("updates existing version query parameters when new version is provided", () => {
    expect(appendImageVersion("https://cdn.example.com/pic.jpg?v=100", 200)).toBe(
      "https://cdn.example.com/pic.jpg?v=200"
    );
  });

  it("does not append version to data: or blob: URIs", () => {
    expect(getProductImageSrc("data:image/png;base64,abc", 123)).toBe("data:image/png;base64,abc");
    expect(getProductImageSrc("blob:http://localhost/123", 123)).toBe("blob:http://localhost/123");
  });

  it("replaces a failed image source once without an error loop", () => {
    const image = document.createElement("img");
    image.setAttribute("src", "https://cdn.example.com/missing.jpg");

    replaceProductImageWithFallback({ currentTarget: image } as any);
    expect(image.getAttribute("src")).toBe(PRODUCT_IMAGE_FALLBACK);

    replaceProductImageWithFallback({ currentTarget: image } as any);
    expect(image.getAttribute("src")).toBe(PRODUCT_IMAGE_FALLBACK);
  });
});
