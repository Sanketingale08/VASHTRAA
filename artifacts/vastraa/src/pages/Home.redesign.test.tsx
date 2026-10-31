import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
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
  });

  describe("1. Main Hero Section", () => {
    it("renders the Artisan Handloom Collection eyebrow and H1 heading", () => {
      render(<Home />);

      expect(screen.getByText("ARTISAN HANDLOOM COLLECTION")).toBeInTheDocument();
      const h1 = screen.getByRole("heading", { level: 1, name: /Authentic Paithani & Designer Sarees/i });
      expect(h1).toBeInTheDocument();
    });

    it("renders the exact artisan handloom description copy", () => {
      render(<Home />);

      const desc = screen.getByText(/Handcrafted by master artisans from Maharashtra/i);
      expect(desc).toBeInTheDocument();
      expect(desc.textContent).toContain(
        "Handcrafted by master artisans from Maharashtra, our sarees feature vibrant silk fabrics adorned with traditional peacock, muniya, and floral motifs, making them perfect for special occasions."
      );
    });

    it("renders both primary and secondary CTAs navigating to /paithani and /designer", () => {
      render(<Home />);

      const paithaniCTA = screen.getByRole("link", { name: /SHOP PAITHANI SAREES/i });
      expect(paithaniCTA).toBeInTheDocument();
      expect(paithaniCTA).toHaveAttribute("href", "/paithani");

      const designerCTA = screen.getByRole("link", { name: /SHOP DESIGNER SAREES/i });
      expect(designerCTA).toBeInTheDocument();
      expect(designerCTA).toHaveAttribute("href", "/designer");
    });

    it("renders the authentic artisan saree showcase image", () => {
      render(<Home />);

      const img = screen.getByAltText("Authentic Paithani & Designer Saree") as HTMLImageElement;
      expect(img).toBeInTheDocument();
      expect(img.src).toContain("/images/artisan-handloom-saree.png");
    });

    it("renders the hero section as a card with image on the left and text on the right", () => {
      const { container } = render(<Home />);
      const firstSection = container.querySelectorAll("section")[0];

      // Elevated card container
      const card = firstSection.querySelector(".rounded-2xl, .rounded-3xl");
      expect(card).toBeInTheDocument();

      // Grid with Left column (image, col-span-5) and Right column (text, col-span-7)
      const grid = card?.querySelector(".grid");
      expect(grid).toBeInTheDocument();
      const columns = grid?.children;
      expect(columns).toHaveLength(2);
      expect(columns?.[0].className).toContain("lg:col-span-5");
      expect(columns?.[0].querySelector("img")).toBeInTheDocument();
      expect(columns?.[1].className).toContain("lg:col-span-7");
      expect(columns?.[1].querySelector("h1")).toBeInTheDocument();
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
    it("ensures Main Hero precedes Shop By Budget", () => {
      const { container } = render(<Home />);
      const sections = container.querySelectorAll("section");

      // Verify sections exist
      expect(sections.length).toBeGreaterThanOrEqual(2);

      // Section 1 contains H1
      expect(sections[0].querySelector("h1")?.textContent).toContain("Authentic Paithani & Designer Sarees");

      // Section 2 contains "Shop By Budget"
      expect(sections[1].textContent).toContain("Shop By Budget");
      expect(sections[1].textContent).toContain("Explore Saree Collections by Price");
    });

    it("ensures no duplicate Artisan Handloom Collection section exists after Shop By Budget", () => {
      render(<Home />);

      // Exactly 1 instance of ARTISAN HANDLOOM COLLECTION
      const eyebrowMatches = screen.getAllByText("ARTISAN HANDLOOM COLLECTION");
      expect(eyebrowMatches).toHaveLength(1);

      // Exactly 1 H1 heading
      const h1Headings = screen.getAllByRole("heading", { level: 1 });
      expect(h1Headings).toHaveLength(1);
    });
  });

  describe("4. Recently Viewed Products with Paithani and Designer Options", () => {
    it("renders the Recently Viewed Products section on the landing page", () => {
      render(<Home />);

      expect(screen.getByText("Recently Viewed Products")).toBeInTheDocument();
    });

    it("renders both Paithani and Designer option buttons", () => {
      render(<Home />);

      const paithaniTab = screen.getByRole("tab", { name: /^Paithani$/i });
      const designerTab = screen.getByRole("tab", { name: /^Designer$/i });

      expect(paithaniTab).toBeInTheDocument();
      expect(designerTab).toBeInTheDocument();
      expect(paithaniTab).toHaveAttribute("aria-selected", "true");
      expect(designerTab).toHaveAttribute("aria-selected", "false");
    });

    it("switches to Designer option when clicked and updates View All link", () => {
      render(<Home />);

      const designerTab = screen.getByRole("tab", { name: /^Designer$/i });
      fireEvent.click(designerTab);

      expect(designerTab).toHaveAttribute("aria-selected", "true");
      const viewAllLink = screen.getByRole("link", { name: /View All Designer Sarees/i });
      expect(viewAllLink).toBeInTheDocument();
      expect(viewAllLink).toHaveAttribute("href", "/designer/shop");
    });
  });
});
