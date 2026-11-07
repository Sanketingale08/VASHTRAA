import React from "react";
import { render as rtlRender, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
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

const mockProducts = [
  {
    id: "prod-paithani-1",
    name: "Yeola Royal Peacock Silk Paithani Saree",
    category: "paithani",
    price: 18500,
    images: ["/images/p1.png"],
  },
  {
    id: "prod-banarasi-1",
    name: "Katan Silk Zari Floral Banarasi Saree",
    category: "banarasi",
    price: 24000,
    images: ["/images/b1.png"],
  },
  {
    id: "prod-kanjivaram-1",
    name: "Pure Mulberry Korvai Kanjivaram Saree",
    category: "kanjivaram",
    price: 32000,
    images: ["/images/k1.png"],
  },
  {
    id: "prod-designer-1",
    name: "Hand-Painted Organza Sequin Designer Saree",
    category: "designer",
    price: 14500,
    images: ["/images/d1.png"],
  },
];

vi.mock("@workspace/api-client-react", async () => {
  const actual = await vi.importActual("@workspace/api-client-react");
  return {
    ...actual,
    useListProducts: vi.fn().mockImplementation((params) => {
      if (params?.ids) {
        return { data: { products: mockProducts }, isLoading: false };
      }
      return { data: { products: [] }, isLoading: false };
    }),
    getListProductsQueryKey: vi.fn().mockReturnValue(["mock-key"]),
  };
});

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

import Home from "../Home";

describe("Recently Viewed Category Filter Menu", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchStr = "";
    localStorage.setItem(
      "twirl_recently_viewed",
      JSON.stringify(["prod-paithani-1", "prod-banarasi-1", "prod-kanjivaram-1", "prod-designer-1"])
    );
  });

  it("renders Category Menu and lists all 12 main categories", () => {
    render(<Home />);

    const menuButton = screen.getByRole("button", { name: /Category filter menu/i });
    expect(menuButton).toBeInTheDocument();

    fireEvent.click(menuButton);

    const categories = [
      "Paithani Sarees",
      "Designer Sarees",
      "Gadwal Sarees",
      "Banarasi Sarees",
      "Kanjivaram Sarees",
      "Chanderi Sarees",
      "Bandhani Sarees",
      "Mysore Silk Sarees",
      "Ikat Sarees",
      "Cotton Sarees",
      "Silk Sarees",
      "Other Traditional Sarees",
    ];

    for (const cat of categories) {
      expect(screen.getByRole("menuitem", { name: new RegExp(`^${cat}$`, "i") })).toBeInTheDocument();
    }
  });

  it("filters and displays only Banarasi recently viewed products when Banarasi is selected", async () => {
    render(<Home />);

    const menuButton = screen.getByRole("button", { name: /Category filter menu/i });
    fireEvent.click(menuButton);

    const banarasiOption = screen.getByRole("menuitem", { name: /^Banarasi Sarees$/i });
    fireEvent.click(banarasiOption);

    // Only Banarasi should be in the document
    expect(screen.getByText(/Katan Silk Zari Floral Banarasi Saree/i)).toBeInTheDocument();
    expect(screen.queryByText(/Yeola Royal Peacock Silk Paithani Saree/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Pure Mulberry Korvai Kanjivaram Saree/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Hand-Painted Organza Sequin Designer Saree/i)).not.toBeInTheDocument();
  });

  it("filters and displays only Kanjivaram recently viewed products when Kanjivaram is selected", async () => {
    render(<Home />);

    const menuButton = screen.getByRole("button", { name: /Category filter menu/i });
    fireEvent.click(menuButton);

    const kanjivaramOption = screen.getByRole("menuitem", { name: /^Kanjivaram Sarees$/i });
    fireEvent.click(kanjivaramOption);

    expect(screen.getByText(/Pure Mulberry Korvai Kanjivaram Saree/i)).toBeInTheDocument();
    expect(screen.queryByText(/Katan Silk Zari Floral Banarasi Saree/i)).not.toBeInTheDocument();
  });

  it("shows empty state when selecting a category with zero viewed items", () => {
    render(<Home />);

    const menuButton = screen.getByRole("button", { name: /Category filter menu/i });
    fireEvent.click(menuButton);

    const chanderiOption = screen.getByRole("menuitem", { name: /^Chanderi Sarees$/i });
    fireEvent.click(chanderiOption);

    expect(screen.getByText(/No Chanderi sarees viewed yet/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Explore Chanderi Collection/i })).toHaveAttribute("href", "/chanderi");
  });

  it("closes the Category Menu on Escape key", () => {
    render(<Home />);

    const menuButton = screen.getByRole("button", { name: /Category filter menu/i });
    fireEvent.click(menuButton);
    expect(screen.getByRole("menu")).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });
});
