import { describe, it, expect } from "vitest";
import {
  formatNotificationContent,
  formatNotificationTimestamp,
  isUserDashboardNotification,
  filterNotificationsByPreferences,
  deduplicateNotifications,
  type Notification,
  type NotificationPreferences,
} from "./notifications";

describe("Vastraa Notification System - Order Status Accuracy", () => {
  it("maps 'order_placed' or 'new_order_placed' to 'Your order has been placed successfully.'", () => {
    const notif: Notification = {
      id: "n-1",
      type: "order_placed",
      title: "Order placed",
      body: "Random server body",
      read: false,
      createdAt: new Date().toISOString(),
      metadata: { orderId: "ord-100" },
    };
    const content = formatNotificationContent(notif);
    expect(content.displayTitle).toBe("Order Placed");
    expect(content.statusMessage).toBe("Your order has been placed successfully.");
  });

  it("maps 'order_confirmed' to 'Your order has been confirmed.'", () => {
    const notif: Notification = {
      id: "n-2",
      type: "order_confirmed",
      title: "Order confirmed",
      body: "Random body",
      read: false,
      createdAt: new Date().toISOString(),
      metadata: { orderId: "ord-100" },
    };
    const content = formatNotificationContent(notif);
    expect(content.displayTitle).toBe("Order Confirmed");
    expect(content.statusMessage).toBe("Your order has been confirmed.");
  });

  it("maps 'order_processing' or 'processing' to 'Your order is being processed.'", () => {
    const notif: Notification = {
      id: "n-3",
      type: "order_processing",
      title: "Order processing",
      body: "Processing items",
      read: false,
      createdAt: new Date().toISOString(),
      metadata: { orderId: "ord-100" },
    };
    const content = formatNotificationContent(notif);
    expect(content.displayTitle).toBe("Processing");
    expect(content.statusMessage).toBe("Your order is being processed.");
  });

  it("maps 'order_packed' or 'packed' to 'Your order has been packed.'", () => {
    const notif: Notification = {
      id: "n-4",
      type: "order_packed",
      title: "Order packed",
      body: "Your order has been packed and will ship soon",
      read: false,
      createdAt: new Date().toISOString(),
      metadata: { orderId: "ord-100" },
    };
    const content = formatNotificationContent(notif);
    expect(content.displayTitle).toBe("Packed");
    expect(content.statusMessage).toBe("Your order has been packed.");
  });

  it("maps 'order_shipped' or 'shipped' to 'Your order has been shipped.'", () => {
    const notif: Notification = {
      id: "n-5",
      type: "order_shipped",
      title: "Order shipped",
      body: "On the way",
      read: false,
      createdAt: new Date().toISOString(),
      metadata: { orderId: "ord-100" },
    };
    const content = formatNotificationContent(notif);
    expect(content.displayTitle).toBe("Shipped");
    expect(content.statusMessage).toBe("Your order has been shipped.");
  });

  it("maps 'out_for_delivery' to 'Your order is out for delivery.'", () => {
    const notif: Notification = {
      id: "n-6",
      type: "out_for_delivery",
      title: "Out for delivery",
      body: "Arriving soon",
      read: false,
      createdAt: new Date().toISOString(),
      metadata: { orderId: "ord-100" },
    };
    const content = formatNotificationContent(notif);
    expect(content.displayTitle).toBe("Out for Delivery");
    expect(content.statusMessage).toBe("Your order is out for delivery.");
  });

  it("maps 'order_delivered' to 'Your order has been delivered.'", () => {
    const notif: Notification = {
      id: "n-7",
      type: "order_delivered",
      title: "Order delivered",
      body: "Package delivered",
      read: false,
      createdAt: new Date().toISOString(),
      metadata: { orderId: "ord-100" },
    };
    const content = formatNotificationContent(notif);
    expect(content.displayTitle).toBe("Delivered");
    expect(content.statusMessage).toBe("Your order has been delivered.");
  });

  it("maps 'order_cancelled' to 'Your order has been cancelled.'", () => {
    const notif: Notification = {
      id: "n-8",
      type: "order_cancelled",
      title: "Order cancelled",
      body: "Order was cancelled",
      read: false,
      createdAt: new Date().toISOString(),
      metadata: { orderId: "ord-100" },
    };
    const content = formatNotificationContent(notif);
    expect(content.displayTitle).toBe("Cancelled");
    expect(content.statusMessage).toBe("Your order has been cancelled.");
  });

  it("maps 'return_approved' to 'Your return request has been approved.'", () => {
    const notif: Notification = {
      id: "n-9",
      type: "return_approved",
      title: "Return approved",
      body: "Return approved",
      read: false,
      createdAt: new Date().toISOString(),
      metadata: { orderId: "ord-100" },
    };
    const content = formatNotificationContent(notif);
    expect(content.displayTitle).toBe("Returned");
    expect(content.statusMessage).toBe("Your return request has been approved.");
  });

  it("maps 'refund_initiated' to 'Your refund has been initiated.'", () => {
    const notif: Notification = {
      id: "n-10",
      type: "refund_initiated",
      title: "Refund initiated",
      body: "Refund has been initiated",
      read: false,
      createdAt: new Date().toISOString(),
      metadata: { orderId: "ord-100" },
    };
    const content = formatNotificationContent(notif);
    expect(content.displayTitle).toBe("Refund Initiated");
    expect(content.statusMessage).toBe("Your refund has been initiated.");
  });

  it("maps 'refund_completed' to 'Your refund has been completed.'", () => {
    const notif: Notification = {
      id: "n-11",
      type: "refund_completed",
      title: "Refund completed",
      body: "Refund has been credited",
      read: false,
      createdAt: new Date().toISOString(),
      metadata: { orderId: "ord-100" },
    };
    const content = formatNotificationContent(notif);
    expect(content.displayTitle).toBe("Refund Completed");
    expect(content.statusMessage).toBe("Your refund has been completed.");
  });
});

describe("Vastraa Notification System - Strict Seller Isolation", () => {
  it("rejects seller-specific notifications from appearing on the user dashboard", () => {
    const sellerNotifs: Notification[] = [
      { id: "s1", type: "low_stock", title: "Low Stock Alert", body: "Paithani Saree is low", read: false, createdAt: "" },
      { id: "s2", type: "new_order_seller", title: "New Order Alert for Sellers", body: "You have a new sale", read: false, createdAt: "" },
      { id: "s3", type: "product_pending_approval", title: "Product Approval Pending", body: "Admin review pending", read: false, createdAt: "" },
      { id: "s4", type: "inventory_update", title: "Inventory Updates", body: "Stock reduced", read: false, createdAt: "" },
      { id: "s5", type: "seller_verification", title: "Seller Verification Updates", body: "GST verified", read: false, createdAt: "" },
      { id: "s6", type: "settlement_released", title: "Payout Notifications", body: "Weekly payout", read: false, createdAt: "" },
      { id: "s7", type: "store_performance", title: "Store Performance Alerts", body: "Conversion down", read: false, createdAt: "" },
      { id: "s8", type: "product_review_moderation", title: "Product Review Moderation", body: "New review flagged", read: false, createdAt: "" },
      { id: "s9", type: "custom_type", title: "Vendor Alert", body: "Check seller panel now", read: false, createdAt: "" },
      { id: "s10", type: "order_placed", title: "Order Placed", body: "Ok", read: false, createdAt: "", vendorId: "v-123" },
    ];

    sellerNotifs.forEach((n) => {
      expect(isUserDashboardNotification(n)).toBe(false);
    });
  });

  it("allows all customer-specific notifications on user dashboard", () => {
    const userNotifs: Notification[] = [
      { id: "u1", type: "order_confirmed", title: "Order Confirmed", body: "Your order has been confirmed.", read: false, createdAt: "" },
      { id: "u2", type: "order_shipped", title: "Order Shipped", body: "Your order has been shipped.", read: false, createdAt: "" },
      { id: "u3", type: "payment_successful", title: "Payment Successful", body: "Payment done", read: false, createdAt: "" },
      { id: "u4", type: "coupon_expiry", title: "Coupon Expiring Soon", body: "Save 20%", read: false, createdAt: "" },
      { id: "u5", type: "wishlist_restock", title: "Back In Stock", body: "Paithani saree restocked", read: false, createdAt: "" },
      { id: "u6", type: "return_approved", title: "Returned", body: "Your return request has been approved.", read: false, createdAt: "" },
      { id: "u7", type: "refund_completed", title: "Refund Completed", body: "Your refund has been completed.", read: false, createdAt: "" },
    ];

    userNotifs.forEach((n) => {
      expect(isUserDashboardNotification(n)).toBe(true);
    });
  });
});

describe("Vastraa Notification System - Preference Filtering", () => {
  const sampleNotifs: Notification[] = [
    { id: "1", type: "order_confirmed", title: "Order Confirmed", body: "...", read: false, createdAt: "" },
    { id: "2", type: "coupon_expiry", title: "Coupon Expiring", body: "...", read: false, createdAt: "" },
    { id: "3", type: "price_drop", title: "Price Drop", body: "...", read: false, createdAt: "" },
  ];

  it("filters out order notifications when orderUpdates is OFF", () => {
    const prefs: NotificationPreferences = {
      orderUpdates: false,
      offerAlerts: true,
      emailOrderUpdates: true,
      emailMarketingUpdates: true,
      emailOfferUpdates: true,
    };
    const result = filterNotificationsByPreferences(sampleNotifs, prefs);
    expect(result.some((n) => n.id === "1")).toBe(false);
    expect(result.some((n) => n.id === "2")).toBe(true);
    expect(result.some((n) => n.id === "3")).toBe(true);
  });

  it("filters out offer notifications when offerAlerts is OFF", () => {
    const prefs: NotificationPreferences = {
      orderUpdates: true,
      offerAlerts: false,
      emailOrderUpdates: true,
      emailMarketingUpdates: true,
      emailOfferUpdates: true,
    };
    const result = filterNotificationsByPreferences(sampleNotifs, prefs);
    expect(result.some((n) => n.id === "1")).toBe(true);
    expect(result.some((n) => n.id === "2")).toBe(false);
    expect(result.some((n) => n.id === "3")).toBe(false);
  });

  it("keeps all notifications when both categories are ON", () => {
    const prefs: NotificationPreferences = {
      orderUpdates: true,
      offerAlerts: true,
      emailOrderUpdates: true,
      emailMarketingUpdates: true,
      emailOfferUpdates: true,
    };
    const result = filterNotificationsByPreferences(sampleNotifs, prefs);
    expect(result.length).toBe(3);
  });
});

describe("Vastraa Notification System - Deduplication", () => {
  it("never displays duplicate status messages for the same order", () => {
    const duplicated: Notification[] = [
      {
        id: "d1",
        type: "order_confirmed",
        title: "Order Confirmed",
        body: "Confirmed",
        read: false,
        createdAt: "2026-10-13T10:00:00Z",
        metadata: { orderId: "ord-99" },
      },
      {
        id: "d2",
        type: "order_confirmed",
        title: "Order Confirmed",
        body: "Confirmed again",
        read: false,
        createdAt: "2026-10-13T10:00:05Z",
        metadata: { orderId: "ord-99" },
      },
      {
        id: "d3",
        type: "order_shipped",
        title: "Order Shipped",
        body: "Shipped",
        read: false,
        createdAt: "2026-10-13T12:00:00Z",
        metadata: { orderId: "ord-99" },
      },
    ];

    const deduped = deduplicateNotifications(duplicated);
    expect(deduped.length).toBe(2);
    expect(deduped.map((n) => n.type)).toEqual(["order_confirmed", "order_shipped"]);
  });
});

describe("Vastraa Notification System - Timestamp Formatting", () => {
  it("returns 'Just now' for timestamps within 60 seconds", () => {
    const recent = new Date().toISOString();
    expect(formatNotificationTimestamp(recent)).toBe("Just now");
  });

  it("returns '5 minutes ago' for a timestamp 5 minutes prior", () => {
    const fiveMinsAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    expect(formatNotificationTimestamp(fiveMinsAgo)).toBe("5 minutes ago");
  });

  it("returns '1 hour ago' for a timestamp 1 hour prior", () => {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    expect(formatNotificationTimestamp(oneHourAgo)).toBe("1 hour ago");
  });

  it("formats earlier dates with day, month, year, time (e.g. 28 Jul 2026, 3:15 PM)", () => {
    const pastDate = new Date(2026, 6, 28, 15, 15).toISOString(); // 28 Jul 2026, 15:15
    const formatted = formatNotificationTimestamp(pastDate);
    expect(formatted).toContain("28 Jul 2026");
    expect(formatted).toMatch(/3:15\s*PM/i);
  });
});
