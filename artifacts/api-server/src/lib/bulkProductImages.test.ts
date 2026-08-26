import { describe, expect, it } from "vitest";
import { validateProductImageUpload } from "./bulkProductImages";

describe("validateProductImageUpload", () => {
  it("accepts supported image bytes and normalizes JPEG extensions", () => {
    expect(validateProductImageUpload(
      Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
      "image/jpeg",
    )).toEqual({ ok: true, ext: "jpg" });
    expect(validateProductImageUpload(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      "image/png",
    )).toEqual({ ok: true, ext: "png" });
  });

  it("rejects unsupported types and renamed non-image data", () => {
    expect(validateProductImageUpload(Buffer.from("not an image"), "image/jpeg")).toMatchObject({
      ok: false,
      error: "The file contents do not match its image type",
    });
    expect(validateProductImageUpload(Buffer.from("document"), "application/pdf")).toMatchObject({
      ok: false,
      error: "Only JPG, PNG, WEBP, or GIF image files are allowed",
    });
  });
});