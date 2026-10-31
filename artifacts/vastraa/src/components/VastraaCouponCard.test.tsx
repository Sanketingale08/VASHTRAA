import React from "react";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  VastraaCouponCard,
  getExpiryInfo,
  getUsageInfo,
  formatCouponDisplay,
  LotusOrnament,
  VastraaCoupon,
} from "./VastraaCouponCard";

describe("VastraaCouponCard Component", () => {
  const sampleCoupon: VastraaCoupon = {
    id: "coup-1",
    code: "FESTIVE_1792693216858",
    type: "percent",
    value: 15,
    description: "Get 15% OFF on Your First Purchase\nUse this exclusive coupon and enjoy 15% discount on all sarees.",
    expiresAt: new Date(Date.now() + 3 * 86400000).toISOString(), // 3 days from now
    maxUses: 150,
    usedCount: 50,
    active: true,
    offerType: "FESTIVE OFFER",
    tagline: "SAVE MORE, WEAR MORE",
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders the reference coupon card with exact layout elements", () => {
    render(<VastraaCouponCard coupon={sampleCoupon} />);

    // Navy stub elements
    expect(screen.getByText("FESTIVE OFFER")).toBeInTheDocument();
    expect(screen.getByText("FESTIVE_1792693216858")).toBeInTheDocument();
    expect(screen.getByText("SAVE MORE, WEAR MORE")).toBeInTheDocument();

    // Right section main details
    expect(screen.getByText("Get 15% OFF on Your First Purchase")).toBeInTheDocument();
    expect(
      screen.getByText("Use this exclusive coupon and enjoy 15% discount on all sarees.")
    ).toBeInTheDocument();

    // Copy button
    expect(screen.getByRole("button", { name: /copy coupon code/i })).toBeInTheDocument();
    expect(screen.getByText("Copy")).toBeInTheDocument();

    // Footer
    expect(screen.getByText(/expires in 3 days/i)).toBeInTheDocument();
    expect(screen.getByText("100 uses remaining")).toBeInTheDocument();
  });

  it("handles clipboard copying with temporary 'Copied!' state", async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: {
        writeText: writeTextMock,
      },
    });

    render(<VastraaCouponCard coupon={sampleCoupon} />);
    const copyButton = screen.getByRole("button", { name: /copy coupon code/i });

    await act(async () => {
      fireEvent.click(copyButton);
    });

    expect(writeTextMock).toHaveBeenCalledWith("FESTIVE_1792693216858");
    expect(screen.getByText("Copied!")).toBeInTheDocument();

    // Fast forward 2 seconds
    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(screen.getByText("Copy")).toBeInTheDocument();
    expect(screen.queryByText("Copied!")).not.toBeInTheDocument();
  });

  it("renders Apply button when onApply is passed and triggers callback", () => {
    const handleApply = vi.fn();
    render(<VastraaCouponCard coupon={sampleCoupon} onApply={handleApply} />);

    const applyButton = screen.getByRole("button", { name: /^apply$/i });
    expect(applyButton).toBeInTheDocument();

    fireEvent.click(applyButton);
    expect(handleApply).toHaveBeenCalledWith("FESTIVE_1792693216858");
  });

  it("displays 'Applied' indicator when isApplied is true", () => {
    render(<VastraaCouponCard coupon={sampleCoupon} onApply={vi.fn()} isApplied={true} />);

    expect(screen.getByText("Applied")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^apply$/i })).not.toBeInTheDocument();
  });

  it("marks card as expired when isExpired is true or expiry date is past", () => {
    const expiredCoupon: VastraaCoupon = {
      ...sampleCoupon,
      expiresAt: new Date(Date.now() - 10000).toISOString(),
    };

    const { container } = render(<VastraaCouponCard coupon={expiredCoupon} />);
    expect(screen.getByText("Expired")).toBeInTheDocument();
    expect(container.firstChild).toHaveClass("opacity-70");
  });

  describe("Helper Functions", () => {
    it("getExpiryInfo correctly formats various durations", () => {
      expect(getExpiryInfo(null).text).toBe("No expiry");
      expect(getExpiryInfo("invalid-date").text).toBe("No expiry");

      // Expired
      const past = new Date(Date.now() - 5000);
      expect(getExpiryInfo(past)).toEqual({
        text: "Expired",
        isUrgent: true,
        isExpired: true,
      });

      // Today (< 24h)
      const in12h = new Date(Date.now() + 12 * 3600000);
      expect(getExpiryInfo(in12h)).toEqual({
        text: "Expires today",
        isUrgent: true,
        isExpired: false,
      });

      // 3 days
      const in3Days = new Date(Date.now() + 3 * 86400000);
      expect(getExpiryInfo(in3Days).text).toBe("Expires in 3 days");
      expect(getExpiryInfo(in3Days).isUrgent).toBe(true);

      // 10 days
      const in10Days = new Date(Date.now() + 10 * 86400000);
      expect(getExpiryInfo(in10Days).isUrgent).toBe(false);
      expect(getExpiryInfo(in10Days).text).toMatch(/^Expires on /);
    });

    it("getUsageInfo correctly computes remaining counts", () => {
      // Unlimited
      expect(getUsageInfo(null)).toEqual({
        text: "Unlimited uses",
        isExhausted: false,
        remaining: null,
      });

      // 100 remaining
      expect(getUsageInfo(150, 50)).toEqual({
        text: "100 uses remaining",
        isExhausted: false,
        remaining: 100,
      });

      // 1 remaining (singular)
      expect(getUsageInfo(10, 9)).toEqual({
        text: "1 use remaining",
        isExhausted: false,
        remaining: 1,
      });

      // Exhausted
      expect(getUsageInfo(100, 100)).toEqual({
        text: "0 uses remaining",
        isExhausted: true,
        remaining: 0,
      });
    });

    it("formatCouponDisplay formats titles, subtitles, and badges appropriately", () => {
      const display = formatCouponDisplay({
        code: "FESTIVE_1792693216858",
        type: "percent",
        value: 15,
        description: "Festive discount",
      });

      expect(display.discountLabel).toBe("15% OFF");
      expect(display.offerBadge).toBe("FESTIVE OFFER");
      expect(display.tagline).toBe("SAVE MORE, WEAR MORE");
    });

    it("formatCouponDisplay prioritizes custom offerDisplayText over description", () => {
      const display = formatCouponDisplay({
        code: "VASTRAA200",
        type: "flat",
        value: 200,
        description: "Standard ₹200 off coupon",
        offerDisplayText: "Flat ₹200 off on ₹4,000+ shopping",
      });

      expect(display.title).toBe("Flat ₹200 off on ₹4,000+ shopping");
      expect(display.subtitle).toBe("Standard ₹200 off coupon");
      expect(display.offerDisplayText).toBe("Flat ₹200 off on ₹4,000+ shopping");
    });

    it("formatCouponDisplay supports percentages, Unicode and ₹ symbols in offerDisplayText", () => {
      const display = formatCouponDisplay({
        code: "SAVE500",
        type: "flat",
        value: 500,
        offerDisplayText: "Save ₹500 on purchases above ₹5,000 ✨",
      });

      expect(display.title).toBe("Save ₹500 on purchases above ₹5,000 ✨");
      expect(display.subtitle).toMatch(/discount on all sarees/i);
    });
  });

  it("renders custom offerDisplayText prominently on the coupon card", () => {
    const couponWithOfferText: VastraaCoupon = {
      ...sampleCoupon,
      offerDisplayText: "Flat ₹200 off on ₹4,000+ shopping",
    };

    render(<VastraaCouponCard coupon={couponWithOfferText} />);
    expect(screen.getByText("Flat ₹200 off on ₹4,000+ shopping")).toBeInTheDocument();
  });

  describe("LotusOrnament Component", () => {
    it("renders lotus SVG and ornamental flanking lines", () => {
      const { container } = render(<LotusOrnament color="#D4AF5A" size={24} />);
      const svg = container.querySelector("svg");
      expect(svg).toBeInTheDocument();
      expect(svg).toHaveAttribute("width", "24");
    });
  });
});
