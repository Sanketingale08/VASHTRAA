import React from "react";
import { render as rtlRender, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CATALOG_CATEGORIES } from "@/constants/categories";

const testQueryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
});

function render(ui: React.ReactElement) {
  return rtlRender(
    <QueryClientProvider client={testQueryClient}>
      {ui}
    </QueryClientProvider>
  );
}

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

const mockNavigate = vi.fn();
let mockSearchStr = "";

vi.mock("wouter", async () => {
  const actual = await vi.importActual("wouter");
  return {
    ...actual,
    useLocation: () => ["/", mockNavigate],
    useSearch: () => mockSearchStr,
    Link: ({ href, children, ...props }: any) => (
      <a href={href} {...props}>
        {children}
      </a>
    ),
  };
});

vi.mock("@/components/Layout", () => ({
  Layout: ({ children }: { children: React.ReactNode }) => <div data-testid="layout-container">{children}</div>,
}));

vi.mock("@clerk/clerk-react", () => ({
  useUser: () => ({ user: null, isSignedIn: false }),
}));

vi.mock("@clerk/react", () => ({
  useUser: () => ({ user: null, isSignedIn: false }),
}));

vi.mock("@/components/AdvertisementCarousel", () => ({
  AdvertisementCarousel: () => <div data-testid="ad-carousel" />,
}));

vi.mock("@/components/QuickViewModal", () => ({
  QuickViewModal: () => null,
}));

vi.mock("@workspace/api-client-react", async () => {
  const actual = await vi.importActual("@workspace/api-client-react");
  return {
    ...actual,
    useListProducts: vi.fn().mockReturnValue({ data: { products: [] }, isLoading: false }),
    getListProductsQueryKey: vi.fn(),
  };
});

import Home from "./Home";

describe("Home — Artisan Handloom Hero and New Arrivals Redesign", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchStr = "";
    testQueryClient.clear();
  });

  describe("1. Removal of Main Hero Banner", () => {
    it("ensures the Artisan Handloom Collection eyebrow and hero heading are removed from the landing page", () => {
      render(<Home />);

      expect(screen.queryByText("ARTISAN HANDLOOM COLLECTION")).not.toBeInTheDocument();
      expect(screen.queryByRole("heading", { level: 1, name: /Authentic Paithani & Designer Sarees/i })).not.toBeInTheDocument();
    });

    it("ensures the artisan handloom description copy is removed", () => {
      render(<Home />);

      expect(screen.queryByText(/Handcrafted by master artisans from Maharashtra/i)).not.toBeInTheDocument();
    });

    it("ensures hero CTA buttons are removed", () => {
      render(<Home />);

      expect(screen.queryByRole("link", { name: /SHOP PAITHANI SAREES/i })).not.toBeInTheDocument();
      expect(screen.queryByRole("link", { name: /SHOP DESIGNER SAREES/i })).not.toBeInTheDocument();
    });

    it("ensures the hero showcase image is removed", () => {
      render(<Home />);

      expect(screen.queryByAltText("Authentic Paithani & Designer Saree")).not.toBeInTheDocument();
    });
  });

  describe("2. Removal of Category Cards from Landing Page", () => {
    it("ensures Paithani and Designer promotional category cards are removed from the landing page", () => {
      render(<Home />);

      // Verify badges and taglines are not present
      expect(screen.queryByText("✨ New Paithani")).not.toBeInTheDocument();
      expect(screen.queryByText("✨ New Designer")).not.toBeInTheDocument();
      expect(screen.queryByText("Heritage Woven in Silk")).not.toBeInTheDocument();
      expect(screen.queryByText("Contemporary Elegance")).not.toBeInTheDocument();

      // Verify category card CTAs are not present
      expect(screen.queryByRole("button", { name: /Explore Paithani/i })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /Explore Designer/i })).not.toBeInTheDocument();

      // Verify description copy is not present
      expect(
        screen.queryByText(/Discover the latest arrivals from Yeola's master weavers/i)
      ).not.toBeInTheDocument();
      expect(
        screen.queryByText(/Fresh contemporary styles and modern silhouettes/i)
      ).not.toBeInTheDocument();
    });
  });

  describe("3. Section Order and Hierarchy", () => {
    it("ensures Explore by Category precedes Shop By Budget", () => {
      const { container } = render(<Home />);
      const sections = container.querySelectorAll("section");

      // Verify sections exist
      expect(sections.length).toBeGreaterThanOrEqual(2);

      // Section 1 contains Explore by Category
      expect(sections[0].textContent).toContain("Explore by Category");

      // Verify Shop By Budget section exists
      const budgetSection = Array.from(sections).find((s) => s.textContent?.includes("SHOP BY BUDGET"));
      expect(budgetSection).toBeDefined();
      expect(budgetSection?.textContent).toContain("Explore Collections by Price");
    });

    it("ensures no Artisan Handloom Collection hero section exists", () => {
      render(<Home />);

      // 0 instances of ARTISAN HANDLOOM COLLECTION
      expect(screen.queryByText("ARTISAN HANDLOOM COLLECTION")).not.toBeInTheDocument();

      // H1 heading is Explore by Category
      const h1Headings = screen.getAllByRole("heading", { level: 1 });
      expect(h1Headings[0].textContent).toContain("Explore by Category");
    });
  });

  describe("4. Recently Viewed Products Across All Categories (Paithani & Designer buttons removed)", () => {
    it("renders the Recently Viewed Products section on the landing page", () => {
      render(<Home />);

      expect(screen.getByText("Recently Viewed Products")).toBeInTheDocument();
    });

    it("ensures Paithani and Designer standalone option buttons and legacy category menu are removed", () => {
      render(<Home />);

      expect(screen.queryByRole("tab", { name: /^Paithani$/i })).not.toBeInTheDocument();
      expect(screen.queryByRole("tab", { name: /^Designer$/i })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /Category filter menu/i })).not.toBeInTheDocument();
    });

    it("renders category tabs for All and all catalog categories with All selected by default", () => {
      render(<Home />);

      const allTab = screen.getByRole("tab", { name: /^All$/i });
      expect(allTab).toBeInTheDocument();
      expect(allTab).toHaveAttribute("aria-selected", "true");

      for (const cat of CATALOG_CATEGORIES) {
        expect(screen.getByRole("tab", { name: new RegExp(cat.name, "i") })).toBeInTheDocument();
      }

      // Default bottom CTA points to full catalog
      const viewCatalogLink = screen.getByRole("link", { name: /Explore Complete Catalog/i });
      expect(viewCatalogLink).toBeInTheDocument();
      expect(viewCatalogLink).toHaveAttribute("href", "/products");
    });

    it("switches to Kurtis category tab when clicked and updates View All link", () => {
      render(<Home />);

      const kurtisTab = screen.getByRole("tab", { name: /^Kurtis$/i });
      fireEvent.click(kurtisTab);

      expect(kurtisTab).toHaveAttribute("aria-selected", "true");
      expect(screen.getByRole("tab", { name: /^All$/i })).toHaveAttribute("aria-selected", "false");

      const viewAllLink = screen.getByRole("link", { name: /View All Kurtis/i });
      expect(viewAllLink).toBeInTheDocument();
      expect(viewAllLink).toHaveAttribute("href", "/kurtis");
    });

    it("switches to Tops category tab when clicked and updates View All link", () => {
      render(<Home />);

      const topsTab = screen.getByRole("tab", { name: /Tops/i });
      fireEvent.click(topsTab);

      expect(topsTab).toHaveAttribute("aria-selected", "true");
      const viewAllLink = screen.getByRole("link", { name: /View All Tops/i });
      expect(viewAllLink).toBeInTheDocument();
      expect(viewAllLink).toHaveAttribute("href", "/tops");
    });
  });
});

