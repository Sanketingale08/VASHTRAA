import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PRODUCT_IMAGE_FALLBACK } from "@/lib/productImages";

vi.mock("@clerk/react", () => ({
  useUser: () => ({ isSignedIn: true }),
}));

vi.mock("@/context/WishlistContext", () => ({
  useWishlist: () => ({ wishlistedIds: new Set(), toggle: vi.fn() }),
}));

vi.mock("@/context/CartContext", () => ({
  useCart: () => ({ addItem: vi.fn() }),
}));

import { QuickViewModal } from "./QuickViewModal";

describe("QuickViewModal product image fallback", () => {
  it("normalizes a legacy storage path and replaces a failed image", () => {
    render(
      <QuickViewModal
        product={{
          id: "product-1",
          name: "Paithani Saree",
          price: 12000,
          category: "paithani",
          vendorName: "TwirlDrape",
          images: ["product-images/legacy-saree.jpg"],
          stock: 4,
        } as any}
        onClose={vi.fn()}
      />,
    );

    const image = screen.getByAltText("Paithani Saree");
    expect(image).toHaveAttribute(
      "src",
      "/api/storage/public-objects/product-images/legacy-saree.jpg",
    );

    fireEvent.error(image);
    expect(image).toHaveAttribute("src", PRODUCT_IMAGE_FALLBACK);
  });
});