import { describe, expect, it } from "vitest";
import {
  getProductImageSrc,
  PRODUCT_IMAGE_FALLBACK,
  replaceProductImageWithFallback,
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

  it("replaces a failed image source once without an error loop", () => {
    const image = document.createElement("img");
    image.setAttribute("src", "https://cdn.example.com/missing.jpg");

    replaceProductImageWithFallback({ currentTarget: image } as any);
    expect(image.getAttribute("src")).toBe(PRODUCT_IMAGE_FALLBACK);

    replaceProductImageWithFallback({ currentTarget: image } as any);
    expect(image.getAttribute("src")).toBe(PRODUCT_IMAGE_FALLBACK);
  });
});