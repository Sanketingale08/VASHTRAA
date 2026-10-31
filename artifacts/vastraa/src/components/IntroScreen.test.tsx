import React from "react";
import { render, screen, act, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from "vitest";
import { IntroScreen } from "./IntroScreen";

beforeAll(() => {
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

describe("IntroScreen Component", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Clean any leftover elements
    document.body.innerHTML = '<div id="root"></div>';
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it("renders the animated intro screen every time on browser load/refresh", () => {
    render(<IntroScreen />);

    // Screen should appear every time on refresh
    const introScreen = screen.getByTestId("vastraa-intro-screen");
    expect(introScreen).toBeInTheDocument();

    // VASTRAA logo must be present as the primary visual highlight
    const logoImg = screen.getByTestId("vastraa-intro-logo");
    expect(logoImg).toBeInTheDocument();
    expect(logoImg).toHaveAttribute("alt", "VASTRAA");

    // Must have a white background container behind the VASTRAA logo
    const logoWrapper = logoImg.closest("div");
    expect(logoWrapper).toHaveClass("bg-white");

    // Title and Paithani branding should be visible
    expect(screen.getByRole("heading", { name: /vastraa/i })).toBeInTheDocument();
    expect(screen.getByText(/royal paithani & designer sarees/i)).toBeInTheDocument();
    expect(screen.getByText(/master weavers of india/i)).toBeInTheDocument();

    // Progress bar should be present
    expect(screen.getByTestId("vastraa-intro-progress")).toBeInTheDocument();
  });

  it("does not render any skip button on the intro screen", () => {
    render(<IntroScreen durationMs={3000} />);

    // Fast forward time and ensure no skip button ever appears
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(screen.queryByTestId("vastraa-intro-skip")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /skip/i })).not.toBeInTheDocument();
  });

  it("automatically dissolves and calls onFinish after the duration expires", () => {
    const onFinishMock = vi.fn();
    render(<IntroScreen durationMs={2000} onFinish={onFinishMock} />);

    expect(screen.getByTestId("vastraa-intro-screen")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(2100);
    });

    expect(onFinishMock).toHaveBeenCalledTimes(1);
    expect(window.sessionStorage.getItem("vastraa_intro_seen")).toBe("true");
  });

  it("handles image fallback smoothly if primary logo source errors", () => {
    render(<IntroScreen />);
    const logoImg = screen.getByTestId("vastraa-intro-logo") as HTMLImageElement;

    // Simulate image error event
    fireEvent.error(logoImg);

    expect(logoImg.src).toContain("/images/logo.svg");
  });
});
