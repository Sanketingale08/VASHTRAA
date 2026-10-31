import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";

beforeAll(() => {
  class MockIntersectionObserver {
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();
  }
  Object.defineProperty(window, "IntersectionObserver", {
    writable: true,
    configurable: true,
    value: MockIntersectionObserver,
  });
});

let mockSearchStr = "";
let mockCurrentPath = "/paithani";
const mockNavigate = vi.fn((url: string) => {
  const [p, qs] = url.split("?");
  mockCurrentPath = p;
  mockSearchStr = qs || "";
});

vi.mock("wouter", async () => {
  const actual = await vi.importActual("wouter");
  return {
    ...actual,
    useLocation: () => [mockCurrentPath, mockNavigate],
    useSearch: () => mockSearchStr,
    Link: ({ href, children, ...props }: any) => (
      <a href={href} {...props}>
        {children}
      </a>
    ),
  };
});

vi.mock("@/components/Layout", () => ({
  Layout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@clerk/react", () => ({
  useUser: () => ({ isSignedIn: true, user: { id: "test-user" } }),
  useClerk: () => ({ addListener: () => () => {} }),
}));

vi.mock("@/context/WishlistContext", () => ({
  useWishlist: () => ({ wishlistedIds: new Set(), toggle: vi.fn() }),
}));

vi.mock("@/context/CartContext", () => ({
  useCart: () => ({ addItem: vi.fn() }),
}));

const mockUseListProducts = vi.fn();
const mockUseListVendors = vi.fn().mockReturnValue({ data: [] });

vi.mock("@workspace/api-client-react", async () => {
  const actual = await vi.importActual("@workspace/api-client-react");
  return {
    ...actual,
    useListProducts: (params: any) => mockUseListProducts(params),
    useListVendors: () => mockUseListVendors(),
  };
});

vi.mock("@tanstack/react-query", async () => {
  const actual = await vi.importActual("@tanstack/react-query");
  return {
    ...actual,
    useQuery: () => ({ data: null }),
    useQueryClient: () => ({
      invalidateQueries: vi.fn(),
      setQueryData: vi.fn(),
    }),
  };
});

vi.mock("@/lib/api", () => ({
  apiFetch: vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }),
}));

import { ProductsListing } from "./ProductsListing";

describe("ProductsListing — Budget Filtering and Category Retention", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("applies both category=paithani and budget minPrice=0, maxPrice=1000 from URL", () => {
    mockCurrentPath = "/paithani";
    mockSearchStr = "category=paithani&minPrice=0&maxPrice=1000";

    const mockProducts = [
      {
        id: "prod-p1",
        name: "Classic Yeola Paithani Saree",
        price: 999,
        category: "paithani",
        vendorName: "Yeola Weavers",
        images: ["/test.jpg"],
        stock: 5,
        rating: 4.8,
      },
    ];

    mockUseListProducts.mockReturnValue({
      data: { products: mockProducts, total: 1, totalPages: 1 },
      isLoading: false,
    });

    render(<ProductsListing category="paithani" title="Paithani Sarees" />);

    // Verify params passed to useListProducts
    expect(mockUseListProducts).toHaveBeenCalledWith(
      expect.objectContaining({
        category: "paithani",
        minPrice: 0,
        maxPrice: 1000,
      })
    );

    // Verify product card is displayed
    expect(screen.getByText("Classic Yeola Paithani Saree")).toBeInTheDocument();

    // Verify Active Filter chip shows price range
    expect(screen.getByText(/Price: ₹0 – ₹1,000/i)).toBeInTheDocument();
  });

  it("clears budget when removing active price filter chip while preserving category=paithani", () => {
    mockCurrentPath = "/paithani";
    mockSearchStr = "category=paithani&minPrice=0&maxPrice=1000";

    mockUseListProducts.mockReturnValue({
      data: { products: [], total: 0, totalPages: 1 },
      isLoading: false,
    });

    render(<ProductsListing category="paithani" title="Paithani Sarees" />);

    // Click remove button on the active price filter chip
    const removePriceBtn = screen.getByRole("button", { name: /Remove Price: ₹0 – ₹1,000/i });
    fireEvent.click(removePriceBtn);

    // Navigation should preserve category=paithani without minPrice/maxPrice
    expect(mockNavigate).toHaveBeenCalled();
    const lastCall = mockNavigate.mock.calls[mockNavigate.mock.calls.length - 1][0];
    expect(lastCall).toContain("category=paithani");
    expect(lastCall).not.toContain("minPrice");
    expect(lastCall).not.toContain("maxPrice");
  });

  it("applies both category=designer and budget minPrice=2000, maxPrice=5000", () => {
    mockCurrentPath = "/designer";
    mockSearchStr = "category=designer&minPrice=2000&maxPrice=5000";

    const mockDesignerProducts = [
      {
        id: "prod-d1",
        name: "Contemporary Georgette Designer Saree",
        price: 3499,
        category: "designer",
        vendorName: "Couture Mumbai",
        images: ["/test-d.jpg"],
        stock: 3,
        rating: 4.5,
      },
    ];

    mockUseListProducts.mockReturnValue({
      data: { products: mockDesignerProducts, total: 1, totalPages: 1 },
      isLoading: false,
    });

    render(<ProductsListing category="designer" title="Designer Sarees" />);

    expect(mockUseListProducts).toHaveBeenCalledWith(
      expect.objectContaining({
        category: "designer",
        minPrice: 2000,
        maxPrice: 5000,
      })
    );

    expect(screen.getByText("Contemporary Georgette Designer Saree")).toBeInTheDocument();
    expect(screen.getByText(/Price: ₹2,000 – ₹5,000/i)).toBeInTheDocument();
  });

  it("displays proper empty state when no products match budget filter", () => {
    mockCurrentPath = "/paithani";
    mockSearchStr = "category=paithani&minPrice=0&maxPrice=500";

    mockUseListProducts.mockReturnValue({
      data: { products: [], total: 0, totalPages: 1 },
      isLoading: false,
    });

    render(<ProductsListing category="paithani" title="Paithani Sarees" />);

    expect(screen.getByText(/No Sarees Found/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Clear All Filters/i })).toBeInTheDocument();
  });
});
