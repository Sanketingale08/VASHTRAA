import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Navbar } from "../Navbar";

const mockNavigate = vi.fn();
let mockLocation = "/";

vi.mock("wouter", () => ({
  Link: ({ href, children, className, onClick, ...props }: any) => (
    <a
      href={href}
      className={className}
      onClick={(e) => {
        if (onClick) onClick(e);
      }}
      {...props}
    >
      {children}
    </a>
  ),
  useLocation: () => [mockLocation, mockNavigate],
}));
vi.mock("@clerk/react", () => ({
  useUser: () => ({ user: null, isSignedIn: false }),
  useClerk: () => ({ signOut: vi.fn() }),
}));

vi.mock("@/context/AuthContext", () => ({
  useAuth: () => ({ user: null, isSignedIn: false, signOut: vi.fn() }),
}));

vi.mock("@/context/WishlistContext", () => ({
  useWishlist: () => ({ wishlistedIds: new Set(), toggle: vi.fn() }),
}));

vi.mock("@/context/CartContext", () => ({
  useCart: () => ({ totalItems: 0, openDrawer: vi.fn() }),
}));

const mockDbCategories = [
  {
    id: "cat-paithani-default",
    name: "Paithani Sarees",
    slug: "paithani",
    coverImage: "/images/hero-paithani-1.png",
    type: "main",
    active: true,
    subcategories: [
      { id: "bridal", name: "Bridal", slug: "bridal" },
      { id: "traditional", name: "Traditional", slug: "traditional" },
    ],
  },
  {
    id: "cat-designer-default",
    name: "Designer Sarees",
    slug: "designer",
    coverImage: "/images/hero-designer-1.png",
    type: "main",
    active: true,
    subcategories: [
      { id: "bollywood", name: "Bollywood", slug: "bollywood" },
      { id: "party", name: "Party Wear", slug: "party" },
    ],
  },
  {
    id: "cat-gadwal-default",
    name: "Gadwal Sarees",
    slug: "gadwal",
    coverImage: "/images/hero-gadwal-1.png",
    type: "main",
    active: true,
  },
  {
    id: "cat-banarasi-default",
    name: "Banarasi Sarees",
    slug: "banarasi",
    coverImage: "/images/hero-banarasi-1.png",
    type: "main",
    active: true,
  },
  {
    id: "cat-kanjivaram-default",
    name: "Kanjivaram Sarees",
    slug: "kanjivaram",
    coverImage: "/images/hero-kanjivaram-1.png",
    type: "main",
    active: true,
  },
  {
    id: "cat-chanderi-default",
    name: "Chanderi Sarees",
    slug: "chanderi",
    coverImage: "/images/hero-chanderi-1.png",
    type: "main",
    active: true,
  },
  {
    id: "cat-bandhani-default",
    name: "Bandhani Sarees",
    slug: "bandhani",
    coverImage: "/images/hero-bandhani-1.png",
    type: "main",
    active: true,
  },
  {
    id: "cat-mysore-silk-default",
    name: "Mysore Silk Sarees",
    slug: "mysore-silk",
    coverImage: "/images/hero-mysore-silk-1.png",
    type: "main",
    active: true,
  },
  {
    id: "cat-ikat-default",
    name: "Ikat Sarees",
    slug: "ikat",
    coverImage: "/images/hero-ikat-1.png",
    type: "main",
    active: true,
  },
  {
    id: "cat-cotton-default",
    name: "Cotton Sarees",
    slug: "cotton",
    coverImage: "/images/hero-cotton-1.png",
    type: "main",
    active: true,
  },
  {
    id: "cat-silk-default",
    name: "Silk Sarees",
    slug: "silk",
    coverImage: "/images/hero-silk-1.png",
    type: "main",
    active: true,
  },
  {
    id: "cat-other-traditional-default",
    name: "Other Traditional Sarees",
    slug: "other-traditional",
    coverImage: "/images/hero-other-traditional-1.png",
    type: "main",
    active: true,
  },
  // Subcategory document that should be excluded from main category dropdown
  {
    id: "sub-seller-custom-1",
    name: "Seller Custom Weave",
    slug: "paithani-custom-weave",
    parentId: "cat-paithani-default",
    type: "subcategory",
    active: true,
  },
];

describe("Category Dropdown – Display Only Main Categories", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    mockLocation = "/";
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });

    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/api/categories")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ categories: mockDbCategories }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({ products: [], totalCount: 0 }),
      });
    });
  });

  function renderNavbar() {
    return render(
      <QueryClientProvider client={queryClient}>
        <Navbar />
      </QueryClientProvider>
    );
  }

  it("displays only main category names with respective images in the dropdown", async () => {
    renderNavbar();

    // Trigger categories dropdown
    const categoriesBtn = screen.getByRole("button", { name: /categories/i });
    fireEvent.click(categoriesBtn);

    // Dropdown title
    expect(screen.getByText(/Fashion Categories|All Saree Categories/i)).toBeInTheDocument();

    // Verify main categories are rendered
    await waitFor(() => {
      expect(screen.getByText("Paithani Sarees")).toBeInTheDocument();
      expect(screen.getByText("Designer Sarees")).toBeInTheDocument();
      expect(screen.getByText("Gadwal Sarees")).toBeInTheDocument();
      expect(screen.getByText("Banarasi Sarees")).toBeInTheDocument();
      expect(screen.getByText("Kanjivaram Sarees")).toBeInTheDocument();
      expect(screen.getByText("Chanderi Sarees")).toBeInTheDocument();
      expect(screen.getByText("Bandhani Sarees")).toBeInTheDocument();
      expect(screen.getByText("Mysore Silk Sarees")).toBeInTheDocument();
      expect(screen.getByText("Ikat Sarees")).toBeInTheDocument();
      expect(screen.getByText("Cotton Sarees")).toBeInTheDocument();
      expect(screen.getByText("Silk Sarees")).toBeInTheDocument();
      expect(screen.getByText("Other Traditional Sarees")).toBeInTheDocument();
    });

    // Verify category images exist for each main category
    const paithaniImg = screen.getByAltText("Paithani Sarees");
    expect(paithaniImg).toBeInTheDocument();
    expect(paithaniImg).toHaveAttribute("src", "/images/hero-paithani-1.png");

    const cottonImg = screen.getByAltText("Cotton Sarees");
    expect(cottonImg).toBeInTheDocument();
    expect(cottonImg).toHaveAttribute("src", "/images/hero-cotton-1.png");

    const silkImg = screen.getByAltText("Silk Sarees");
    expect(silkImg).toBeInTheDocument();
    expect(silkImg).toHaveAttribute("src", "/images/hero-silk-1.png");
  });

  it("strictly hides all subcategory names, subcategory chips, tags, and lists from the menu", async () => {
    renderNavbar();

    const categoriesBtn = screen.getByRole("button", { name: /categories/i });
    fireEvent.click(categoriesBtn);

    await waitFor(() => {
      expect(screen.getByText("Paithani Sarees")).toBeInTheDocument();
    });

    // Subcategories such as Bridal, Traditional, Bollywood, Party Wear, Seller Custom Weave should NOT exist
    expect(screen.queryByText("Bridal")).not.toBeInTheDocument();
    expect(screen.queryByText("Traditional")).not.toBeInTheDocument();
    expect(screen.queryByText("Bollywood")).not.toBeInTheDocument();
    expect(screen.queryByText("Party Wear")).not.toBeInTheDocument();
    expect(screen.queryByText("Seller Custom Weave")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /^Handcrafted$/i })).not.toBeInTheDocument();
  });

  it("links each category to its respective route for product display", async () => {
    renderNavbar();

    const categoriesBtn = screen.getByRole("button", { name: /categories/i });
    fireEvent.click(categoriesBtn);

    await waitFor(() => {
      expect(screen.getByText("Cotton Sarees")).toBeInTheDocument();
    });

    // Check respective routes
    const cottonLink = screen.getByText("Cotton Sarees").closest("a");
    expect(cottonLink).toHaveAttribute("href", "/cotton");

    const silkLink = screen.getByText("Silk Sarees").closest("a");
    expect(silkLink).toHaveAttribute("href", "/silk");

    const otherTradLink = screen.getByText("Other Traditional Sarees").closest("a");
    expect(otherTradLink).toHaveAttribute("href", "/other-traditional");

    const paithaniLink = screen.getByText("Paithani Sarees").closest("a");
    expect(paithaniLink).toHaveAttribute("href", "/paithani");

    const designerLink = screen.getByText("Designer Sarees").closest("a");
    expect(designerLink).toHaveAttribute("href", "/designer");
  });

  it("mobile categories drawer displays only main categories with images and no subcategories", async () => {
    renderNavbar();

    // Open mobile menu
    const hamburgerBtn = screen.getByLabelText("Open menu");
    fireEvent.click(hamburgerBtn);

    // Open categories accordion in mobile drawer
    const mobileCatBtn = screen.getByText(/Categories \(/i);
    fireEvent.click(mobileCatBtn);

    await waitFor(() => {
      expect(screen.getAllByText("Paithani Sarees").length).toBeGreaterThan(0);
      expect(screen.getAllByText("Cotton Sarees").length).toBeGreaterThan(0);
      expect(screen.getAllByText("Silk Sarees").length).toBeGreaterThan(0);
    });

    // Ensure no subcategory bullet items in mobile drawer
    expect(screen.queryByText(/• Bridal/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/• Bollywood/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/• Traditional/i)).not.toBeInTheDocument();
  });
});
