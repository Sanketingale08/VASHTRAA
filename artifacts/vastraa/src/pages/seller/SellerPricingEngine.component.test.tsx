import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { LiveEarningsEstimator } from "./SellerProductForm";

// Stub Clerk & API fetch
vi.mock("@clerk/react", () => ({
  useUser: () => ({ user: null, isLoaded: true }),
  useAuth: () => ({ getToken: async () => "tok" }),
  SignedIn: ({ children }: any) => children,
  SignedOut: ({ children }: any) => children,
}));

vi.mock("@/lib/api", () => ({
  getApiUrl: (p: string) => p,
  apiFetch: vi.fn().mockImplementation(async (url: string) => {
    if (url.includes("/pricing/quote")) {
      return {
        ok: true,
        json: async () => ({
          success: true,
          rupees: {
            sellerBasePrice: 1000,
            platformCommission: 180,
            shippingFee: 100,
            taxableAmount: 1100,
            gstAmount: 55,
            cgst: 27.5,
            sgst: 27.5,
            igst: 0,
            customerPays: 1155,
            gstOnCommission: 9,
            tcsDeduction: 10,
            sellerSettlement: 801,
          },
        }),
      };
    }
    return { ok: false, json: async () => ({}) };
  }),
  getStoredToken: () => "test-token",
}));

describe("Phase 3 UI Components - Live Earnings Estimator", () => {
  it("renders clean empty state for empty or zero input without NaN", () => {
    const { rerender } = render(<LiveEarningsEstimator priceInput="" />);
    expect(screen.getByTestId("earnings-empty-state")).toBeDefined();
    expect(screen.queryByText(/NaN/i)).toBeNull();

    rerender(<LiveEarningsEstimator priceInput="0" />);
    expect(screen.getByTestId("earnings-empty-state")).toBeDefined();
    expect(screen.queryByText(/NaN/i)).toBeNull();
  });

  it("calculates and displays exact values for ₹1000 base price", async () => {
    render(<LiveEarningsEstimator priceInput="1000" />);

    await waitFor(() => {
      expect(screen.getByTestId("est-base-price").textContent).toContain("₹1,000.00");
      expect(screen.getByTestId("est-commission").textContent).toContain("₹180.00");
      expect(screen.getByTestId("est-shipping").textContent).toContain("₹100.00");
      expect(screen.getByTestId("est-taxable").textContent).toContain("₹1,100.00");
      expect(screen.getByTestId("est-customer-pays").textContent).toContain("₹1,155.00");
      expect(screen.getByTestId("est-net-settlement").textContent).toContain("₹801.00");
    });
  });
});
