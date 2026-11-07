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

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import Home from "./Home";

const testQueryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false, gcTime: 0 },
  },
});

function renderWithClient(ui: React.ReactElement) {
  return render(
    <QueryClientProvider client={testQueryClient}>
      {ui}
    </QueryClientProvider>
  );
}

describe("Home — Shop By Budget and Category Navigation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchStr = "";
  });

  it("renders the clean Shop By Budget section without removed elements", () => {
    renderWithClient(<Home />);

    // Eyebrow and main heading are present
    expect(screen.getByText(/SHOP BY BUDGET/i)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Explore Collections by Price/i })).toBeInTheDocument();

    // Removed elements must NOT be present
    expect(screen.queryByText(/Find your perfect style at a price that feels right/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /VIEW ALL COLLECTIONS/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Paithani$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Designer$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^All Sarees$/i })).not.toBeInTheDocument();
  });

  it("displays the official budget cards in the Shop by Budget section without Under ₹500", () => {
    renderWithClient(<Home />);

    expect(screen.queryByRole("heading", { name: "Under ₹500" })).not.toBeInTheDocument();
    expect(screen.queryByText("Budget Finds")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "₹500–₹1,000" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "₹1,000–₹2,000" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "₹2,000–₹5,000" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "₹5,000+" })).toBeInTheDocument();
  });

  it("ensures Under ₹500 budget card is removed from Explore Collections by Price", () => {
    renderWithClient(<Home />);

    expect(screen.queryByRole("heading", { name: "Under ₹500" })).not.toBeInTheDocument();
    expect(screen.queryByText("Budget Finds")).not.toBeInTheDocument();
  });

  it("navigates to /shop-by-budget with budget=500-1000 for everyday favorites", () => {
    renderWithClient(<Home />);

    const card = screen.getByRole("heading", { name: "₹500–₹1,000" });
    fireEvent.click(card.closest('[role="button"]') || card.closest(".cursor-pointer")!);

    expect(mockNavigate).toHaveBeenCalled();
    const targetUrl = mockNavigate.mock.calls[0][0];
    expect(targetUrl).toBe("/shop-by-budget?budget=500-1000&minPrice=500&maxPrice=999");
  });

  it("navigates to /shop-by-budget with budget=1000-2000 for festive collection", () => {
    renderWithClient(<Home />);

    const card = screen.getByRole("heading", { name: "₹1,000–₹2,000" });
    fireEvent.click(card.closest('[role="button"]') || card.closest(".cursor-pointer")!);

    expect(mockNavigate).toHaveBeenCalled();
    const targetUrl = mockNavigate.mock.calls[0][0];
    expect(targetUrl).toBe("/shop-by-budget?budget=1000-2000&minPrice=1000&maxPrice=1999");
  });

  it("navigates to /shop-by-budget with budget=2000-5000 for mid-range budget", () => {
    renderWithClient(<Home />);

    const midCard = screen.getByRole("heading", { name: "₹2,000–₹5,000" });
    fireEvent.click(midCard.closest('[role="button"]') || midCard.closest(".cursor-pointer")!);

    expect(mockNavigate).toHaveBeenCalled();
    const targetUrl = mockNavigate.mock.calls[0][0];
    expect(targetUrl).toBe("/shop-by-budget?budget=2000-5000&minPrice=2000&maxPrice=4999");
  });

  it("navigates to /shop-by-budget with budget=5000-above for luxury budget", () => {
    renderWithClient(<Home />);

    const premiumCard = screen.getByRole("heading", { name: "₹5,000+" });
    fireEvent.click(premiumCard.closest('[role="button"]') || premiumCard.closest(".cursor-pointer")!);

    expect(mockNavigate).toHaveBeenCalled();
    const targetUrl = mockNavigate.mock.calls[0][0];
    expect(targetUrl).toBe("/shop-by-budget?budget=5000-above&minPrice=5000");
  });
});
