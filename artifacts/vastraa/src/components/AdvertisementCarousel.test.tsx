import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeAll } from "vitest";
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

  class MockResizeObserver {
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();
  }
  Object.defineProperty(window, "ResizeObserver", {
    writable: true,
    configurable: true,
    value: MockResizeObserver,
  });

  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation((query) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
});

vi.mock("wouter", () => ({
  Link: ({ href, children, className, ...props }: any) => (
    <a href={href} className={className} {...props}>
      {children}
    </a>
  ),
  useLocation: () => ["/", vi.fn()],
}));

import { AdvertisementCarousel } from "./AdvertisementCarousel";

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe("AdvertisementCarousel - Storefront Scrolling Window", () => {
  it("hides completely (returns null) when no advertisements are provided", () => {
    const { container } = renderWithClient(<AdvertisementCarousel advertisements={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders the advertisement carousel when advertisements are provided", () => {
    const mockAds = [
      {
        id: "ad-1",
        title: "Exclusive Paithani Collection",
        description: "Handcrafted pure silk sarees with intricate zari work",
        imageUrl: "/images/paithani-banner.jpg",
        linkUrl: "/category/paithani",
      },
      {
        id: "ad-2",
        title: "Festive Designer Sarees",
        description: "Modern elegance for festive celebrations",
        imageUrl: "/images/designer-banner.jpg",
        linkUrl: "/category/designer",
      },
    ];

    renderWithClient(<AdvertisementCarousel advertisements={mockAds} />);

    // Section exists
    const section = screen.getByRole("region", { name: /Promotional Showcase/i });
    expect(section).toBeInTheDocument();

    // Check images and titles
    expect(screen.getAllByText("Exclusive Paithani Collection")[0]).toBeInTheDocument();
    expect(screen.getAllByText("Festive Designer Sarees")[0]).toBeInTheDocument();
    expect(screen.getAllByAltText("Exclusive Paithani Collection")[0]).toHaveAttribute("src", "/images/paithani-banner.jpg");

    // Navigation buttons are present for multiple slides
    expect(screen.getByRole("button", { name: /Previous advertisement/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Next advertisement/i })).toBeInTheDocument();

    // Pagination pills are present
    expect(screen.getByRole("button", { name: /Go to advertisement slide 1/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Go to advertisement slide 2/i })).toBeInTheDocument();
  });

  it("applies curved corners and prominent outline matching the reference design", () => {
    const mockAds = [
      {
        id: "ad-1",
        title: "Royal Silk Saree",
        imageUrl: "/images/royal.jpg",
      },
    ];

    const { container } = renderWithClient(<AdvertisementCarousel advertisements={mockAds} />);

    // Find card container with rounded and border classes matching reference design
    const card = container.querySelector(".rounded-\\[20px\\], .rounded-\\[28px\\], .rounded-\\[36px\\]");
    expect(card).toBeInTheDocument();
    expect(card?.className).toContain("border-2");
    expect(card?.className).toContain("border-[#0A1F44]");
  });

  it("renders untitled advertisements without blank headings or undefined text", () => {
    const mockAds = [
      {
        id: "ad-untitled",
        title: "",
        description: null,
        imageUrl: "https://images.unsplash.com/photo-1610030469983-98e550d6193c",
        linkUrl: "/category/paithani",
      },
    ];

    const { container } = renderWithClient(<AdvertisementCarousel advertisements={mockAds} />);

    // Image rendered with fallback alt
    const img = screen.getByAltText("Advertisement");
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute("src", "https://images.unsplash.com/photo-1610030469983-98e550d6193c");

    // No h3 or undefined
    expect(container.querySelector("h3")).toBeNull();
    expect(container.textContent).not.toContain("undefined");
  });

  it("configures auto-scrolling with 6-second interval", () => {
    vi.useFakeTimers();
    const setIntervalSpy = vi.spyOn(global, "setInterval");

    const mockAds = [
      { id: "ad-1", title: "Ad 1", imageUrl: "/ad1.jpg" },
      { id: "ad-2", title: "Ad 2", imageUrl: "/ad2.jpg" },
    ];

    renderWithClient(<AdvertisementCarousel advertisements={mockAds} />);

    // Should call setInterval with 6000ms
    expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), 6000);

    vi.useRealTimers();
    setIntervalSpy.mockRestore();
  });

  it("displays single advertisement without navigation controls or auto-scroll timers", () => {
    vi.useFakeTimers();
    const setIntervalSpy = vi.spyOn(global, "setInterval");

    const singleAd = [
      { id: "ad-single", title: "Single Artisan Banner", imageUrl: "/single.jpg" },
    ];

    renderWithClient(<AdvertisementCarousel advertisements={singleAd} />);

    // Renders single advertisement
    expect(screen.getByText("Single Artisan Banner")).toBeInTheDocument();

    // No navigation arrows
    expect(screen.queryByRole("button", { name: /Previous advertisement/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /Next advertisement/i })).toBeNull();

    // No pagination pills
    expect(screen.queryByRole("button", { name: /Go to advertisement slide/i })).toBeNull();

    // No interval timer started for single ad
    expect(setIntervalSpy).not.toHaveBeenCalled();

    vi.useRealTimers();
    setIntervalSpy.mockRestore();
  });
});
