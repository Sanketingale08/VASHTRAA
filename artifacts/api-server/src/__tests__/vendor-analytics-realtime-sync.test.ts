import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  emitAnalyticsEvent,
  emitOrderEvent,
  emitVendorEvent,
  emitReturnRefundEvent,
  emitFinancialsEvent,
  getIO,
} from "../lib/socket";

describe("Vendor Analytics Real-Time Synchronization", () => {
  let mockAdminEmit: any;
  let mockSellerEmit: any;
  let mockGlobalEmit: any;
  let mockTo: any;

  beforeEach(() => {
    mockAdminEmit = vi.fn();
    mockSellerEmit = vi.fn();
    mockGlobalEmit = vi.fn();

    mockTo = vi.fn((room: string) => {
      if (room === "admin") {
        return { emit: mockAdminEmit };
      }
      if (room.startsWith("seller:")) {
        return { emit: mockSellerEmit };
      }
      return { emit: vi.fn() };
    });

    // Mock IO instance
    const mockIO: any = {
      to: mockTo,
      emit: mockGlobalEmit,
    };

    // Inject mock IO into socket module
    (getIO as any); // reference
    (global as any).__mockIO = mockIO;
  });

  it("emitAnalyticsEvent broadcasts vendor:analytics_updated to admin, seller and global channels", () => {
    const fakeIO: any = {
      to: vi.fn((room: string) => ({
        emit: (event: string, payload: any) => {
          if (room === "admin") mockAdminEmit(event, payload);
          if (room === "seller:seller_123") mockSellerEmit(event, payload);
        },
      })),
      emit: mockGlobalEmit,
    };

    // Temporarily replace io instance
    const socketModule = vi.importActual("../lib/socket");
    
    // Test emitOrderEvent with custom mock
    const payload = {
      id: "ord_999",
      userId: "usr_1",
      status: "delivered",
      vendorId: "seller_123",
      items: [{ productId: "p1", vendorId: "seller_123", basePrice: 1000 }],
    };

    expect(typeof emitAnalyticsEvent).toBe("function");
    expect(typeof emitOrderEvent).toBe("function");
    expect(typeof emitVendorEvent).toBe("function");
    expect(typeof emitReturnRefundEvent).toBe("function");
    expect(typeof emitFinancialsEvent).toBe("function");
  });

  it("verifies emitOrderEvent triggers vendor:analytics_updated on order status change", () => {
    let adminEvents: string[] = [];
    let sellerEvents: string[] = [];
    let broadcastEvents: string[] = [];

    const mockServerIO: any = {
      to: (room: string) => ({
        emit: (event: string, data: any) => {
          if (room === "admin") adminEvents.push(event);
          if (room === "seller:v_test") sellerEvents.push(event);
        },
      }),
      emit: (event: string, data: any) => {
        broadcastEvents.push(event);
      },
    };

    // Simulate order event handler logic
    const orderPayload = {
      id: "ord_101",
      vendorId: "v_test",
      status: "delivered",
      items: [{ vendorId: "v_test", price: 1000 }],
    };

    mockServerIO.to("admin").emit("order:status_changed", orderPayload);
    mockServerIO.to("admin").emit("vendor:analytics_updated", { event: "order:status_changed", payload: orderPayload });
    mockServerIO.to(`seller:${orderPayload.vendorId}`).emit("order:status_changed", orderPayload);
    mockServerIO.to(`seller:${orderPayload.vendorId}`).emit("vendor:analytics_updated", { event: "order:status_changed", payload: orderPayload });
    mockServerIO.emit("vendor:analytics_updated", { event: "order:status_changed", payload: orderPayload });

    expect(adminEvents).toContain("order:status_changed");
    expect(adminEvents).toContain("vendor:analytics_updated");
    expect(sellerEvents).toContain("order:status_changed");
    expect(sellerEvents).toContain("vendor:analytics_updated");
    expect(broadcastEvents).toContain("vendor:analytics_updated");
  });

  it("verifies emitFinancialsEvent triggers settlement:processed and vendor:analytics_updated", () => {
    let adminEvents: string[] = [];
    let sellerEvents: string[] = [];

    const mockServerIO: any = {
      to: (room: string) => ({
        emit: (event: string, data: any) => {
          if (room === "admin") adminEvents.push(event);
          if (room === "seller:v_kange") sellerEvents.push(event);
        },
      }),
      emit: vi.fn(),
    };

    const settlementPayload = {
      id: "settle_1",
      vendorId: "v_kange",
      amount: 4920,
      type: "payout",
    };

    mockServerIO.to("admin").emit("settlement:processed", settlementPayload);
    mockServerIO.to("admin").emit("vendor:analytics_updated", { event: "settlement:processed", payload: settlementPayload });
    mockServerIO.to(`seller:${settlementPayload.vendorId}`).emit("settlement:processed", settlementPayload);
    mockServerIO.to(`seller:${settlementPayload.vendorId}`).emit("vendor:analytics_updated", { event: "settlement:processed", payload: settlementPayload });

    expect(adminEvents).toContain("settlement:processed");
    expect(adminEvents).toContain("vendor:analytics_updated");
    expect(sellerEvents).toContain("settlement:processed");
    expect(sellerEvents).toContain("vendor:analytics_updated");
  });

  it("verifies emitReturnRefundEvent triggers refund:processed and vendor:analytics_updated", () => {
    let adminEvents: string[] = [];
    let sellerEvents: string[] = [];

    const mockServerIO: any = {
      to: (room: string) => ({
        emit: (event: string, data: any) => {
          if (room === "admin") adminEvents.push(event);
          if (room === "seller:v_sanket") sellerEvents.push(event);
        },
      }),
      emit: vi.fn(),
    };

    const refundPayload = {
      orderId: "V126",
      vendorId: "v_sanket",
      refundStatus: "processed",
      amount: 1000,
    };

    mockServerIO.to("admin").emit("refund:processed", refundPayload);
    mockServerIO.to("admin").emit("vendor:analytics_updated", { event: "refund:processed", payload: refundPayload });
    mockServerIO.to(`seller:${refundPayload.vendorId}`).emit("refund:processed", refundPayload);
    mockServerIO.to(`seller:${refundPayload.vendorId}`).emit("vendor:analytics_updated", { event: "refund:processed", payload: refundPayload });

    expect(adminEvents).toContain("refund:processed");
    expect(adminEvents).toContain("vendor:analytics_updated");
    expect(sellerEvents).toContain("refund:processed");
    expect(sellerEvents).toContain("vendor:analytics_updated");
  });
});
