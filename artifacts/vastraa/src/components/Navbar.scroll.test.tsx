import React from "react";
import { render, screen, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("wouter", () => ({
  Link: ({ href, children, className, ...props }: any) => (
    <a href={href} className={className} {...props}>
      {children}
    </a>
  ),
  useLocation: () => ["/", vi.fn()],
}));

vi.mock("@clerk/react", () => ({
  useUser: () => ({ user: null, isSignedIn: false }),
  useClerk: () => ({ signOut: vi.fn() }),
}));

vi.mock("@/context/AuthContext", () => ({
  useAuth: () => ({ user: null, isSignedIn: false, signOut: vi.fn() }),
}));

vi.mock("@/context/WishlistContext", () => ({
  useWishlist: () => ({ wishlistedIds: new Set(), toggle: vi.fn() }),
}));

vi.mock("@/context/CartContext", () => ({
  useCart: () => ({ totalItems: 0, openDrawer: vi.fn() }),
}));
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Navbar } from "./Navbar";
import { Layout } from "./Layout";

const testQueryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
});

function renderWithClient(ui: React.ReactElement) {
  return render(
    <QueryClientProvider client={testQueryClient}>
      {ui}
    </QueryClientProvider>
  );
}

describe("Navbar - Scrolling and Sticky Behavior", () => {
  beforeEach(() => {
    Object.defineProperty(window, "scrollY", {
      value: 0,
      writable: true,
      configurable: true,
    });
  });

  it("renders with fixed top-0, z-50, and standard initial height at top of page", () => {
    renderWithClient(<Navbar />);

    const nav = screen.getByRole("navigation");
    expect(nav).toBeInTheDocument();
    expect(nav.className).toMatch(/fixed|sticky/);
    expect(nav.className).toContain("top-0");
    expect(nav.className).toContain("z-50");

    // Check spacer element exists to prevent page content overlap
    const spacer = screen.getByTestId("navbar-spacer");
    expect(spacer).toBeInTheDocument();
    expect(spacer.className).toContain("h-[64px]");
    expect(spacer.className).toContain("md:h-[96px]");

    // Check inner flex row has initial height classes
    const innerRow = nav.querySelector(".container > div");
    expect(innerRow?.className).toContain("h-[64px]");
    expect(innerRow?.className).toContain("md:h-[96px]");
  });

  it("dynamically adapts to compact height, shadow, and refined styling when scrolled", () => {
    renderWithClient(<Navbar />);

    const nav = screen.getByRole("navigation");
    const innerRow = nav.querySelector(".container > div");

    // Initially at top (scrollY = 0)
    expect(nav.className).not.toContain("shadow-sm sm:shadow-md");

    // Scroll down past threshold
    act(() => {
      Object.defineProperty(window, "scrollY", { value: 60, writable: true });
      window.dispatchEvent(new Event("scroll"));
    });

    // Scrolled state applied
    expect(nav.className).toContain("shadow-sm sm:shadow-md");
    expect(nav.className).toContain("border-[#C7CCD1]/40");
    expect(innerRow?.className).toContain("h-[54px]");
    expect(innerRow?.className).toContain("md:h-[72px]");

    // Scroll back to top
    act(() => {
      Object.defineProperty(window, "scrollY", { value: 0, writable: true });
      window.dispatchEvent(new Event("scroll"));
    });

    // Returns to initial spacious height
    expect(innerRow?.className).toContain("h-[64px]");
    expect(innerRow?.className).toContain("md:h-[96px]");
  });

  it("Layout uses overflow-x-clip to prevent horizontal overflow without breaking position: sticky", () => {
    const { container } = renderWithClient(
      <Layout>
        <div data-testid="page-content">Sample Page Content</div>
      </Layout>
    );

    const rootWrapper = container.firstElementChild as HTMLElement;
    expect(rootWrapper.className).toContain("overflow-x-clip");
    expect(rootWrapper.className).not.toContain("overflow-x-hidden");
  });
});
