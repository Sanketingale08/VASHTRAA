import React from "react";
import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ProductsListing } from "../ProductsListing";

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
  window.scrollTo = vi.fn();
});

let mockLocation = "/tops";
const mockNavigate = vi.fn((to: string) => {
  mockLocation = to;
});

vi.mock("wouter", () => ({
  useLocation: () => [mockLocation, mockNavigate],
  useSearch: () => "",
  Link: ({ children, href, onClick, ...props }: any) => (
    <a
      href={href}
      onClick={(e) => {
        if (onClick) onClick(e);
        if (href) mockNavigate(href);
      }}
      {...props}
    >
      {children}
    </a>
  ),
}));

vi.mock("@/components/Layout", () => ({
  Layout: ({ children }: { children: React.ReactNode }) => <div data-testid="layout">{children}</div>,
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
vi.mock("@workspace/api-client-react", () => ({
  useListProducts: (params: any) => mockUseListProducts(params),
  useListVendors: () => ({ data: [] }),
}));

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      {ui}
    </QueryClientProvider>
  );
}

describe("Ladies & Girls Tops Category Listing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLocation = "/tops";
    mockUseListProducts.mockReturnValue({
      data: {
        products: [
          {
            id: "TP1001",
            name: "Floral Printed Crop Top",
            price: 899,
            rating: 4.5,
            reviewCount: 12,
            category: "tops",
            subcategory: "crop-tops",
            images: ["/images/product-4.png"],
            status: "approved",
            active: true,
          },
        ],
        total: 1,
        totalPages: 1,
      },
      isLoading: false,
      isError: false,
    });
  });

  it("renders Tops Category header and navigation tabs for groups", () => {
    renderWithClient(
      <ProductsListing
        category="tops"
        title="Tops"
        description="Discover chic, comfortable, and trendy tops for women and girls."
      />
    );

    expect(screen.getByRole("heading", { name: "Tops" })).toBeInTheDocument();
    expect(screen.getByText("All Tops")).toBeInTheDocument();
    expect(screen.getByText("Women's Tops")).toBeInTheDocument();
    expect(screen.getByText("Girls' Tops")).toBeInTheDocument();
    expect(screen.getByText("Seasonal Tops")).toBeInTheDocument();
  });

  it("navigates to subcategory route when subcategory pill is clicked", () => {
    renderWithClient(
      <ProductsListing
        category="tops"
        title="Tops"
      />
    );

    const cropTopBtn = screen.getByText("Crop Tops");
    expect(cropTopBtn).toBeInTheDocument();
    fireEvent.click(cropTopBtn);

    expect(mockNavigate).toHaveBeenCalledWith("/tops/crop-tops");
  });

  it("renders circular subcategory cards and handles selection", () => {
    renderWithClient(
      <ProductsListing
        category="tops"
        title="Tops"
      />
    );

    // Verify all 4 circular profile cards exist
    const allTopsBtn = screen.getByRole("tab", { name: /All Tops/i });
    const womensTopsBtn = screen.getByRole("tab", { name: /Women's Tops/i });
    const girlsTopsBtn = screen.getByRole("tab", { name: /Girls' Tops/i });
    const seasonalTopsBtn = screen.getByRole("tab", { name: /Seasonal Tops/i });

    expect(allTopsBtn).toBeInTheDocument();
    expect(womensTopsBtn).toBeInTheDocument();
    expect(girlsTopsBtn).toBeInTheDocument();
    expect(seasonalTopsBtn).toBeInTheDocument();

    // All Tops is active by default
    expect(allTopsBtn).toHaveAttribute("aria-selected", "true");

    // Click Women's Tops
    fireEvent.click(womensTopsBtn);
    expect(mockNavigate).toHaveBeenCalledWith("/tops?category=tops&subcategory=womens-tops");
  });

  it("renders Tops-specific filters (Size, Sleeve Length, Neck Style) in filter panel and hides saree-specific filters", () => {
    renderWithClient(
      <ProductsListing
        category="tops"
        title="Ladies & Girls Tops"
      />
    );

    // Open filter panel
    const filterBtn = screen.getByTestId("filter-button");
    fireEvent.click(filterBtn);

    // Verify Tops filters exist
    expect(screen.getByText("Size")).toBeInTheDocument();
    expect(screen.getByText("Women's Sizes")).toBeInTheDocument();
    expect(screen.getByText("Girls' Sizes (Age)")).toBeInTheDocument();
    expect(screen.getByText("Sleeve Length")).toBeInTheDocument();
    expect(screen.getByText("Neck Style")).toBeInTheDocument();

    // Verify Saree-specific filters are strictly hidden
    expect(screen.queryByText("Saree Type")).not.toBeInTheDocument();
    expect(screen.queryByText("Saree Style")).not.toBeInTheDocument();
    expect(screen.queryByText("Blouse Included")).not.toBeInTheDocument();
  });

  it("displays proper empty state when no tops products are found", () => {
    mockUseListProducts.mockReturnValue({
      data: {
        products: [],
        total: 0,
        totalPages: 1,
      },
      isLoading: false,
      isError: false,
    });

    renderWithClient(
      <ProductsListing
        category="tops"
        title="Ladies & Girls Tops"
      />
    );

    expect(screen.getByText("No Tops Available Yet")).toBeInTheDocument();
    expect(screen.queryByText("No Sarees Found")).not.toBeInTheDocument();
  });
});
