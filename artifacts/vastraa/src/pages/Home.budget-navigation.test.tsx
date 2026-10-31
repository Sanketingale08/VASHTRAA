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

// Mock wouter's useLocation and useSearch
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

// Mock Layout to avoid needing all auth/cart/wishlist providers
vi.mock("@/components/Layout", () => ({
  Layout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

// Mock QuickViewModal
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

describe("Home — Shop By Budget and Category Navigation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchStr = "";
  });

  it("ensures 'Showing Paithani Sarees Under ₹1,000' section is completely removed", () => {
    render(<Home />);

    // Unwanted section heading must not exist
    expect(screen.queryByText(/Showing Paithani Sarees Under ₹1,000/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Showing.*Sarees Under/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Clear Budget/i)).not.toBeInTheDocument();

    // The main Shop By Budget section must remain visible
    expect(screen.getByText(/Shop By Budget/i)).toBeInTheDocument();
    expect(screen.getByText(/Explore Saree Collections by Price/i)).toBeInTheDocument();
  });

  it("navigates to /paithani?category=paithani with selected budget when budget card is clicked under Paithani", () => {
    render(<Home />);

    // Click "Under ₹1,000" card
    const under1000Card = screen.getByRole("heading", { name: "Under ₹1,000" });
    fireEvent.click(under1000Card.closest(".cursor-pointer")!);

    expect(mockNavigate).toHaveBeenCalledWith("/paithani?category=paithani&minPrice=0&maxPrice=1000");
  });

  it("navigates to /paithani?category=paithani&minPrice=2000&maxPrice=5000 for mid-range budget", () => {
    render(<Home />);

    const midCard = screen.getByRole("heading", { name: "₹2,000 – ₹5,000" });
    fireEvent.click(midCard.closest(".cursor-pointer")!);

    expect(mockNavigate).toHaveBeenCalledWith("/paithani?category=paithani&minPrice=2000&maxPrice=5000");
  });

  it("navigates to /paithani?category=paithani&minPrice=5000 for premium budget", () => {
    render(<Home />);

    const premiumCard = screen.getByRole("heading", { name: "Premium (₹5,000+)" });
    fireEvent.click(premiumCard.closest(".cursor-pointer")!);

    expect(mockNavigate).toHaveBeenCalledWith("/paithani?category=paithani&minPrice=5000");
  });

  it("navigates to /designer?category=designer with budget when Designer category is active", () => {
    render(<Home />);

    // Click Designer button
    const designerBtn = screen.getByRole("button", { name: "Designer" });
    fireEvent.click(designerBtn);

    // Click "Under ₹2,000" card
    const under2000Card = screen.getByRole("heading", { name: "Under ₹2,000" });
    fireEvent.click(under2000Card.closest(".cursor-pointer")!);

    expect(mockNavigate).toHaveBeenCalledWith("/designer?category=designer&minPrice=0&maxPrice=2000");
  });

  it("navigates to /designer?category=designer&minPrice=5000 for premium budget under Designer", () => {
    render(<Home />);

    // Click Designer button
    const designerBtn = screen.getByRole("button", { name: "Designer" });
    fireEvent.click(designerBtn);

    // Click "Premium (₹5,000+)" card
    const premiumCard = screen.getByRole("heading", { name: "Premium (₹5,000+)" });
    fireEvent.click(premiumCard.closest(".cursor-pointer")!);

    expect(mockNavigate).toHaveBeenCalledWith("/designer?category=designer&minPrice=5000");
  });

  it("updates the View All in Catalog link based on selected category", () => {
    render(<Home />);

    // Initially Paithani is selected
    const viewAllLink = screen.getByRole("link", { name: /View All Paithani in Catalog/i });
    expect(viewAllLink).toHaveAttribute("href", "/paithani?category=paithani");

    // Switch to Designer
    const designerBtn = screen.getByRole("button", { name: "Designer" });
    fireEvent.click(designerBtn);

    const viewAllDesignerLink = screen.getByRole("link", { name: /View All Designer in Catalog/i });
    expect(viewAllDesignerLink).toHaveAttribute("href", "/designer?category=designer");
  });
});
