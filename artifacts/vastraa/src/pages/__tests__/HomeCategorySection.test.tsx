import React from "react";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import Home from "../Home";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

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

let mockLocation = "/";
const mockNavigate = vi.fn((to: string) => {
  mockLocation = to;
});

vi.mock("wouter", async () => {
  const actual = await vi.importActual("wouter");
  return {
    ...actual,
    useLocation: () => [mockLocation, mockNavigate],
    useSearch: () => "",
    Link: ({ href, children, onClick, ...props }: any) => (
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
  };
});

vi.mock("@/components/Layout", () => ({
  Layout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/QuickViewModal", () => ({
  QuickViewModal: () => null,
}));

vi.mock("@workspace/api-client-react", async () => {
  const actual = await vi.importActual("@workspace/api-client-react");
  return {
    ...actual,
    useListProducts: vi.fn().mockReturnValue({ data: { products: [] }, isLoading: false }),
    getListProductsQueryKey: vi.fn().mockReturnValue(["products"]),
  };
});

describe("Home — Explore by Category Section with Tops", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    mockLocation = "/";
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
  });

  it("renders the Explore by Category section with Tops alongside existing categories", () => {
    render(
      <QueryClientProvider client={queryClient}>
        <Home />
      </QueryClientProvider>
    );

    const section = screen.getByLabelText("Explore by Category");
    expect(section).toBeInTheDocument();

    // Verify all 7 categories are displayed in the Explore by Category section
    expect(within(section).getByText("Sarees")).toBeInTheDocument();
    expect(within(section).getByText("Kurtis")).toBeInTheDocument();
    expect(within(section).getByText("Kurta Sets")).toBeInTheDocument();
    expect(within(section).getByText("Ethnic Dresses")).toBeInTheDocument();
    expect(within(section).getByText("Western Dresses")).toBeInTheDocument();
    expect(within(section).getByText("Winter Wear")).toBeInTheDocument();
    expect(within(section).getByText("Tops")).toBeInTheDocument();
  });

  it("clicking the Tops category card navigates to /tops", () => {
    render(
      <QueryClientProvider client={queryClient}>
        <Home />
      </QueryClientProvider>
    );

    const section = screen.getByLabelText("Explore by Category");
    const topsLink = within(section).getByText("Tops").closest("a");
    expect(topsLink).toBeInTheDocument();
    expect(topsLink).toHaveAttribute("href", "/tops");

    fireEvent.click(topsLink!);
    expect(mockNavigate).toHaveBeenCalledWith("/tops");
  });
});

