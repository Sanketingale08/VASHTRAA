import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { TaxBreakdownAccordion } from "../pages/Checkout";
import type { CartItem } from "../context/CartContext";

describe("TaxBreakdownAccordion Component", () => {
  const sampleItems: CartItem[] = [
    {
      id: "prod-1000",
      productId: "prod-1000",
      name: "Chanderi Silk Saree",
      price: 1155,
      basePrice: 1000,
      shippingFee: 100,
      quantity: 1,
      vendorName: "Heritage Weaves",
      images: ["/images/product-1.png"],
      stock: 10,
      category: "chanderi",
    },
  ];

  it("renders collapsed initially with Tax breakdown header", () => {
    render(<TaxBreakdownAccordion items={sampleItems} />);

    expect(screen.getByText(/Tax breakdown/i)).toBeDefined();
    expect(screen.getByText(/Show details ▼/i)).toBeDefined();
    expect(screen.queryByText(/Base price/i)).toBeNull();
  });

  it("expands on click and displays exact informational tax breakdown for Rs1,000 base price", () => {
    render(<TaxBreakdownAccordion items={sampleItems} />);

    const button = screen.getByRole("button", { name: /Tax breakdown/i });
    fireEvent.click(button);

    expect(screen.getByText(/Hide ▲/i)).toBeDefined();
    expect(screen.getByText(/Base price/i)).toBeDefined();
    expect(screen.getByText("₹1000.00")).toBeDefined();
    expect(screen.getByText(/Shipping/i)).toBeDefined();
    expect(screen.getByText("₹100.00")).toBeDefined();
    expect(screen.getByText(/Taxable amount/i)).toBeDefined();
    expect(screen.getByText("₹1100.00")).toBeDefined();
    expect(screen.getByText(/CGST 2.5%/i)).toBeDefined();
    expect(screen.getByText("₹55.00")).toBeDefined();
    expect(screen.getByText("₹1155.00")).toBeDefined();
  });
});
