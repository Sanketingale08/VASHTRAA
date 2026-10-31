import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { CheckoutPage } from "./Checkout";

// Mock wouter
const mockSetLocation = vi.fn();
vi.mock("wouter", () => ({
  useLocation: () => ["/checkout", mockSetLocation],
  Link: ({ children, href, className }: any) => <a href={href} className={className}>{children}</a>,
}));

vi.mock("@/components/Layout", () => ({
  Layout: ({ children }: any) => <div data-testid="layout">{children}</div>,
}));

vi.mock("@clerk/react", () => ({
  useUser: () => ({ user: null, isSignedIn: false }),
  useClerk: () => ({ signOut: vi.fn() }),
}));

// Mock AuthContext
const mockUser = {
  id: "test_customer_123",
  name: "Priya Sharma",
  email: "priya@example.com",
  role: "customer" as const,
};

vi.mock("@/context/AuthContext", () => ({
  useAuth: () => ({
    user: mockUser,
    isSignedIn: true,
    isLoading: false,
    isLoaded: true,
  }),
}));

// Mock CartContext
const mockCartItems = [
  {
    productId: "prod_001",
    name: "Pure Silk Paithani Saree",
    price: 2760,
    originalPrice: 3500,
    quantity: 1,
    images: ["/images/paithani-1.jpg"],
    vendorName: "Yeola Weavers",
    category: "paithani",
    inStock: true,
    stock: 5,
  },
];

const mockClearCart = vi.fn().mockResolvedValue(undefined);

vi.mock("@/context/CartContext", () => ({
  useCart: () => ({
    items: mockCartItems,
    clearCart: mockClearCart,
    refreshStock: vi.fn().mockResolvedValue(true),
  }),
}));

// Mock toast
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({
    toast: vi.fn(),
  }),
}));

// Mock apiFetch
const mockApiFetch = vi.fn();
vi.mock("@/lib/api", () => ({
  apiFetch: (...args: any[]) => mockApiFetch(...args),
}));

describe("Redesigned Checkout Payment UI & Pay Now Functionality", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    localStorage.clear();
    localStorage.setItem("vastraa_auth_token", "test_token_123");

    // Default mock responses
    mockApiFetch.mockImplementation(async (url: string) => {
      if (url === "/api/addresses") {
        return {
          ok: true,
          json: async () => ({
            addresses: [
              {
                id: "addr_1",
                name: "Priya Sharma",
                phone: "9876543210",
                line1: "Flat 402, Lotus Tower",
                line2: "Linking Road",
                city: "Mumbai",
                state: "Maharashtra",
                pincode: "400050",
                isDefault: true,
              },
            ],
          }),
        };
      }
      if (url === "/api/payment-methods") {
        return {
          ok: true,
          json: async () => ({ paymentMethods: [] }),
        };
      }
      if (url === "/api/orders") {
        return {
          ok: true,
          json: async () => ({
            success: true,
            orderId: "ORD_VASTRAA_991823",
            order: { id: "ORD_VASTRAA_991823", status: "confirmed", paymentStatus: "unpaid" },
          }),
        };
      }
      return { ok: true, json: async () => ({}) };
    });
  });

  it("1. Renders the redesigned Delivery Method and Payment Method sections on review step", async () => {
    render(<CheckoutPage />);

    // Wait for saved addresses to load
    await waitFor(() => {
      expect(screen.getByText("Shipping Address")).toBeInTheDocument();
    });

    // Advance to Step 2 (Delivery)
    const continueBtn = screen.getByText(/Continue to Delivery/i);
    fireEvent.click(continueBtn);

    // Advance to Step 3 (Payment)
    await waitFor(() => {
      expect(screen.getByText(/Continue to Payment/i)).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText(/Continue to Payment/i));

    await waitFor(() => {
      expect(screen.getByText("Cash on Delivery")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("Cash on Delivery"));
    fireEvent.click(screen.getByText("Review Order"));

    // Verify Step 4: Redesigned Delivery Method Section
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /Delivery Method/i })).toBeInTheDocument();
    });

    expect(screen.getByText("Standard (7 Days)")).toBeInTheDocument();
    expect(screen.getByText(/Est\. delivery by/i)).toBeInTheDocument();
    // Dynamic delivery date (Tuesday, 3 November 2026 based on 7 business days from Oct 23, 2026)
    expect(screen.getByText(/November 2026/i)).toBeInTheDocument();

    // Verify Step 4: Redesigned Payment Method Section
    expect(screen.getByRole("heading", { name: /Payment Method/i })).toBeInTheDocument();
    expect(screen.getByText(/100% Secure Checkout/i)).toBeInTheDocument();

    // Verify Prominent Pay Now button exists with VASTRAA brand navy styling
    const payNowBtn = screen.getByRole("button", { name: /Pay Now/i });
    expect(payNowBtn).toBeInTheDocument();
    expect(payNowBtn.className).toContain("bg-[#0A1F44]");

    // Verify Information Panel with actual dynamic total
    const infoPanelText = screen.getByText(/Amount due on delivery:/i);
    expect(infoPanelText).toBeInTheDocument();
    expect(infoPanelText).toHaveTextContent("₹2,790"); // 2,760 item + 20 platform fee + 10 COD fee
    expect(infoPanelText).toHaveTextContent("Payment will be collected when the order is delivered.");
  });

  it("2. Pay Now button successfully places COD order without opening Cashfree", async () => {
    render(<CheckoutPage />);

    await waitFor(() => {
      expect(screen.getByText("Shipping Address")).toBeInTheDocument();
    });

    // Advance to review step
    fireEvent.click(screen.getByText(/Continue to Delivery/i));
    await waitFor(() => fireEvent.click(screen.getByText(/Continue to Payment/i)));
    await waitFor(() => fireEvent.click(screen.getByText("Cash on Delivery")));
    fireEvent.click(screen.getByText("Review Order"));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Pay Now/i })).toBeInTheDocument();
    });

    const payNowBtn = screen.getByRole("button", { name: /Pay Now/i });
    fireEvent.click(payNowBtn);

    // Verify order was submitted to backend /api/orders with paymentMethod cod
    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith(
        "/api/orders",
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining('"paymentMethod":"cod"'),
        })
      );
    });

    // Verify cart was cleared after successful order
    expect(mockClearCart).toHaveBeenCalledTimes(1);

    // Verify navigated to confirmation page
    expect(mockSetLocation).toHaveBeenCalledWith("/orders/ORD_VASTRAA_991823");
  });

  it("3. Toggling to UPI / Online switches the active payment card and displays gateway info", async () => {
    render(<CheckoutPage />);

    await waitFor(() => {
      expect(screen.getByText("Shipping Address")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText(/Continue to Delivery/i));
    await waitFor(() => fireEvent.click(screen.getByText(/Continue to Payment/i)));
    await waitFor(() => fireEvent.click(screen.getByText("Cash on Delivery")));
    fireEvent.click(screen.getByText("Review Order"));

    await waitFor(() => {
      expect(screen.getByText("UPI / Online")).toBeInTheDocument();
    });

    // Click UPI / Online toggle
    fireEvent.click(screen.getByText("UPI / Online"));

    // Verify online card is rendered with input and gateway info
    await waitFor(() => {
      expect(screen.getByText(/Enter UPI ID \/ VPA/i)).toBeInTheDocument();
      expect(screen.getByText(/Secure payment processed through Cashfree Gateway/i)).toBeInTheDocument();
    });
  });
});
