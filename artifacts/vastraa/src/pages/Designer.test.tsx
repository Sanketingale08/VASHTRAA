import React from "react";
import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import { render, screen } from "@testing-library/react";

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

let mockCurrentPath = "/designer";
let mockSearchStr = "category=designer";

vi.mock("wouter", () => ({
  useLocation: () => [mockCurrentPath, vi.fn()],
  useSearch: () => mockSearchStr,
  Link: ({ children, href, ...props }: any) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

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
vi.mock("@workspace/api-client-react", () => ({
  useListProducts: (params: any) => mockUseListProducts(params),
  useListVendors: () => ({ data: [] }),
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: {} }),
  useQueryClient: () => ({
    invalidateQueries: vi.fn(),
  }),
}));

vi.mock("@/lib/api", () => ({
  apiFetch: vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }),
}));

import Designer from "./Designer";

describe("Designer Page Banner Features", () => {
  const products = Array.from({ length: 25 }, (_, i) => ({
    id: `prod-d-${i + 1}`,
    name: `Designer Saree ${i + 1}`,
    price: 3500 + i * 100,
    category: "designer",
    fabric: "Georgette",
    vendorName: "Couture Mumbai",
    images: [`/test-d-${i + 1}.jpg`],
    stock: 5,
    rating: 4.8,
  }));

  beforeEach(() => {
    vi.clearAllMocks();
    mockCurrentPath = "/designer";
    mockSearchStr = "category=designer";
    mockUseListProducts.mockReturnValue({
      data: { products, total: 25, totalPages: 1 },
      isLoading: false,
      isError: false,
    });
  });

  it("does not render the top hero banner image on /designer?category=designer", () => {
    render(<Designer />);

    const topBanner = screen.queryByTestId("top-category-banner");
    expect(topBanner).not.toBeInTheDocument();
  });

  it("renders the in-grid banner specifically after the 20th product card", () => {
    render(<Designer />);

    const inGridBanner = screen.getByTestId("in-grid-designer-banner");
    expect(inGridBanner).toBeInTheDocument();

    const bannerImg = inGridBanner.querySelector("img");
    expect(bannerImg).toBeInTheDocument();
    expect(bannerImg).toHaveAttribute("src", "/images/designer-banner.png");

    const cards = screen.getAllByTestId(/^card-product-/);
    expect(cards.length).toBe(25);

    // Verify banner DOM position relative to 20th card
    const card20GridItem = cards[19].closest(".grid > div");
    expect(card20GridItem).toBeInTheDocument();
    expect(inGridBanner.previousElementSibling).toBe(card20GridItem);
  });

  it("requests 24 products limit by default on Designer page", () => {
    render(<Designer />);

    expect(mockUseListProducts).toHaveBeenCalledWith(
      expect.objectContaining({
        category: "designer",
        limit: 24,
      })
    );
  });
});
