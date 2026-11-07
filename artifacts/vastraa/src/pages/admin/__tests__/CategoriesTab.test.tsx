import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CategoriesTab, ProductCategory } from "../CategoriesTab";
import * as adminApi from "@/lib/adminApi";

vi.mock("@/lib/adminApi", () => ({
  adminFetch: vi.fn(),
}));

const mockCategories: ProductCategory[] = [
  {
    id: "cat-paithani-default",
    name: "Paithani Sarees",
    slug: "paithani",
    type: "main",
    displayOrder: 1,
    description: "Centuries of royal heritage from Yeola.",
    active: true,
    status: "approved",
    productCount: 13,
    subcategoriesCount: 3,
    subcategories: [
      {
        id: "sub-paithani-bridal",
        name: "Bridal Paithani",
        slug: "bridal-paithani",
        parentId: "cat-paithani-default",
        parentCategory: "paithani",
        productCount: 8,
        active: true,
        status: "approved",
        subtypes: ["Royal Peshwai", "Muniya Border", "Red Bridal"],
      },
      {
        id: "sub-paithani-traditional",
        name: "Traditional Yeola",
        slug: "traditional-yeola",
        parentId: "cat-paithani-default",
        parentCategory: "paithani",
        productCount: 5,
        active: true,
        status: "approved",
        subtypes: ["Kadiyal Weave", "Brocade Jaal"],
      },
      {
        id: "sub-paithani-semi",
        name: "Semi-Paithani",
        slug: "semi-paithani",
        parentId: "cat-paithani-default",
        parentCategory: "paithani",
        productCount: 0,
        active: false,
        status: "approved",
        subtypes: ["Art Silk"],
      },
    ],
  },
  {
    id: "cat-designer-default",
    name: "Designer Sarees",
    slug: "designer",
    type: "main",
    displayOrder: 2,
    description: "Runway couture and contemporary glamour.",
    active: true,
    status: "approved",
    productCount: 7,
    subcategoriesCount: 2,
    subcategories: [
      {
        id: "sub-designer-party",
        name: "Party Wear",
        slug: "party-wear",
        parentId: "cat-designer-default",
        parentCategory: "designer",
        productCount: 3,
        active: true,
        status: "approved",
        subtypes: ["Cocktail Drapes", "Sequin Cutwork"],
      },
      {
        id: "sub-designer-bollywood",
        name: "Bollywood Glam",
        slug: "bollywood-glam",
        parentId: "cat-designer-default",
        parentCategory: "designer",
        productCount: 4,
        active: true,
        status: "approved",
        subtypes: ["Organza Shimmer"],
      },
    ],
  },
  {
    id: "cat-gadwal-default",
    name: "Gadwal Sarees",
    slug: "gadwal",
    type: "main",
    displayOrder: 3,
    description: "Kuppadam interlock temple borders.",
    active: false,
    status: "approved",
    productCount: 0,
    subcategoriesCount: 1,
    subcategories: [
      {
        id: "sub-gadwal-kuppadam",
        name: "Kuppadam Border",
        slug: "kuppadam-border",
        parentId: "cat-gadwal-default",
        parentCategory: "gadwal",
        productCount: 0,
        active: true,
        status: "approved",
        subtypes: ["Silk Gadwal"],
      },
    ],
  },
  {
    id: "cat-tops-default",
    name: "Women's Tops",
    slug: "tops",
    type: "main",
    displayOrder: 7,
    description: "Chic, contemporary, and everyday tops for women and girls.",
    active: true,
    status: "approved",
    productCount: 4,
    subcategoriesCount: 42,
    subcategories: [
      {
        id: "sub-tops-crop",
        name: "Crop Tops",
        slug: "crop-tops",
        parentId: "cat-tops-default",
        parentCategory: "tops",
        group: "Women's Tops",
        productCount: 2,
        active: true,
        status: "approved",
        subtypes: ["Fitted Crop Top", "Boxy Crop Top"],
      },
      {
        id: "sub-tops-girls-casual",
        name: "Girls Casual Tops",
        slug: "girls-casual-tops",
        parentId: "cat-tops-default",
        parentCategory: "tops",
        group: "Girls' Tops",
        productCount: 1,
        active: true,
        status: "approved",
        subtypes: ["Cotton Everyday Top"],
      },
      {
        id: "sub-tops-winter",
        name: "Winter Tops",
        slug: "winter-tops",
        parentId: "cat-tops-default",
        parentCategory: "tops",
        group: "Seasonal Tops",
        productCount: 1,
        active: true,
        status: "approved",
        subtypes: ["Fleece-Lined Warm Top"],
      },
      ...Array.from({ length: 39 }, (_, i) => ({
        id: `sub-tops-extra-${i + 1}`,
        name: `Tops Variety ${i + 1}`,
        slug: `tops-variety-${i + 1}`,
        parentId: "cat-tops-default",
        parentCategory: "tops",
        group: "Women's Tops",
        productCount: 0,
        active: true,
        status: "approved" as const,
        subtypes: [],
      })),
    ],
  },
];

describe("Admin CategoriesTab — Redesigned UI", () => {
  let queryClient: QueryClient;
  const mockToast = {
    ok: vi.fn(),
    err: vi.fn(),
  };
  const mockOnNavigateProducts = vi.fn();
  const mockOnOpenMediaModal = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: 0 },
      },
    });

    (adminApi.adminFetch as any).mockImplementation((url: string) => {
      if (url.includes("/api/admin/categories")) {
        return Promise.resolve({
          categories: mockCategories,
          stats: {
            total: 3,
            pending: 0,
            approved: 3,
            rejected: 0,
            activePublic: 2,
            noCover: 0,
          },
        });
      }
      return Promise.resolve({ ok: true });
    });
  });

  function renderComponent() {
    return render(
      <QueryClientProvider client={queryClient}>
        <CategoriesTab
          toast={mockToast}
          onNavigateProducts={mockOnNavigateProducts}
          onOpenMediaModal={mockOnOpenMediaModal}
        />
      </QueryClientProvider>
    );
  }

  it("renders default view showing ONLY main categories (subcategories collapsed by default)", async () => {
    renderComponent();

    // Verify main category names are present
    expect(await screen.findByText("Paithani Sarees")).toBeInTheDocument();
    expect(screen.getByText("Designer Sarees")).toBeInTheDocument();
    expect(screen.getByText("Gadwal Sarees")).toBeInTheDocument();

    // Verify subcategories are NOT visible in default collapsed state
    expect(screen.queryByText("Bridal Paithani")).not.toBeInTheDocument();
    expect(screen.queryByText("Traditional Yeola")).not.toBeInTheDocument();
    expect(screen.queryByText("Bollywood Glam")).not.toBeInTheDocument();
  });

  it("renders the required table columns and product count badges", async () => {
    renderComponent();

    expect(await screen.findByText("Paithani Sarees")).toBeInTheDocument();

    // Column Headers
    expect(screen.getByRole("columnheader", { name: "Category" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Total Products" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Total Subcategories" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Status" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Actions" })).toBeInTheDocument();

    // Total Products Badges
    expect(screen.getByText("13 Products")).toBeInTheDocument();
    expect(screen.getByText("7 Products")).toBeInTheDocument();
    expect(screen.getByText("4 Products")).toBeInTheDocument();
    expect(screen.getByText("0 Products")).toBeInTheDocument();

    // Total Subcategories Count Badges
    expect(screen.getByText("3 Subcategories")).toBeInTheDocument();
    expect(screen.getByText("2 Subcategories")).toBeInTheDocument();
    expect(screen.getByText("1 Subcategories")).toBeInTheDocument();
    expect(screen.getByText("42 Subcategories")).toBeInTheDocument();
  });

  it("expands nested subcategories section when chevron is clicked", async () => {
    renderComponent();

    expect(await screen.findByText("Paithani Sarees")).toBeInTheDocument();

    const paithaniToggle = screen.getByLabelText("Toggle subcategories for Paithani Sarees");
    expect(paithaniToggle).toHaveAttribute("aria-expanded", "false");

    // Click to expand Paithani
    fireEvent.click(paithaniToggle);

    // Paithani's subcategories should now be visible
    expect(await screen.findByText("Bridal Paithani")).toBeInTheDocument();
    expect(screen.getByText("Traditional Yeola")).toBeInTheDocument();
    expect(screen.getByText("Semi-Paithani")).toBeInTheDocument();

    // Subcategory product counts
    expect(screen.getByText("8 Products")).toBeInTheDocument();
    expect(screen.getByText("5 Products")).toBeInTheDocument();

    // Subtypes tags
    expect(screen.getByText("Royal Peshwai")).toBeInTheDocument();
    expect(screen.getByText("Muniya Border")).toBeInTheDocument();

    // Designer's subcategories must NOT be visible
    expect(screen.queryByText("Party Wear")).not.toBeInTheDocument();
    expect(screen.queryByText("Bollywood Glam")).not.toBeInTheDocument();
  });

  it("implements accordion behavior: expanding category B automatically collapses category A", async () => {
    renderComponent();

    expect(await screen.findByText("Paithani Sarees")).toBeInTheDocument();

    const paithaniToggle = screen.getByLabelText("Toggle subcategories for Paithani Sarees");
    const designerToggle = screen.getByLabelText("Toggle subcategories for Designer Sarees");

    // Expand Paithani
    fireEvent.click(paithaniToggle);
    expect(await screen.findByText("Bridal Paithani")).toBeInTheDocument();

    // Now expand Designer
    fireEvent.click(designerToggle);

    // Designer subcategories should now be visible
    expect(await screen.findByText("Party Wear")).toBeInTheDocument();
    expect(screen.getByText("Bollywood Glam")).toBeInTheDocument();

    // Paithani subcategories should have automatically collapsed
    expect(screen.queryByText("Bridal Paithani")).not.toBeInTheDocument();
    expect(screen.queryByText("Traditional Yeola")).not.toBeInTheDocument();

    // Clicking Designer chevron again collapses Designer
    fireEvent.click(designerToggle);
    expect(screen.queryByText("Party Wear")).not.toBeInTheDocument();
  });

  it("triggers product navigation with category filter when main category product count is clicked", async () => {
    renderComponent();

    expect(await screen.findByText("Paithani Sarees")).toBeInTheDocument();

    const paithaniProdBtn = screen.getByTitle("Click to view all products in Paithani Sarees");
    fireEvent.click(paithaniProdBtn);

    expect(mockOnNavigateProducts).toHaveBeenCalledWith("paithani");
  });

  it("triggers product navigation with category AND subcategory filter when subcategory product count is clicked", async () => {
    renderComponent();

    expect(await screen.findByText("Paithani Sarees")).toBeInTheDocument();

    // Expand Paithani
    fireEvent.click(screen.getByLabelText("Toggle subcategories for Paithani Sarees"));
    expect(await screen.findByText("Bridal Paithani")).toBeInTheDocument();

    // Click Bridal Paithani product count
    const bridalBtn = screen.getByTitle("Click to filter products by Paithani Sarees > Bridal Paithani");
    fireEvent.click(bridalBtn);

    expect(mockOnNavigateProducts).toHaveBeenCalledWith("paithani", "bridal-paithani");
  });

  it("auto-expands parent category when searching for a subcategory name", async () => {
    renderComponent();

    expect(await screen.findByText("Paithani Sarees")).toBeInTheDocument();

    const searchInput = screen.getByPlaceholderText("Search category or subcategory...");
    fireEvent.change(searchInput, { target: { value: "Bridal" } });

    // Should automatically expand Paithani and show Bridal Paithani
    await waitFor(() => {
      expect(screen.getByText("Bridal Paithani")).toBeInTheDocument();
    });
  });

  it("resets search, filters, and collapses categories when Reset button is clicked", async () => {
    renderComponent();

    expect(await screen.findByText("Paithani Sarees")).toBeInTheDocument();

    // Expand Paithani
    fireEvent.click(screen.getByLabelText("Toggle subcategories for Paithani Sarees"));
    expect(await screen.findByText("Bridal Paithani")).toBeInTheDocument();

    // Set search
    const searchInput = screen.getByPlaceholderText("Search category or subcategory...");
    fireEvent.change(searchInput, { target: { value: "Yeola" } });

    // Click Reset
    const resetBtn = screen.getByTitle("Reset Filters");
    fireEvent.click(resetBtn);

    expect(searchInput).toHaveValue("");
    expect(mockToast.ok).toHaveBeenCalledWith("Categories view reset to default.");

    // Subcategories should be collapsed again
    await waitFor(() => {
      expect(screen.queryByText("Bridal Paithani")).not.toBeInTheDocument();
    });
  });

  it("shows product warning inside delete confirmation modal when deleting category with products", async () => {
    renderComponent();

    expect(await screen.findByText("Paithani Sarees")).toBeInTheDocument();

    // Click delete on Paithani (which has 13 products)
    const deleteButtons = screen.getAllByTitle("Delete Category");
    fireEvent.click(deleteButtons[0]);

    expect(await screen.findByText(/Delete Category "Paithani Sarees"/i)).toBeInTheDocument();
    expect(screen.getByText(/Active Products Warning:/i)).toBeInTheDocument();
    expect(screen.getAllByText(/13 products/i).length).toBeGreaterThanOrEqual(1);

    // Cancel modal
    fireEvent.click(screen.getByText("Cancel"));
    expect(screen.queryByText(/Delete Category "Paithani Sarees"/i)).not.toBeInTheDocument();
  });

  it("calls adminFetch to toggle active state when status toggle is clicked", async () => {
    renderComponent();

    expect(await screen.findByText("Paithani Sarees")).toBeInTheDocument();

    const toggleBtn = screen.getAllByTitle("Deactivate (Hide from Storefront)")[0];
    fireEvent.click(toggleBtn);

    await waitFor(() => {
      expect(adminApi.adminFetch).toHaveBeenCalledWith(
        "/api/admin/categories/cat-paithani-default",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ active: false }),
        })
      );
    });
  });

  it("renders Women's Tops main category and displays its subcategories with group badges when expanded", async () => {
    renderComponent();

    // Verify Women's Tops is listed among main categories
    expect(await screen.findByText("Women's Tops")).toBeInTheDocument();
    expect(screen.getByText("4 Products")).toBeInTheDocument();
    expect(screen.getByText("42 Subcategories")).toBeInTheDocument();

    // Expand Women's Tops
    const topsToggle = screen.getByLabelText("Toggle subcategories for Women's Tops");
    fireEvent.click(topsToggle);

    // Verify subcategories appear
    expect(await screen.findByText("Crop Tops")).toBeInTheDocument();
    expect(screen.getByText("Girls Casual Tops")).toBeInTheDocument();
    expect(screen.getByText("Winter Tops")).toBeInTheDocument();

    // Verify group badges appear next to subcategories
    expect(screen.getAllByText("Women's Tops").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Girls' Tops").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Seasonal Tops").length).toBeGreaterThanOrEqual(1);
  });
});
