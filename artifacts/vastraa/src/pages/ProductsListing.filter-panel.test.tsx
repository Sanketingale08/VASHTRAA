import React from "react";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
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

let mockSearchStr = "";
let mockCurrentPath = "/paithani";
const mockNavigate = vi.fn((url: string) => {
  const [p, qs] = url.split("?");
  mockCurrentPath = p;
  mockSearchStr = qs || "";
});

vi.mock("wouter", async () => {
  const actual = await vi.importActual("wouter");
  return {
    ...actual,
    useLocation: () => [mockCurrentPath, mockNavigate],
    useSearch: () => mockSearchStr,
    Link: ({ href, children, ...props }: any) => (
      <a href={href} {...props}>
        {children}
      </a>
    ),
  };
});

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
const mockUseListVendors = vi.fn().mockReturnValue({ data: [] });

vi.mock("@workspace/api-client-react", async () => {
  const actual = await vi.importActual("@workspace/api-client-react");
  return {
    ...actual,
    useListProducts: (params: any) => mockUseListProducts(params),
    useListVendors: () => mockUseListVendors(),
  };
});

vi.mock("@tanstack/react-query", async () => {
  const actual = await vi.importActual("@tanstack/react-query");
  return {
    ...actual,
    useQuery: () => ({ data: null }),
    useQueryClient: () => ({
      invalidateQueries: vi.fn(),
      setQueryData: vi.fn(),
    }),
  };
});

vi.mock("@/lib/api", () => ({
  apiFetch: vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }),
}));

import { ProductsListing } from "./ProductsListing";
import Paithani from "./Paithani";
import Designer from "./Designer";

describe("Filter Panel Behavior on Paithani and Designer Pages", () => {
  const paithaniProducts = [
    {
      id: "prod-p1",
      name: "Pure Silk Peshwai Paithani",
      price: 12000,
      category: "paithani",
      fabric: "Pure Silk",
      vendorName: "Yeola Weavers",
      images: ["/test-p1.jpg"],
      stock: 5,
      rating: 4.8,
    },
    {
      id: "prod-p2",
      name: "Kathpadar Paithani Saree",
      price: 8500,
      category: "paithani",
      fabric: "Cotton",
      vendorName: "Yeola Weavers",
      images: ["/test-p2.jpg"],
      stock: 4,
      rating: 4.5,
    },
  ];

  const designerProducts = [
    {
      id: "prod-d1",
      name: "Bollywood Georgette Designer Saree",
      price: 4999,
      category: "designer",
      fabric: "Georgette",
      vendorName: "Couture Mumbai",
      images: ["/test-d1.jpg"],
      stock: 3,
      rating: 4.6,
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    mockCurrentPath = "/paithani";
    mockSearchStr = "category=paithani";
    mockUseListProducts.mockReturnValue({
      data: { products: paithaniProducts, total: 2, totalPages: 1 },
      isLoading: false,
      isError: false,
    });
  });

  it("Criterion 1: Filter panel is hidden on initial page load", () => {
    mockCurrentPath = "/paithani";
    mockSearchStr = "category=paithani";

    render(<Paithani />);

    // Filter button is visible
    expect(screen.getByRole("button", { name: /^filter$/i })).toBeInTheDocument();

    // Filter panel (with Apply Filters and Cancel buttons) is NOT displayed
    expect(screen.queryByRole("button", { name: /apply filters/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /cancel/i })).not.toBeInTheDocument();
  });

  it("Criterion 1 (Designer): Filter panel is hidden on initial page load on Designer page", () => {
    mockCurrentPath = "/designer";
    mockSearchStr = "category=designer";
    mockUseListProducts.mockReturnValue({
      data: { products: designerProducts, total: 1, totalPages: 1 },
      isLoading: false,
      isError: false,
    });

    render(<Designer />);

    expect(screen.getByRole("button", { name: /^filter$/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /apply filters/i })).not.toBeInTheDocument();
  });

  it("Criterion 1 (with URL filters): Filter panel remains hidden after load even when URL has filter params", () => {
    mockCurrentPath = "/paithani";
    mockSearchStr = "category=paithani&minPrice=2000&maxPrice=5000";

    render(<Paithani />);

    // Applied filters are restored from URL
    expect(mockUseListProducts).toHaveBeenCalledWith(
      expect.objectContaining({
        category: "paithani",
        minPrice: 2000,
        maxPrice: 5000,
      })
    );

    // But panel is NOT open
    expect(screen.queryByRole("button", { name: /apply filters/i })).not.toBeInTheDocument();
  });

  it("Criterion 2: Clicking Filter button opens the filter panel", () => {
    render(<Paithani />);

    const filterBtn = screen.getByRole("button", { name: /^filter$/i });
    fireEvent.click(filterBtn);

    // Now Apply Filters and Cancel buttons are visible
    expect(screen.getByRole("button", { name: /apply filters/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /cancel/i })).toBeInTheDocument();
  });

  it("Criterion 3: Changing a filter inside the panel does not immediately change products", () => {
    render(<Paithani />);

    // Open filter panel
    fireEvent.click(screen.getByRole("button", { name: /^filter$/i }));

    // Find and check a fabric filter (e.g. Pure Silk)
    const pureSilkCheckbox = screen.getByRole("checkbox", { name: /pure silk/i });
    fireEvent.click(pureSilkCheckbox);
    expect(pureSilkCheckbox).toBeChecked();

    // The products query should NOT have been called with the pending selection
    const callsAfterCheckbox = mockUseListProducts.mock.calls;
    const lastCall = callsAfterCheckbox[callsAfterCheckbox.length - 1][0];
    expect(lastCall.fabric).toBeUndefined();

    // Product listing is untouched
    expect(screen.getByText("Pure Silk Peshwai Paithani")).toBeInTheDocument();
    expect(screen.getByText("Kathpadar Paithani Saree")).toBeInTheDocument();
  });

  it("Criterion 4: Clicking Apply Filters updates the product listing and resets pagination", async () => {
    render(<Paithani />);

    // Open panel
    fireEvent.click(screen.getByRole("button", { name: /^filter$/i }));

    // Select Pure Silk
    const pureSilkCheckbox = screen.getByRole("checkbox", { name: /pure silk/i });
    fireEvent.click(pureSilkCheckbox);

    // Mock response after filter application
    mockUseListProducts.mockReturnValue({
      data: { products: [paithaniProducts[0]], total: 1, totalPages: 1 },
      isLoading: false,
      isError: false,
    });

    // Click Apply Filters
    const applyBtn = screen.getByRole("button", { name: /apply filters/i });
    fireEvent.click(applyBtn);

    // useListProducts is now called with applied fabric filter
    expect(mockUseListProducts).toHaveBeenCalledWith(
      expect.objectContaining({
        category: "paithani",
        fabric: "pure silk",
        page: 1,
      })
    );

    // Panel automatically closes after successful application
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: /apply filters/i })).not.toBeInTheDocument();
    });
  });

  it("Criterion 5: Clicking Cancel discards unconfirmed changes and restores previous applied filters", async () => {
    render(<Paithani />);

    // Open panel
    fireEvent.click(screen.getByRole("button", { name: /^filter$/i }));

    // Select Cotton
    const cottonCheckbox = screen.getByRole("checkbox", { name: /cotton/i });
    fireEvent.click(cottonCheckbox);
    expect(cottonCheckbox).toBeChecked();

    // Click Cancel
    const cancelBtn = screen.getByRole("button", { name: /cancel/i });
    fireEvent.click(cancelBtn);

    // Panel closed
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: /apply filters/i })).not.toBeInTheDocument();
    });

    // Product query should not contain cotton
    const lastCall = mockUseListProducts.mock.calls[mockUseListProducts.mock.calls.length - 1][0];
    expect(lastCall.fabric).toBeUndefined();

    // Reopen panel to verify pending state was restored (cotton is NOT checked)
    fireEvent.click(screen.getByRole("button", { name: /^filter$/i }));
    const cottonReopened = screen.getByRole("checkbox", { name: /cotton/i });
    expect(cottonReopened).not.toBeChecked();
  });

  it("Criterion 6: Clear All requires Apply Filters before affecting products", async () => {
    // Start with an applied filter
    mockSearchStr = "category=paithani&fabric=cotton";
    render(<Paithani />);

    // Open panel
    fireEvent.click(screen.getByRole("button", { name: /^filter$/i }));

    // Click Clear all inside panel
    const clearAllBtn = screen.getByRole("button", { name: /clear all/i });
    fireEvent.click(clearAllBtn);

    // Products query should STILL have the previously applied filter until Apply Filters is clicked
    const calls = mockUseListProducts.mock.calls;
    const lastCall = calls[calls.length - 1][0];
    expect(lastCall.fabric).toBe("cotton");

    // Click Cancel instead of Apply
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));

    // Wait for panel to close
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: /apply filters/i })).not.toBeInTheDocument();
    });

    // Reopen panel: cotton should still be preserved
    fireEvent.click(screen.getByRole("button", { name: /^filter$/i }));
    const cottonCheckbox = screen.getByRole("checkbox", { name: /cotton/i });
    expect(cottonCheckbox).toBeChecked();
  });

  it("Criterion 7: Failed requests do not silently wipe previously displayed products", () => {
    mockUseListProducts.mockReturnValue({
      data: { products: paithaniProducts, total: 2, totalPages: 1 },
      isLoading: false,
      isError: false,
    });

    const { rerender } = render(<Paithani />);

    expect(screen.getByText("Pure Silk Peshwai Paithani")).toBeInTheDocument();

    // Simulate backend failure on subsequent query
    mockUseListProducts.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
    });

    rerender(<Paithani />);

    // Previous products are retained and error banner is displayed
    expect(screen.getByText("Pure Silk Peshwai Paithani")).toBeInTheDocument();
    expect(screen.getByText(/failed to load products/i)).toBeInTheDocument();
  });

  it("Criterion 8: Category restrictions remain enforced on Paithani and Designer pages", async () => {
    mockCurrentPath = "/designer";
    mockSearchStr = "category=designer";
    mockUseListProducts.mockReturnValue({
      data: { products: designerProducts, total: 1, totalPages: 1 },
      isLoading: false,
      isError: false,
    });

    render(<Designer />);

    // Must be restricted to designer
    expect(mockUseListProducts).toHaveBeenCalledWith(
      expect.objectContaining({
        category: "designer",
      })
    );

    // Open filter panel
    fireEvent.click(screen.getByRole("button", { name: /^filter$/i }));

    // Apply a price filter from inside the panel
    const sidebar = screen.getByTestId("desktop-filter-sidebar");
    const under500Btn = within(sidebar).getByRole("button", { name: /under ₹500/i });
    fireEvent.click(under500Btn);

    fireEvent.click(within(sidebar).getByRole("button", { name: /apply filters/i }));

    // Ensure category="designer" was retained and not lost
    expect(mockUseListProducts).toHaveBeenCalledWith(
      expect.objectContaining({
        category: "designer",
        minPrice: 0,
        maxPrice: 500,
      })
    );

    await waitFor(() => {
      expect(screen.queryByRole("button", { name: /apply filters/i })).not.toBeInTheDocument();
    });
  });

  it("Criterion 9: Invalid filter values display an error and prevent application", () => {
    render(<Paithani />);

    // Open panel
    fireEvent.click(screen.getByRole("button", { name: /^filter$/i }));

    // Set invalid price range: min 5000 > max 1000
    const minInput = screen.getByPlaceholderText("300");
    const maxInput = screen.getByPlaceholderText("1500+");

    fireEvent.change(minInput, { target: { value: "5000" } });
    fireEvent.change(maxInput, { target: { value: "1000" } });

    // Click Apply Filters
    fireEvent.click(screen.getByRole("button", { name: /apply filters/i }));

    // Error is displayed inside panel
    expect(screen.getByText(/min price cannot be greater than max price/i)).toBeInTheDocument();

    // Panel does not close
    expect(screen.getByRole("button", { name: /apply filters/i })).toBeInTheDocument();

    // Query is not triggered with invalid prices
    const calls = mockUseListProducts.mock.calls;
    const lastCall = calls[calls.length - 1][0];
    expect(lastCall.minPrice).toBeUndefined();
  });
});
