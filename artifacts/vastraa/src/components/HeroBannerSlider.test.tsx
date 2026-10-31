import React from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { HeroBannerSlider } from "./HeroBannerSlider";

const banners = [
  { id: "banner-1", imageUrl: "/banner-1.jpg", title: "First banner" },
  { id: "banner-2", imageUrl: "/banner-2.jpg", title: "Second banner" },
];

describe("HeroBannerSlider image failures", () => {
  afterEach(() => {
    cleanup();
  });

  it("advances to the next banner when the active image fails", async () => {
    render(<HeroBannerSlider banners={banners} />);

    fireEvent.error(screen.getByRole("img"));

    await waitFor(() => {
      expect(screen.getByRole("img")).toHaveAttribute(
        "src",
        "/banner-2.jpg",
      );
    });
  });

  it("hides a failed image and stops the shimmer when it is the only banner", () => {
    const { container } = render(
      <HeroBannerSlider banners={[banners[0]]} />,
    );

    fireEvent.error(screen.getByRole("img"));

    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(container.querySelector(".absolute.inset-0")).toHaveStyle({
      animation: "none",
    });
  });
});