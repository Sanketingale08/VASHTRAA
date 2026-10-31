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

let mockProductId: string | undefined = "prod-1";
const mockNavigate = vi.fn();

vi.mock("wouter", async () => {
  const actual = await vi.importActual("wouter");
  return {
    ...actual,
    useParams: () => ({ id: mockProductId }),
    useLocation: () => ["/products/" + mockProductId, mockNavigate],
    Link: ({ href, children, ...props }: any) => (
      <a href={href} {...props}>
        {children}
      </a>
    ),
  };
});

vi.mock("@/components/Layout", () => ({
  Layout: ({ children }: { children: React.ReactNode }) => <div data-testid="layout">{children}</div>,
}));

const mockAddItem = vi.fn();
vi.mock("@/context/CartContext", () => ({
  useCart: () => ({
    addItem: mockAddItem,
    items: [],
  }),
}));

const mockWishlistToggle = vi.fn();
const mockWishlistedIds = new Set<string>();
vi.mock("@/context/WishlistContext", () => ({
  useWishlist: () => ({
    wishlistedIds: mockWishlistedIds,
    toggle: mockWishlistToggle,
  }),
}));

vi.mock("@/context/AuthContext", () => ({
  useAuth: () => ({
    user: { id: "user-1", name: "Ananya Sharma", email: "ananya@example.com" },
    isSignedIn: true,
  }),
}));

const mockProductData = {
  id: "prod-1",
  name: "Royal Crimson Silk Paithani",
  price: 18500,
  originalPrice: 24500,
  images: ["https://example.com/saree1.jpg", "https://example.com/saree2.jpg"],
  category: "paithani",
  fabric: "silk",
  color: "crimson",
  occasion: "wedding",
  stock: 8,
  description: "Exquisite handwoven pure silk Paithani with traditional peacock motifs in pure zari.",
  vendorName: "Heritage Weaves",
  rating: 4.8,
  reviewCount: 12,
  variants: [
    {
      id: "var-1",
      name: "Crimson / Standard",
      price: 18500,
      stock: 5,
      attributes: [{ name: "Blouse Stitching", value: "Unstitched" }],
    },
    {
      id: "var-2",
      name: "Crimson / Custom",
      price: 20500,
      stock: 3,
      attributes: [{ name: "Blouse Stitching", value: "Custom Stitched" }],
    },
  ],
};

let getProductMockImplementation: any;

vi.mock("@workspace/api-client-react", async () => {
  const actual = await vi.importActual("@workspace/api-client-react");
  return {
    ...actual,
    useGetProduct: (...args: any[]) => getProductMockImplementation(...args),
    useListProducts: vi.fn().mockReturnValue({ data: { products: [] }, isLoading: false }),
    getListProductsQueryKey: vi.fn().mockReturnValue(["products-query-key"]),
  };
});

vi.mock("@tanstack/react-query", async () => {
  const actual = await vi.importActual("@tanstack/react-query");
  return {
    ...actual,
    useQueryClient: () => ({
      invalidateQueries: vi.fn(),
      setQueryData: vi.fn(),
    }),
    useQuery: () => ({
      data: {
        reviews: [],
        reviewCount: 0,
        averageRating: 0,
        ratingBreakdown: { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 },
      },
      isLoading: false,
      refetch: vi.fn(),
    }),
  };
});

import ProductDetail from "./ProductDetail";

describe("ProductDetail Component & Hook Order Integrity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockProductId = "prod-1";
    mockWishlistedIds.clear();
  });

  it("successfully transitions from loading state to loaded state without hook order mismatch error", () => {
    // 1. First render: simulating initial API fetch (loading = true)
    let isCurrentlyLoading = true;
    getProductMockImplementation = () => ({
      data: isCurrentlyLoading ? undefined : mockProductData,
      isLoading: isCurrentlyLoading,
      isError: false,
      refetch: vi.fn(),
    });

    const { rerender } = render(<ProductDetail />);

    // In loading state, skeleton is rendered
    expect(screen.getByLabelText("Loading product details")).toBeInTheDocument();

    // 2. Second render: data arrived (loading = false, product loaded)
    // In buggy versions, this throws "Rendered more hooks than during the previous render"
    isCurrentlyLoading = false;
    expect(() => {
      rerender(<ProductDetail />);
    }).not.toThrow();

    // Verify product information is now displayed properly
    expect(screen.getByRole("heading", { level: 1, name: "Royal Crimson Silk Paithani" })).toBeInTheDocument();
    expect(screen.getAllByText("₹18,500")[0]).toBeInTheDocument();
  });

  it("renders correctly when loaded directly via URL", () => {
    getProductMockImplementation = () => ({
      data: mockProductData,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    render(<ProductDetail />);

    expect(screen.getByRole("heading", { level: 1, name: "Royal Crimson Silk Paithani" })).toBeInTheDocument();
    expect(screen.getByText("Heritage Weaves – VASTRAA")).toBeInTheDocument();
  });

  it("handles navigation between different products without errors or stale state", () => {
    let currentId = "prod-1";
    getProductMockImplementation = (id: string) => ({
      data: {
        ...mockProductData,
        id,
        name: id === "prod-1" ? "Product One" : "Product Two",
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    const { rerender } = render(<ProductDetail />);
    expect(screen.getByRole("heading", { level: 1, name: "Product One" })).toBeInTheDocument();

    // Navigate to product 2
    mockProductId = "prod-2";
    currentId = "prod-2";
    expect(() => {
      rerender(<ProductDetail />);
    }).not.toThrow();

    expect(screen.getByRole("heading", { level: 1, name: "Product Two" })).toBeInTheDocument();
  });

  it("handles invalid or non-existent product gracefully with Not Found message", () => {
    getProductMockImplementation = () => ({
      data: null,
      isLoading: false,
      isError: true,
      refetch: vi.fn(),
    });

    render(<ProductDetail />);

    expect(screen.getByText("Product Not Found")).toBeInTheDocument();
    expect(screen.getByText("Back to Home")).toBeInTheDocument();
  });

  it("supports add-to-cart and wishlist actions without errors", () => {
    getProductMockImplementation = () => ({
      data: mockProductData,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });

    render(<ProductDetail />);

    // Select variant option
    const optionBtn = screen.getByText("Unstitched");
    fireEvent.click(optionBtn);

    // Click Add to Cart
    const addToCartBtn = screen.getByRole("button", { name: /add to cart/i });
    fireEvent.click(addToCartBtn);

    expect(mockAddItem).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "prod-1",
        name: "Royal Crimson Silk Paithani",
      })
    );

    // Click Wishlist
    const wishlistBtn = screen.getByRole("button", { name: /wishlist/i });
    fireEvent.click(wishlistBtn);
    expect(mockWishlistToggle).toHaveBeenCalledWith("prod-1");
  });

  describe("UI Design System Parity: Designer Saree matches Paithani UI", () => {
    const mockDesignerProductData = {
      id: "prod-designer-1",
      name: "Celestial Lavender Sequin Designer Saree",
      price: 24999,
      originalPrice: 32000,
      images: ["https://example.com/designer-saree1.jpg", "https://example.com/designer-saree2.jpg"],
      category: "designer",
      subcategory: "Bollywood Glamour",
      fabric: "georgette",
      color: "lavender",
      occasion: "reception",
      stock: 6,
      description: "Contemporary georgette designer drape with intricate sequin embellishments and feather border detail.",
      vendorName: "Couture Mumbai",
      rating: 4.9,
      reviewCount: 18,
      deliveryInfo: "Dispatched within 24 hours via express courier.",
      returnPolicy: "7-day return policy for unworn designer sarees with intact security tags.",
      variants: [
        {
          id: "var-des-1",
          name: "Lavender / Ready to Wear",
          price: 24999,
          stock: 4,
          attributes: [{ name: "Saree Drape", value: "Ready to Wear" }],
        },
        {
          id: "var-des-2",
          name: "Lavender / Unstitched Blouse",
          price: 26999,
          stock: 2,
          attributes: [{ name: "Saree Drape", value: "Unstitched Blouse" }],
        },
      ],
    };

    beforeEach(() => {
      mockProductId = "prod-designer-1";
      getProductMockImplementation = () => ({
        data: mockDesignerProductData,
        isLoading: false,
        isError: false,
        refetch: vi.fn(),
      });
    });

    it("renders Designer Saree product detail with identical Paithani visual design tokens (light luxury theme, navy typography, white card containers)", () => {
      const { container } = render(<ProductDetail />);

      // 1. Root container must NOT have "dark" class
      const rootDiv = container.firstChild as HTMLElement;
      expect(rootDiv).not.toHaveClass("dark");

      // 2. Main content container must have the standard light theme classes
      const mainContainer = container.querySelector(".min-h-screen");
      expect(mainContainer).toHaveClass("bg-[#F4F5F7]");
      expect(mainContainer).toHaveClass("text-[#3D1A1A]");
      expect(mainContainer).not.toHaveClass("bg-[#1E2329]");

      // 3. Product Title must use Navy #0A1F44 typography
      const title = screen.getByRole("heading", { level: 1, name: "Celestial Lavender Sequin Designer Saree" });
      expect(title).toHaveClass("text-[#0A1F44]");
      expect(title).not.toHaveClass("text-[#E5E8EC]");

      // 4. Price must be styled in Navy text-[#0A1F44] (not platinum #C7CCD1)
      const priceElement = screen.getAllByText("₹24,999")[0];
      expect(priceElement).toHaveClass("text-[#0A1F44]");
      expect(priceElement).not.toHaveClass("text-[#C7CCD1]");

      // 5. Buy Now button must use Paithani styling (border-[#0A1F44] text-[#0A1F44])
      const buyNowBtn = screen.getByRole("button", { name: /buy now/i });
      expect(buyNowBtn).toHaveClass("border-[#0A1F44]");
      expect(buyNowBtn).toHaveClass("text-[#0A1F44]");
      expect(buyNowBtn).not.toHaveClass("border-[#C7CCD1]");

      // 6. Specifications table card container must be white with border-[#C7CCD1]/30
      const specHeader = screen.getByText("Product Specifications");
      const specCard = specHeader.closest(".rounded-xl");
      expect(specCard).toHaveClass("bg-white");
      expect(specCard).toHaveClass("border-[#C7CCD1]/30");
      expect(specCard).not.toHaveClass("bg-[#2A2E35]");

      // 7. Variant option buttons must use standard white/navy styling
      const variantOptionBtn = screen.getByText("Ready to Wear");
      expect(variantOptionBtn).toHaveClass("bg-white");
      expect(variantOptionBtn).toHaveClass("text-[#0A1F44]");
      expect(variantOptionBtn).not.toHaveClass("bg-[#1E2329]");
    });

    it("preserves authentic Designer Saree data, pricing, attributes, routing, and purchase actions", () => {
      render(<ProductDetail />);

      // Verify Designer-specific content is preserved
      expect(screen.getByRole("heading", { level: 1, name: "Celestial Lavender Sequin Designer Saree" })).toBeInTheDocument();
      expect(screen.getByText("Couture Mumbai – VASTRAA")).toBeInTheDocument();
      expect(screen.getByText("Contemporary georgette designer drape with intricate sequin embellishments and feather border detail.")).toBeInTheDocument();
      expect(screen.getByText("Bollywood Glamour")).toBeInTheDocument();
      expect(screen.getByText("Georgette")).toBeInTheDocument();
      expect(screen.getByText("Lavender")).toBeInTheDocument();

      // Verify breadcrumb links to /designer/shop
      const breadcrumbDesignerLink = screen.getByRole("link", { name: "Designer" });
      expect(breadcrumbDesignerLink).toHaveAttribute("href", "/designer/shop");

      // Verify variant selection and purchase
      const variantBtn = screen.getByText("Ready to Wear");
      fireEvent.click(variantBtn);

      const addToCartBtn = screen.getByRole("button", { name: /add to cart/i });
      fireEvent.click(addToCartBtn);

      expect(mockAddItem).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "prod-designer-1",
          name: "Celestial Lavender Sequin Designer Saree",
          price: 24999,
          vendorName: "Couture Mumbai",
          category: "designer",
        })
      );
    });

    it("confirms Paithani Saree product detail UI remains visual standard and functionally intact", () => {
      mockProductId = "prod-1";
      getProductMockImplementation = () => ({
        data: mockProductData,
        isLoading: false,
        isError: false,
        refetch: vi.fn(),
      });

      const { container } = render(<ProductDetail />);

      // Root div does not have dark class
      const rootDiv = container.firstChild as HTMLElement;
      expect(rootDiv).not.toHaveClass("dark");

      // Paithani content correctly displayed
      expect(screen.getByRole("heading", { level: 1, name: "Royal Crimson Silk Paithani" })).toBeInTheDocument();
      expect(screen.getByText("Heritage Weaves – VASTRAA")).toBeInTheDocument();

      // Breadcrumb routes to /paithani/shop
      const breadcrumbPaithaniLink = screen.getByRole("link", { name: "Paithani" });
      expect(breadcrumbPaithaniLink).toHaveAttribute("href", "/paithani/shop");

      // Price styled in text-[#0A1F44]
      const priceElem = screen.getAllByText("₹18,500")[0];
      expect(priceElem).toHaveClass("text-[#0A1F44]");
    });
  });
});
