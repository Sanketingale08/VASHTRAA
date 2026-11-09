import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ProductsListing } from "../ProductsListing";

// Mock wouter
const mockNavigate = vi.fn();
let mockLocation = "/sarees";
let mockSearch = "";

vi.mock("wouter", () => ({
  useLocation: () => [mockLocation, mockNavigate],
  useSearch: () => mockSearch,
  Link: ({ children, href, ...props }: any) => (
    <a href={href} {...props} onClick={(e) => { e.preventDefault(); mockNavigate(href); }}>
      {children}
    </a>
  ),
}));

// Mock @workspace/api-client-react
vi.mock("@workspace/api-client-react", () => ({
  useListProducts: vi.fn().mockReturnValue({
    data: {
      products: [],
      total: 0,
      page: 1,
      totalPages: 1,
      limit: 24,
    },
    isLoading: false,
    isError: false,
  }),
  useListVendors: vi.fn().mockReturnValue({
    data: [],
    isLoading: false,
  }),
}));

// Mock Layout
vi.mock("@/components/Layout", () => ({
  Layout: ({ children }: any) => <div data-testid="layout">{children}</div>,
}));

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      {ui}
    </QueryClientProvider>
  );
}

describe("Category Descriptions and Promotional Subtitles Removal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const categoriesToTest = [
    {
      name: "Sarees",
      category: "sarees",
      path: "/sarees",
      prohibitedSubtitle: "Centuries of Royal Heritage & Master Artisanal Weaves",
    },
    {
      name: "Kurtis",
      category: "kurtis",
      path: "/kurtis",
      prohibitedSubtitle: "Everyday Elegance & Contemporary Designer Silhouettes",
    },
    {
      name: "Kurta Sets",
      category: "kurta-sets",
      path: "/kurta-sets",
      prohibitedSubtitle: "Coordinated Ethnic Sets & Festive Ensembles",
    },
    {
      name: "Ethnic Dresses",
      category: "ethnic-dresses",
      path: "/ethnic-dresses",
      prohibitedSubtitle: "Timeless Indian Aesthetics with Flowing Modern Gowns",
    },
    {
      name: "Western Dresses",
      category: "western-dresses",
      path: "/western-dresses",
      prohibitedSubtitle: "Global Trends & Runway Chic Silhouettes",
    },
    {
      name: "Winter Wear",
      category: "winter-wear",
      path: "/winter-wear",
      prohibitedSubtitle: "Opulent Warmth & Snug Luxury Ensembles",
    },
    {
      name: "Tops",
      category: "tops",
      path: "/tops",
      prohibitedSubtitle: "Chic, Contemporary & Everyday Tops for Women and Girls",
    },
  ];

  categoriesToTest.forEach(({ name, category, path, prohibitedSubtitle }) => {
    it(`renders category heading for ${name} but does not render promotional subtitle or introductory description`, () => {
      mockLocation = path;
      renderWithClient(
        <ProductsListing
          category={category}
          title={name}
          subtitle={prohibitedSubtitle}
          description="Sample introductory paragraph that should not be visible"
          hideHero={true}
        />
      );

      // Category heading must be visible
      expect(screen.getByRole("heading", { level: 1, name })).toBeInTheDocument();

      // Prohibited promotional subtitle must NOT be in the document
      expect(screen.queryByText(prohibitedSubtitle)).not.toBeInTheDocument();

      // Descriptive paragraph must NOT be in the document
      expect(screen.queryByText("Sample introductory paragraph that should not be visible")).not.toBeInTheDocument();

      // Fallback handcrafted varieties count must NOT be in the document
      expect(screen.queryByText(/Handcrafted Varieties/i)).not.toBeInTheDocument();
    });
  });
});
