import { describe, it, expect } from "vitest";
import { isDemoOrder, isRealtimeOrder, filterRealtimeOrders, buildRealtimeOrderMongoFilter } from "../lib/orderFilter";

describe("Order Realtime vs Demo Filtering", () => {
  it("identifies explicit demo flags as demo orders", () => {
    expect(isDemoOrder({ id: "V201", isDemo: true })).toBe(true);
    expect(isDemoOrder({ id: "V202", isTest: true })).toBe(true);
    expect(isDemoOrder({ id: "V203", demo: true })).toBe(true);
    expect(isDemoOrder({ id: "V204", test: true })).toBe(true);
  });

  it("identifies demo/test in order id or displayId", () => {
    expect(isDemoOrder({ id: "ORD_DEMO_001", isDemo: false })).toBe(true);
    expect(isDemoOrder({ id: "order-test-123" })).toBe(true);
    expect(isDemoOrder({ id: "V99", displayId: "DEMO-ORD-1" })).toBe(true);
  });

  it("identifies demo test customers and test emails", () => {
    expect(isDemoOrder({ id: "V100", customerName: "Checkout Tester" })).toBe(true);
    expect(isDemoOrder({ id: "V101", address: { name: "Test Customer" } })).toBe(true);
    expect(isDemoOrder({ id: "V102", address: { email: "customer.p4@example.com" } })).toBe(true);
    expect(isDemoOrder({ id: "V103", userId: "test-customer-phase4" })).toBe(true);
    expect(isDemoOrder({ id: "V104", userId: "USR_DEMO_SELLER" })).toBe(true);
  });

  it("identifies demo vendors and test items", () => {
    expect(isDemoOrder({
      id: "V105",
      items: [{ name: "Paithani Saree", vendorId: "vendor-seller-p4" }]
    })).toBe(true);

    expect(isDemoOrder({
      id: "V106",
      items: [{ name: "Demo Paithani Silk Saree (Test Item)", vendorId: "VEND_DEMO_001" }]
    })).toBe(true);
  });

  it("correctly identifies and preserves genuine realtime customer orders", () => {
    const realtimeOrder1 = {
      id: "V80",
      displayId: "V80",
      customerName: "Sanket Ingale",
      userId: "ingalesanket08@gmail.com",
      address: { name: "Sanket Ingale", email: "ingalesanket08@gmail.com" },
      items: [{ name: "Dress", price: 1155, vendorId: "seller_sanket_ingale_001" }],
      total: 1185,
      status: "dispatched",
      isDemo: false,
    };

    const realtimeOrder2 = {
      id: "V133",
      displayId: "V133",
      customerName: "Kishor Sudhakar Ingale",
      userId: "seller_sanket_ingale_001",
      address: { name: "Kishor Sudhakar Ingale", line1: "Yeola Station Road" },
      items: [{ name: "Divya Designer", price: 1155, vendorId: "seller_sanket_ingale_001" }],
      total: 1185,
      status: "dispatched",
      isDemo: false,
    };

    expect(isDemoOrder(realtimeOrder1)).toBe(false);
    expect(isRealtimeOrder(realtimeOrder1)).toBe(true);
    expect(isDemoOrder(realtimeOrder2)).toBe(false);
    expect(isRealtimeOrder(realtimeOrder2)).toBe(true);
  });

  it("filters a mixed array of orders so only realtime orders remain", () => {
    const mixed = [
      { id: "V78", customerName: "Checkout Tester" },
      { id: "V80", customerName: "Sanket Ingale", items: [{ name: "Dress", vendorId: "seller_sanket_ingale_001" }] },
      { id: "V82", customerName: "Anita Deshmukh", items: [{ name: "Paithani Silk Saree", vendorId: "vendor-seller-p4" }] },
      { id: "V133", customerName: "Kishor Sudhakar Ingale", items: [{ name: "Divya Designer", vendorId: "seller_sanket_ingale_001" }] },
    ];

    const realtimeOnly = filterRealtimeOrders(mixed);
    expect(realtimeOnly).toHaveLength(2);
    expect(realtimeOnly.map(o => o.id)).toEqual(["V80", "V133"]);
  });

  it("builds MongoDB query filter excluding demo and test flags", () => {
    const mongoFilter = buildRealtimeOrderMongoFilter({ status: "confirmed" });
    expect(mongoFilter).toEqual({
      status: "confirmed",
      isDemo: { $ne: true },
      isTest: { $ne: true },
      demo: { $ne: true },
      test: { $ne: true },
    });
  });

  it("ensures filterRealtimeOrders handles empty, null, or undefined gracefully", () => {
    expect(filterRealtimeOrders(null as any)).toEqual([]);
    expect(filterRealtimeOrders(undefined as any)).toEqual([]);
    expect(filterRealtimeOrders([])).toEqual([]);
  });
});
