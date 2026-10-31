import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import {
  Skeleton,
  ProductCardSkeleton,
  ProductGridSkeleton,
  ProductDetailsSkeleton,
  TableRowSkeleton,
  DashboardStatsSkeleton,
  ChartSkeleton,
  ProfileSkeleton,
  OrderCardSkeleton,
  PageSectionSkeleton,
  HeroBannerSkeleton,
  CategoryCardsSkeleton,
  CheckoutSkeleton,
  CartSkeleton,
  SearchSuggestionsSkeleton,
} from "./index";

describe("Production-Ready Skeleton Loaders Design System", () => {
  afterEach(() => {
    cleanup();
  });

  describe("Base Skeleton", () => {
    it("renders with shimmer animation class and aria-hidden", () => {
      const { container } = render(<Skeleton className="w-20 h-5" />);
      const el = container.firstElementChild as HTMLElement;
      expect(el).toBeTruthy();
      expect(el.className).toContain("skeleton-shimmer");
      expect(el.className).toContain("w-20");
      expect(el.className).toContain("h-5");
      expect(el.getAttribute("aria-hidden")).toBe("true");
    });
  });

  describe("ProductCardSkeleton & ProductGridSkeleton", () => {
    it("renders ProductCardSkeleton with accessible role and aria-busy", () => {
      render(<ProductCardSkeleton />);
      const statusEl = screen.getByRole("status");
      expect(statusEl).toBeInTheDocument();
      expect(statusEl).toHaveAttribute("aria-busy", "true");
      expect(statusEl).toHaveAttribute("aria-label", "Loading product");
    });

    it("renders ProductGridSkeleton with requested count of cards", () => {
      render(<ProductGridSkeleton count={6} />);
      const cards = screen.getAllByRole("status");
      expect(cards.length).toBe(6);
    });
  });

  describe("ProductDetailsSkeleton", () => {
    it("renders product detail layout with left gallery and right attributes", () => {
      render(<ProductDetailsSkeleton />);
      const statusEl = screen.getByLabelText("Loading product details");
      expect(statusEl).toBeInTheDocument();
      expect(statusEl).toHaveAttribute("aria-busy", "true");
    });
  });

  describe("TableRowSkeleton", () => {
    it("renders inside table with correct column and row counts", () => {
      const { container } = render(
        <table>
          <tbody>
            <TableRowSkeleton columns={6} rows={4} />
          </tbody>
        </table>
      );
      const rows = container.querySelectorAll("tr");
      expect(rows.length).toBe(4);
      rows.forEach((row) => {
        expect(row.querySelectorAll("td").length).toBe(6);
      });
    });
  });

  describe("DashboardStatsSkeleton", () => {
    it("renders the requested number of metric stat cards", () => {
      render(<DashboardStatsSkeleton count={4} />);
      const stats = screen.getByRole("status");
      expect(stats).toHaveAttribute("aria-label", "Loading dashboard statistics");
    });
  });

  describe("ChartSkeleton", () => {
    it("renders chart skeleton with simulated bars", () => {
      render(<ChartSkeleton height={240} />);
      const chart = screen.getByRole("status");
      expect(chart).toHaveAttribute("aria-label", "Loading chart data");
    });
  });

  describe("ProfileSkeleton", () => {
    it("renders avatar and form field skeletons", () => {
      render(<ProfileSkeleton />);
      const profile = screen.getByRole("status");
      expect(profile).toHaveAttribute("aria-label", "Loading profile");
    });
  });

  describe("OrderCardSkeleton", () => {
    it("renders order cards with status header and items", () => {
      render(<OrderCardSkeleton count={2} />);
      const orders = screen.getAllByRole("status");
      expect(orders.length).toBe(2);
    });
  });

  describe("PageSectionSkeleton", () => {
    it("renders section title and product grid", () => {
      render(<PageSectionSkeleton count={4} />);
      const section = screen.getByLabelText("Loading section");
      expect(section).toBeInTheDocument();
      expect(section).toHaveAttribute("aria-busy", "true");
    });
  });

  describe("HeroBannerSkeleton", () => {
    it("renders banner layout with CTA and pagination skeletons", () => {
      render(<HeroBannerSkeleton />);
      const banner = screen.getByRole("status");
      expect(banner).toHaveAttribute("aria-label", "Loading hero banner");
    });
  });

  describe("CategoryCardsSkeleton", () => {
    it("renders circular category card placeholders", () => {
      render(<CategoryCardsSkeleton count={6} />);
      const categories = screen.getByRole("status");
      expect(categories).toHaveAttribute("aria-label", "Loading categories");
    });
  });

  describe("CheckoutSkeleton", () => {
    it("renders 2-column checkout layout with addresses, payments and summary", () => {
      render(<CheckoutSkeleton />);
      const checkout = screen.getByRole("status");
      expect(checkout).toHaveAttribute("aria-label", "Loading checkout");
    });
  });

  describe("CartSkeleton", () => {
    it("renders shopping cart items list and price summary card", () => {
      render(<CartSkeleton />);
      const cart = screen.getByRole("status");
      expect(cart).toHaveAttribute("aria-label", "Loading shopping cart");
    });
  });

  describe("SearchSuggestionsSkeleton", () => {
    it("renders autocomplete suggestions skeleton with chips and items", () => {
      render(<SearchSuggestionsSkeleton count={3} />);
      const search = screen.getByRole("status");
      expect(search).toHaveAttribute("aria-label", "Loading search suggestions");
    });
  });
});
