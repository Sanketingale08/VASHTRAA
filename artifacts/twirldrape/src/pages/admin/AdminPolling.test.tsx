import React, { act } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./AdminLayout", () => ({
  AdminGuard: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import AdminOrders from "./AdminOrders";
import AdminCoupons from "./AdminCoupons";

function jsonResponse(body: unknown) {
  return Promise.resolve({
    ok: true,
    json: async () => body,
  });
}

function settleFetchAndReactUpdates() {
  return act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("admin page background polling", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    sessionStorage.setItem("td_admin_key", "test-admin-key");
  });

  afterEach(() => {
    cleanup();
    sessionStorage.clear();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("refreshes orders after the 30-second polling interval", async () => {
    const fetchMock = vi.fn();
    let fetchCount = 0;
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      expect(String(input)).toBe("/api/admin/orders");
      fetchCount += 1;
      return jsonResponse({
        orders: [
          {
            id: `order-${fetchCount}`,
            displayId: `TD-${fetchCount}`,
            userId: "user-1",
            items: [{ productId: "product-1", name: `Saree ${fetchCount}`, price: 10000, quantity: 1 }],
            address: { name: "Priya Sharma" },
            total: 10000,
            status: "pending",
            paymentMethod: "cod",
            createdAt: "2026-08-19T00:00:00.000Z",
            updatedAt: "2026-08-19T00:00:00.000Z",
          },
        ],
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<AdminOrders />);
    await settleFetchAndReactUpdates();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Saree 1")).toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(30_000);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(screen.getByText("Saree 2")).toBeInTheDocument();
  });

  it("refreshes coupons after the 60-second polling interval", async () => {
    const fetchMock = vi.fn();
    let fetchCount = 0;
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      expect(String(input)).toBe("/api/admin/coupons");
      fetchCount += 1;
      return jsonResponse({
        coupons: [
          {
            id: `coupon-${fetchCount}`,
            code: `FESTIVE${fetchCount}`,
            type: "percent",
            value: 20,
            description: `Offer ${fetchCount}`,
            active: true,
            expiresAt: null,
            maxUses: null,
            usedCount: fetchCount,
            createdAt: "2026-08-19T00:00:00.000Z",
          },
        ],
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<AdminCoupons />);
    await settleFetchAndReactUpdates();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.getByText("FESTIVE1")).toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(60_000);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(screen.getByText("FESTIVE2")).toBeInTheDocument();
  });
});