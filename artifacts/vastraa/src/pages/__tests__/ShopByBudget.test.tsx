import React from "react";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock wouter
const mockNavigate = vi.fn();
let mockSearchStr = "";

vi.mock("wouter", async () => {
  const actual = await vi.importActual("wouter");
  return {
    ...actual,
    useLocation: () => ["/shop-by-budget", mockNavigate],
    useSearch: () => mockSearchStr,
    Link: ({ href, children, ...props }: any) => (
      <a href={href} {...props}>
        {children}
      </a>
    ),
  };
});

// Mock Layout
vi.mock("@/components/Layout", () => ({
  Layout: ({ children }: { children: React.ReactNode }) => <div data-testid="layout-wrapper">{children}</div>,
}));

import ShopByBudget, { buildProductListingUrl } from "../ShopByBudget";
import { BUDGET_RANGES } from "@/constants/budget";

describe("ShopByBudget — Unified Category Selection Page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchStr = "budget=500-1000";
  });

  it("renders breadcrumbs, heading, description, and active budget badge", () => {
    render(<ShopByBudget />);

    // Breadcrumbs
    const breadcrumbs = screen.getByTestId("breadcrumbs-nav");
    expect(breadcrumbs).toHaveTextContent("Home");
    expect(breadcrumbs).toHaveTextContent("Shop by Budget");
    expect(breadcrumbs).toHaveTextContent("₹500–₹1,000");

    // Heading and description
    expect(
      screen.getByRole("heading", { name: /Explore Collections.*₹500–₹1,000/i })
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Choose a category to discover styles within your selected budget/i)
    ).toBeInTheDocument();

    // Active budget badge
    expect(screen.getByText(/POPULAR — Everyday Favorites/i)).toBeInTheDocument();
  });

  it("renders the hero showcase card with the attached fashion collection image and luxury badges", () => {
    render(<ShopByBudget />);

    const heroImage = screen.getByAltText(/VASTRAA Curated Ethnic & Contemporary Collections/i);
    expect(heroImage).toBeInTheDocument();
    expect(heroImage).toHaveAttribute("src", "/images/shop-by-budget-hero.jpg");

    expect(screen.getByText("VASTRAA EDIT")).toBeInTheDocument();
    expect(screen.getByText("6 Curated Fashion Worlds")).toBeInTheDocument();
    expect(screen.getByText(/Sarees • Kurtis • Gowns • Dresses • Suits • Winter/i)).toBeInTheDocument();
  });

  it("handles category=paithani parameter by rendering category pill and selected subcategory badge", () => {
    mockSearchStr = "budget=under-500&minPrice=0&maxPrice=499&category=paithani";
    render(<ShopByBudget />);

    // Breadcrumb and hero badge
    expect(screen.getByText("Category: Paithani")).toBeInTheDocument();
    expect(screen.getByText("Focused Collection")).toBeInTheDocument();
    expect(screen.getByText("Selected")).toBeInTheDocument();
  });

  it("renders the change-budget control with all five budget ranges", () => {
    render(<ShopByBudget />);

    const controls = screen.getByTestId("change-budget-controls");
    expect(within(controls).getByRole("button", { name: /Under ₹500/i })).toBeInTheDocument();
    expect(within(controls).getByRole("button", { name: /₹500–₹1,000/i })).toBeInTheDocument();
    expect(within(controls).getByRole("button", { name: /₹1,000–₹2,000/i })).toBeInTheDocument();
    expect(within(controls).getByRole("button", { name: /₹2,000–₹5,000/i })).toBeInTheDocument();
    expect(within(controls).getByRole("button", { name: /₹5,000\+/i })).toBeInTheDocument();
  });

  it("switches budget and updates URL when a budget option is clicked", () => {
    render(<ShopByBudget />);

    const under500Btn = screen.getByRole("button", { name: /Under ₹500/i });
    fireEvent.click(under500Btn);

    expect(mockNavigate).toHaveBeenCalled();
    const url = mockNavigate.mock.calls[0][0];
    expect(url).toContain("budget=under-500");
    expect(url).toContain("maxPrice=499");
  });

  it("displays all six official main categories as distinct sections on one page", () => {
    render(<ShopByBudget />);

    expect(screen.getByRole("heading", { name: "Sarees" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Kurtis" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Kurta Sets" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Ethnic Dresses" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Western Dresses" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Winter Wear" })).toBeInTheDocument();
  });

  it("renders official Saree subcategories as circular cards including Explore All", () => {
    render(<ShopByBudget />);

    expect(screen.getByText("Explore All Sarees")).toBeInTheDocument();
    expect(screen.getByText("Paithani")).toBeInTheDocument();
    expect(screen.getByText("Designer")).toBeInTheDocument();
    expect(screen.getByText("Gadwal")).toBeInTheDocument();
    expect(screen.getByText("Banarasi")).toBeInTheDocument();
    expect(screen.getByText("Kanjivaram")).toBeInTheDocument();
    expect(screen.getByText("Chanderi")).toBeInTheDocument();
    expect(screen.getByText("Bandhani")).toBeInTheDocument();
    expect(screen.getByText("Mysore Silk")).toBeInTheDocument();
    expect(screen.getByText("Ikat")).toBeInTheDocument();
    expect(screen.getByText("Cotton")).toBeInTheDocument();
    expect(screen.getByText("Silk")).toBeInTheDocument();
    expect(screen.getByText("Other Traditional")).toBeInTheDocument();
  });

  it("renders official Kurtis subcategories as circular cards", () => {
    render(<ShopByBudget />);

    expect(screen.getByText("Explore All Kurtis")).toBeInTheDocument();
    expect(screen.getByText("Straight Kurti")).toBeInTheDocument();
    expect(screen.getByText("A-Line Kurti")).toBeInTheDocument();
    expect(screen.getByText("Anarkali Kurti")).toBeInTheDocument();
    expect(screen.getByText("Kaftan Kurti")).toBeInTheDocument();
  });

  it("navigates to matching product listing when a subcategory card is clicked with budget parameters", () => {
    render(<ShopByBudget />);

    // Click "Paithani" card under Sarees
    const paithaniCard = screen.getByText("Paithani");
    fireEvent.click(paithaniCard.closest('[role="button"]') || paithaniCard);

    expect(mockNavigate).toHaveBeenCalled();
    const url = mockNavigate.mock.calls[0][0];
    expect(url).toContain("/paithani");
    expect(url).toContain("budget=500-1000");
    expect(url).toContain("minPrice=500");
    expect(url).toContain("maxPrice=999");
  });

  it("navigates to /kurtis with subcategory=straight-kurti and budget when clicked", () => {
    render(<ShopByBudget />);

    const straightKurtiCard = screen.getByText("Straight Kurti");
    fireEvent.click(straightKurtiCard.closest('[role="button"]') || straightKurtiCard);

    expect(mockNavigate).toHaveBeenCalled();
    const url = mockNavigate.mock.calls[0][0];
    expect(url).toContain("/kurtis");
    expect(url).toContain("subcategory=straight-kurti");
    expect(url).toContain("budget=500-1000");
    expect(url).toContain("minPrice=500");
    expect(url).toContain("maxPrice=999");
  });

  it("filters categories in real time when typing in search input", () => {
    render(<ShopByBudget />);

    const searchInput = screen.getByPlaceholderText(/Search categories/i);
    fireEvent.change(searchInput, { target: { value: "Anarkali" } });

    // Anarkali matches Kurti and Ethnic Dress
    expect(screen.getByText("Anarkali Kurti")).toBeInTheDocument();
    expect(screen.getByText("Anarkali Gown")).toBeInTheDocument();

    // Saree subcategories like Gadwal should not be visible
    expect(screen.queryByText("Gadwal")).not.toBeInTheDocument();
  });

  it("displays empty state when no categories match search and allows clearing search", () => {
    render(<ShopByBudget />);

    const searchInput = screen.getByPlaceholderText(/Search categories/i);
    fireEvent.change(searchInput, { target: { value: "NonExistentFabricOrCategory" } });

    expect(screen.getByText(/No Categories Found/i)).toBeInTheDocument();
    const clearBtn = screen.getByTestId("empty-clear-search-btn");
    expect(clearBtn).toBeInTheDocument();

    fireEvent.click(clearBtn);
    expect(screen.getByRole("heading", { name: "Sarees" })).toBeInTheDocument();
  });

  it("does not render products on this category-selection page", () => {
    render(<ShopByBudget />);

    // Ensures product grid or add to cart buttons are not rendered on the category selection page
    expect(screen.queryByText(/Add to Cart/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Product Details/i)).not.toBeInTheDocument();
  });

  describe("buildProductListingUrl helper", () => {
    const testBudget = BUDGET_RANGES[1]; // 500-1000

    it("generates correct url for Explore All Sarees", () => {
      const url = buildProductListingUrl("sarees", null, testBudget);
      expect(url).toBe("/sarees?budget=500-1000&minPrice=500&maxPrice=999&category=sarees");
    });

    it("generates dedicated url for Paithani", () => {
      const url = buildProductListingUrl("sarees", "paithani", testBudget);
      expect(url).toBe("/paithani?budget=500-1000&minPrice=500&maxPrice=999&category=paithani");
    });

    it("generates dedicated url for Designer", () => {
      const url = buildProductListingUrl("sarees", "designer", testBudget);
      expect(url).toBe("/designer?budget=500-1000&minPrice=500&maxPrice=999&category=designer");
    });

    it("generates correct url for Kurtis subcategory", () => {
      const url = buildProductListingUrl("kurtis", "straight-kurti", testBudget);
      expect(url).toBe("/kurtis?budget=500-1000&minPrice=500&maxPrice=999&category=kurtis&subcategory=straight-kurti");
    });

    it("generates correct url for Explore All Kurtis", () => {
      const url = buildProductListingUrl("kurtis", "all", testBudget);
      expect(url).toBe("/kurtis?budget=500-1000&minPrice=500&maxPrice=999&category=kurtis");
    });
  });
});
