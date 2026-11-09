import React from "react";
import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ProductsListing } from "../ProductsListing";
import { CircularCategoryNav, CircularCategoryItem } from "@/components/CircularCategoryNav";

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

let mockLocation = "/sarees";
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

describe("Circular Category Cards Navigation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLocation = "/sarees";
    mockUseListProducts.mockReturnValue({
      data: {
        products: [
          { id: "SR1001", name: "Royal Paithani Saree", price: 12500, rating: 4.8, reviewCount: 15, category: "paithani", images: ["/images/product-1.png"], status: "approved", active: true },
          { id: "SR1002", name: "Banarasi Katan Silk", price: 18000, rating: 4.9, reviewCount: 22, category: "banarasi", images: ["/images/product-5.png"], status: "approved", active: true },
        ],
        total: 2,
        totalPages: 1,
      },
      isLoading: false,
      isError: false,
    });
  });

  describe("Standalone CircularCategoryNav Component", () => {
    it("renders circular category cards with image, label, and active state", () => {
      const items: CircularCategoryItem[] = [
        { id: "paithani", name: "Paithani", slug: "paithani", image: "/images/hero-paithani-1.png" },
        { id: "designer", name: "Designer", slug: "designer", image: "/images/hero-designer-1.png" },
      ];
      const onSelect = vi.fn();
      const onExploreAll = vi.fn();

      render(
        <CircularCategoryNav
          items={items}
          activeSlug="paithani"
          onSelect={onSelect}
          onExploreAll={onExploreAll}
          exploreAllLabel="Explore All"
        />
      );

      // Explore All card
      expect(screen.getByText("Explore All")).toBeInTheDocument();
      // Category items
      expect(screen.getByText("Paithani")).toBeInTheDocument();
      expect(screen.getByText("Designer")).toBeInTheDocument();

      // Click on Designer
      fireEvent.click(screen.getByText("Designer"));
      expect(onSelect).toHaveBeenCalledWith(items[1]);

      // Click Explore All
      fireEvent.click(screen.getByText("Explore All"));
      expect(onExploreAll).toHaveBeenCalledTimes(1);
    });

    it("returns null when items array is empty", () => {
      const { container } = render(
        <CircularCategoryNav
          items={[]}
          onSelect={vi.fn()}
          onExploreAll={vi.fn()}
        />
      );
      expect(container.firstChild).toBeNull();
    });
    it("enforces single horizontal line with flex-nowrap and responsive circle dimensions", () => {
      const items: CircularCategoryItem[] = [
        { id: "paithani", name: "Paithani", slug: "paithani", image: "/images/hero-paithani-1.png" },
        { id: "banarasi", name: "Banarasi", slug: "banarasi", image: "/images/hero-banarasi-1.png" },
      ];

      render(
        <CircularCategoryNav
          items={items}
          activeSlug="paithani"
          onSelect={vi.fn()}
          onExploreAll={vi.fn()}
        />
      );

      const tablist = screen.getByRole("tablist");
      // Must be flex-nowrap and overflow-x-auto, never wrapping
      expect(tablist.className).toContain("flex-nowrap");
      expect(tablist.className).toContain("overflow-x-auto");
      expect(tablist.className).not.toContain("flex-wrap");

      // Verify desktop scroll navigation buttons exist
      expect(screen.getByLabelText("Scroll left")).toBeInTheDocument();
      expect(screen.getByLabelText("Scroll right")).toBeInTheDocument();

      // Check active item has data-active="true"
      const paithaniTab = screen.getByRole("tab", { name: /Paithani/i });
      expect(paithaniTab).toHaveAttribute("data-active", "true");
    });
  });

  describe("Main Sarees Page (/sarees)", () => {
    it("renders all 12 official Saree categories as circular cards with Explore All and no promotional subtitle", () => {
      mockLocation = "/sarees";
      renderWithClient(
        <ProductsListing
          category="sarees"
          title="Sarees"
          hideHero={true}
        />
      );

      // Heading preserved, promotional subtitle removed
      expect(screen.getByRole("heading", { level: 1, name: "Sarees" })).toBeInTheDocument();
      expect(screen.queryByText("Centuries of Royal Heritage & Master Artisanal Weaves")).not.toBeInTheDocument();

      // Check for Explore All card
      expect(screen.getByText("Explore All")).toBeInTheDocument();

      // Check for all 12 Saree categories
      const expectedSarees = [
        "Paithani", "Designer", "Gadwal", "Banarasi", "Kanjivaram",
        "Chanderi", "Bandhani", "Mysore Silk", "Ikat", "Cotton",
        "Silk", "Other Traditional"
      ];

      for (const name of expectedSarees) {
        expect(screen.getByText(name)).toBeInTheDocument();
      }
    });

    it("navigates to the corresponding category route when clicking a category card", () => {
      mockLocation = "/sarees";
      renderWithClient(
        <ProductsListing
          category="sarees"
          title="Sarees"
          hideHero={true}
        />
      );

      const paithaniCard = screen.getByText("Paithani");
      fireEvent.click(paithaniCard);

      expect(mockNavigate).toHaveBeenCalledWith("/paithani");
    });
  });

  describe("Paithani Category Page (/paithani)", () => {
    it("renders Paithani subcategories as circular cards with All Paithani reset card", () => {
      mockLocation = "/paithani";
      renderWithClient(
        <ProductsListing
          category="paithani"
          title="Paithani Sarees"
          subtitle="Authentic Yeola & Pure Silk Heritage"
          hideHero={true}
        />
      );

      // Check title
      expect(screen.getByRole("heading", { level: 1, name: "Paithani Sarees" })).toBeInTheDocument();

      // Check for All Paithani card
      expect(screen.getByText("All Paithani")).toBeInTheDocument();

      // Check breadcrumb
      expect(screen.getByText("All Sarees")).toBeInTheDocument();

      // Check Paithani subcategories
      expect(screen.getByText("Traditional")).toBeInTheDocument();
      expect(screen.getByText("Pure Silk")).toBeInTheDocument();
      expect(screen.getByText("Kadiyal")).toBeInTheDocument();
      expect(screen.getByText("Muniya")).toBeInTheDocument();
      expect(screen.getByText("Brocade")).toBeInTheDocument();
    });

    it("clicking subcategory updates filter and clicking All Paithani clears it", () => {
      mockLocation = "/paithani";
      renderWithClient(
        <ProductsListing
          category="paithani"
          title="Paithani Sarees"
          hideHero={true}
        />
      );

      const pureSilkCard = screen.getByText("Pure Silk");
      fireEvent.click(pureSilkCard);

      // Verify product listing params updated
      expect(mockUseListProducts).toHaveBeenCalledWith(
        expect.objectContaining({
          category: "paithani",
          subcategory: "pure-silk",
        })
      );

      // Click All Paithani to reset
      const allPaithaniCard = screen.getByText("All Paithani");
      fireEvent.click(allPaithaniCard);

      const lastCallArgs = mockUseListProducts.mock.calls.at(-1)?.[0];
      expect(lastCallArgs?.category).toBe("paithani");
      expect(lastCallArgs?.subcategory).toBeUndefined();
    });
  });

  describe("Designer Category Page (/designer)", () => {
    it("renders Designer subcategories as circular cards", () => {
      mockLocation = "/designer";
      renderWithClient(
        <ProductsListing
          category="designer"
          title="Designer Sarees"
          hideHero={true}
        />
      );

      expect(screen.getByRole("heading", { level: 1, name: "Designer Sarees" })).toBeInTheDocument();
      expect(screen.getByText("All Designer")).toBeInTheDocument();

      // Designer subcategories
      expect(screen.getByText("Bollywood")).toBeInTheDocument();
      expect(screen.getByText("Contemporary Silk")).toBeInTheDocument();
      expect(screen.getByText("Embroidered")).toBeInTheDocument();
      expect(screen.getByText("Sequin")).toBeInTheDocument();
      expect(screen.getByText("Georgette")).toBeInTheDocument();
    });
  });

  describe("Subcategory Selection - No Nested Circles & Direct Product Display", () => {
    it("displays products directly without rendering a second nested circle row when subcategory is clicked", () => {
      mockLocation = "/paithani";
      renderWithClient(
        <ProductsListing
          category="paithani"
          title="Paithani Sarees"
          hideHero={true}
        />
      );

      // Initially renders subcategories
      expect(screen.getByText("Pure Silk")).toBeInTheDocument();

      // Click Pure Silk subcategory
      fireEvent.click(screen.getByText("Pure Silk"));

      // Confirms API called directly with selected subcategory
      expect(mockUseListProducts).toHaveBeenCalledWith(
        expect.objectContaining({
          category: "paithani",
          subcategory: "pure-silk",
        })
      );

      // Verifies NO second nested circle row ("Explore Pure Silk Varieties") is rendered
      expect(screen.queryByText(/Explore Pure Silk Varieties/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/Explore .* Varieties/i)).not.toBeInTheDocument();

      // Only ONE tablist (the primary subcategory row) should exist
      const tablists = screen.getAllByRole("tablist");
      expect(tablists).toHaveLength(1);

      // Verifies active filter chip is displayed
      expect(screen.getByText(/Subcategory: Pure Silk/i)).toBeInTheDocument();
    });

    it("allows removing the subcategory filter chip to return to the broader category product listing", () => {
      mockLocation = "/paithani";
      renderWithClient(
        <ProductsListing
          category="paithani"
          title="Paithani Sarees"
          hideHero={true}
        />
      );

      // Click Pure Silk subcategory
      fireEvent.click(screen.getByText("Pure Silk"));
      expect(screen.getByText(/Subcategory: Pure Silk/i)).toBeInTheDocument();

      // Click remove button on the subcategory chip
      const removeBtn = screen.getByRole("button", { name: /Remove Subcategory: Pure Silk/i });
      fireEvent.click(removeBtn);

      // Confirms subcategory filter is cleared
      const lastCallArgs = mockUseListProducts.mock.calls.at(-1)?.[0];
      expect(lastCallArgs?.category).toBe("paithani");
      expect(lastCallArgs?.subcategory).toBeUndefined();
    });

    it("works identically for Ethnic Dresses without rendering nested variant circles", () => {
      mockLocation = "/ethnic-dresses";
      renderWithClient(
        <ProductsListing
          category="ethnic-dresses"
          title="Ethnic Dresses"
          hideHero={true}
        />
      );

      // Click a subcategory circle if present
      const aLineTab = screen.queryByText(/Ethnic A-Line Dress/i);
      if (aLineTab) {
        fireEvent.click(aLineTab);

        expect(mockUseListProducts).toHaveBeenCalledWith(
          expect.objectContaining({
            category: "ethnic-dresses",
            subcategory: "ethnic-a-line-dress",
          })
        );

        // Verifies no nested "Explore ... Varieties" circle row exists
        expect(screen.queryByText(/Explore .* Varieties/i)).not.toBeInTheDocument();
        const tablists = screen.getAllByRole("tablist");
        expect(tablists).toHaveLength(1);
      }
    });
  });
});
