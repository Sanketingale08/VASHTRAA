import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  sendTransactionalEmail,
  sendSellerNewOrderEmail,
  sendSellerOrderCancelledEmail,
  getSellerRecipientEmail,
  getRecipientEmail,
  getOrderAttachedEmail,
  buildEmailContent,
} from "../lib/transactionalEmail";
import { insertSellerNotification } from "../lib/sellerNotifications";
import { insertOrderStatusNotification } from "../lib/orderNotifications";
import {
  mongoSellers,
  mongoVendors,
  mongoUsers,
  mongoOrders,
  mongoNotificationPreferences,
  db,
  emailOutboxTable,
} from "@workspace/db";

describe("Seller & Customer Order Email System", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getSellerRecipientEmail", () => {
    it("returns email directly if valid email string passed as vendorId", async () => {
      const res = await getSellerRecipientEmail("artisan@vastraa.com");
      expect(res.email).toBe("artisan@vastraa.com");
      expect(res.source).toBe("direct");
    });

    it("resolves seller email and storeName from mongoSellers by ID", async () => {
      const mockFindById = vi.spyOn(mongoSellers, "findById" as any).mockResolvedValueOnce({
        id: "seller_kashi_01",
        name: "Kashi Heritage Weaves",
        shopName: "Kashi Weaves",
        contactEmail: "orders@kashiweaves.in",
      });

      const res = await getSellerRecipientEmail("seller_kashi_01");
      expect(res.email).toBe("orders@kashiweaves.in");
      expect(res.storeName).toBe("Kashi Weaves");
      expect(res.source).toBe("mongo_seller");
      mockFindById.mockRestore();
    });

    it("resolves seller email via owner user account if contactEmail is absent in seller record", async () => {
      const mockFindSeller = vi.spyOn(mongoSellers, "findById" as any).mockResolvedValueOnce({
        id: "seller_kanchi_02",
        shopName: "Kanchipuram Silks",
        ownerId: "user_owner_kanchi",
      });
      const mockFindUser = vi.spyOn(mongoUsers, "findById" as any).mockResolvedValueOnce({
        id: "user_owner_kanchi",
        email: "kanchipuram.silks@gmail.com",
        name: "Ramanathan Chettiar",
      });

      const res = await getSellerRecipientEmail("seller_kanchi_02");
      expect(res.email).toBe("kanchipuram.silks@gmail.com");
      expect(res.storeName).toBe("Kanchipuram Silks");
      expect(res.source).toBe("mongo_seller_owner");

      mockFindSeller.mockRestore();
      mockFindUser.mockRestore();
    });
  });

  describe("buildEmailContent for seller_new_order and seller_order_cancelled", () => {
    it("generates correct subject and HTML for seller_new_order with item table, payout, and delivery region", () => {
      const content = buildEmailContent(
        "seller_new_order",
        "Banarasi Katan Silk Saree",
        "",
        undefined,
        "ORD-2026-9901",
        {
          orderId: "ORD-2026-9901",
          sellerStoreName: "Varanasi Silk Emporium",
          sellerItems: [
            { name: "Pure Banarasi Katan Silk", quantity: 1, price: 18500, subtotal: 18500, sku: "KATAN-001" },
            { name: "Silk Blouse Piece", quantity: 1, price: 1500, subtotal: 1500 },
          ],
          settlementAmount: 17600,
          customerDeliveryRegion: "Indiranagar, Bengaluru, 560038",
        }
      );

      expect(content.subject).toContain("New Order Received:");
      expect(content.subject).toContain("#ORD-2026-9901");
      expect(content.subject).toContain("Action Required");
      expect(content.html).toContain("New Order");
      expect(content.html).toContain("received a new order");
      expect(content.html).toContain("Pure Banarasi Katan Silk");
      expect(content.html).toContain("Silk Blouse Piece");
      expect(content.html).toContain("Indiranagar, Bengaluru, 560038");
      expect(content.html).toContain("₹17,600");
      expect(content.html).toContain("Estimated Net Settlement");
      expect(content.html).toContain("48 hours");
    });

    it("generates correct subject and HTML for seller_order_cancelled", () => {
      const content = buildEmailContent(
        "seller_order_cancelled",
        "Handloom Tussar Saree",
        "",
        "Customer requested cancellation due to incorrect size selection.",
        "ORD-2026-7788",
        {
          orderId: "ORD-2026-7788",
        }
      );

      expect(content.subject).toContain("Order #ORD-2026-7788 Cancelled");
      expect(content.html).toContain("Order Cancelled");
      expect(content.html).toContain("Customer requested cancellation");
      expect(content.html).toContain("returned to your store stock");
    });
  });

  describe("sendSellerNewOrderEmail", () => {
    it("dispatches new order email to seller and bypasses customer emailOrderUpdates opt-out", async () => {
      // Mock seller recipient
      const mockFindSeller = vi.spyOn(mongoSellers, "findById" as any).mockResolvedValueOnce({
        id: "vendor_chanderi_44",
        shopName: "Chanderi Weavers Co-op",
        contactEmail: "orders@chanderiweaves.org",
      });

      // Even if user preferences has emailOrderUpdates = false, seller operational email MUST NOT be skipped
      const mockPrefs = vi.spyOn(mongoNotificationPreferences, "findByUserId").mockResolvedValueOnce({
        userId: "vendor_chanderi_44",
        emailOrderUpdates: false,
        emailMarketingUpdates: false,
        emailOfferUpdates: false,
        pushOrderUpdates: false,
        smsOrderUpdates: false,
      } as any);

      const result = await sendSellerNewOrderEmail({
        vendorId: "vendor_chanderi_44",
        orderId: "ORD-2026-8812",
        sellerStoreName: "Chanderi Weavers Co-op",
        items: [
          { name: "Chanderi Tissue Zari Saree", quantity: 2, price: 9200, subtotal: 18400 },
        ],
        settlementAmount: 16192,
        deliveryCity: "Mumbai",
        deliveryState: "Maharashtra",
        deliveryPincode: "400050",
      });

      expect(result.status).not.toBe("skipped");
      expect(result.delivered).toBe(true);

      mockFindSeller.mockRestore();
      mockPrefs.mockRestore();
    });

    it("falls back to fetching order details from database when items are omitted", async () => {
      const mockFindSeller = vi.spyOn(mongoSellers, "findById" as any).mockResolvedValueOnce({
        id: "vendor_patola_55",
        shopName: "Patan Patola Heritage",
        contactEmail: "heritage@patola.in",
      });

      const mockFindOrder = vi.spyOn(mongoOrders, "findById" as any).mockResolvedValueOnce({
        id: "ORD-2026-9955",
        items: [
          {
            vendorId: "vendor_patola_55",
            title: "Double Ikat Patola Silk",
            price: 45000,
            quantity: 1,
            sku: "PATOLA-DBL-01",
          },
          {
            vendorId: "other_vendor_99",
            title: "Other Vendor Saree",
            price: 5000,
            quantity: 1,
          },
        ],
        shippingAddress: {
          city: "Ahmedabad",
          state: "Gujarat",
          pincode: "380001",
        },
      });

      const result = await sendSellerNewOrderEmail({
        vendorId: "vendor_patola_55",
        orderId: "ORD-2026-9955",
      });

      expect(result.delivered).toBe(true);
      expect(mockFindOrder).toHaveBeenCalledWith("ORD-2026-9955");

      mockFindSeller.mockRestore();
      mockFindOrder.mockRestore();
    });
  });

  describe("Multi-Vendor Order Email Isolation", () => {
    it("ensures Seller A and Seller B receive separate isolated emails for their own items and payouts only", async () => {
      const sellerASpy = vi.spyOn(mongoSellers, "findById" as any).mockImplementation(async (id: string) => {
        if (id === "vendor_A") {
          return { id: "vendor_A", shopName: "Kanchipuram Artisans", contactEmail: "sellerA@artisans.org" };
        }
        if (id === "vendor_B") {
          return { id: "vendor_B", shopName: "Banaras Weavers Guild", contactEmail: "sellerB@guild.org" };
        }
        return null;
      });

      // Call for Seller A
      const resA = await sendSellerNewOrderEmail({
        vendorId: "vendor_A",
        orderId: "ORD-MULTI-77",
        sellerStoreName: "Kanchipuram Artisans",
        items: [{ name: "Kanchipuram Temple Border", quantity: 1, price: 22000, subtotal: 22000 }],
        settlementAmount: 19360,
        deliveryCity: "Chennai",
        deliveryState: "Tamil Nadu",
        deliveryPincode: "600001",
      });

      // Call for Seller B
      const resB = await sendSellerNewOrderEmail({
        vendorId: "vendor_B",
        orderId: "ORD-MULTI-77",
        sellerStoreName: "Banaras Weavers Guild",
        items: [{ name: "Banarasi Tanchoi Brocade", quantity: 1, price: 14000, subtotal: 14000 }],
        settlementAmount: 12320,
        deliveryCity: "Chennai",
        deliveryState: "Tamil Nadu",
        deliveryPincode: "600001",
      });

      expect(resA.delivered).toBe(true);
      expect(resB.delivered).toBe(true);
      // Both should succeed and not suppress each other despite having the same orderId
      expect(resA.duplicate).toBeFalsy();
      expect(resB.duplicate).toBeFalsy();

      sellerASpy.mockRestore();
    });
  });

  describe("insertSellerNotification Integration", () => {
    it("triggers sendSellerNewOrderEmail asynchronously when type is new_order with orderId", async () => {
      const mockVendor = vi.spyOn(mongoVendors, "findById").mockResolvedValueOnce({
        id: "vendor_chanderi_99",
        ownerId: "user_owner_99",
      } as any);

      const mockSellerEmail = vi.spyOn(mongoSellers, "findById" as any).mockResolvedValueOnce({
        id: "vendor_chanderi_99",
        shopName: "Chanderi Heritage",
        contactEmail: "info@chanderiheritage.com",
      });

      await insertSellerNotification({
        vendorId: "vendor_chanderi_99",
        type: "new_order",
        title: "New order received",
        body: "You have a new order ORD-TEST-100",
        metadata: {
          orderId: "ORD-TEST-100",
          amount: 15000,
          items: [{ name: "Chanderi Silk Saree", quantity: 1, price: 15000 }],
          shippingAddress: { city: "Jaipur", state: "Rajasthan", pincode: "302001" },
        },
      });

      mockVendor.mockRestore();
      mockSellerEmail.mockRestore();
    });
  });

  describe("Customer Order Lifecycle Emails", () => {
    it("sends order_placed and order_confirmed emails to customer", async () => {
      const placedRes = await sendTransactionalEmail({
        userId: "cust_test_101",
        toEmail: "customer101@example.com",
        type: "order_placed",
        orderId: "ORD-CUST-101",
        itemName: "Paithani Peacock Motif Saree",
        amount: 28500,
      });

      expect(placedRes.delivered).toBe(true);

      const confirmedRes = await sendTransactionalEmail({
        userId: "cust_test_101",
        toEmail: "customer101@example.com",
        type: "order_confirmed",
        orderId: "ORD-CUST-101",
        itemName: "Paithani Peacock Motif Saree",
        amount: 28500,
      });

      expect(confirmedRes.delivered).toBe(true);
    });

    it("sends order_shipped email with tracking number and courier carrier name", async () => {
      const res = await sendTransactionalEmail({
        userId: "cust_test_102",
        toEmail: "customer102@example.com",
        type: "order_shipped",
        orderId: "ORD-CUST-102",
        itemName: "Maheshwari Handwoven Silk",
        trackingNumber: "BLUEDART-88291039",
        courierName: "Blue Dart Express",
        trackingUrl: "https://track.bluedart.com/BLUEDART-88291039",
      });

      expect(res.delivered).toBe(true);
    });

    it("sends out_for_delivery and order_delivered emails to customer", async () => {
      const outRes = await sendTransactionalEmail({
        userId: "cust_test_103",
        toEmail: "customer103@example.com",
        type: "out_for_delivery",
        orderId: "ORD-CUST-103",
        itemName: "Kota Doria Embroidered Saree",
      });
      expect(outRes.delivered).toBe(true);

      const delRes = await sendTransactionalEmail({
        userId: "cust_test_103",
        toEmail: "customer103@example.com",
        type: "order_delivered",
        orderId: "ORD-CUST-103",
        itemName: "Kota Doria Embroidered Saree",
      });
      expect(delRes.delivered).toBe(true);
    });

    it("sends return_requested and refund_processed emails to customer", async () => {
      const retRes = await sendTransactionalEmail({
        userId: "cust_test_104",
        toEmail: "customer104@example.com",
        type: "return_requested",
        orderId: "ORD-CUST-104",
        itemName: "Mysore Silk Crepe Saree",
      });
      expect(retRes.delivered).toBe(true);

      const refRes = await sendTransactionalEmail({
        userId: "cust_test_104",
        toEmail: "customer104@example.com",
        type: "refund_processed",
        orderId: "ORD-CUST-104",
        itemName: "Mysore Silk Crepe Saree",
        amount: 14200,
      });
      expect(refRes.delivered).toBe(true);
    });
  });

  describe("Order Status Notifications on Attached Email", () => {
    it("getOrderAttachedEmail resolves the email attached to the order from address or customerEmail", async () => {
      const mockFindOrder = vi.spyOn(mongoOrders, "findById" as any).mockResolvedValueOnce({
        id: "ORD-ATTACHED-99",
        customerEmail: "attached.buyer@gmail.com",
        address: {
          name: "Ananya Rao",
          city: "Bengaluru",
          state: "Karnataka",
          pincode: "560001",
        },
      });

      const res = await getOrderAttachedEmail("ORD-ATTACHED-99");
      expect(res.email).toBe("attached.buyer@gmail.com");
      expect(res.source).toBe("order_attached");
      expect(res.name).toBe("Ananya Rao");

      mockFindOrder.mockRestore();
    });

    it("getRecipientEmail prioritizes order attached email over user account email", async () => {
      // User account has one email in mongoUsers
      const mockFindUser = vi.spyOn(mongoUsers, "findById" as any).mockResolvedValueOnce({
        id: "user_account_id_123",
        email: "account.holder@company.com",
        name: "Account Holder",
      });

      // But the order has a different attached email entered at checkout
      const mockFindOrder = vi.spyOn(mongoOrders, "findById" as any).mockResolvedValueOnce({
        id: "ORD-ATTACHED-100",
        userId: "user_account_id_123",
        address: {
          name: "Recipient Person",
          email: "attached.delivery@gmail.com",
          city: "Mumbai",
          state: "Maharashtra",
          pincode: "400001",
        },
      });

      const res = await getRecipientEmail("user_account_id_123", "ORD-ATTACHED-100");
      // MUST prioritize the attached email on the order!
      expect(res.email).toBe("attached.delivery@gmail.com");
      expect(res.source).toBe("order_attached");
      expect(res.name).toBe("Recipient Person");

      mockFindUser.mockRestore();
      mockFindOrder.mockRestore();
    });

    it("insertOrderStatusNotification delivers status email to attached email from order record", async () => {
      const mockPrefs = vi.spyOn(mongoNotificationPreferences, "findByUserId").mockResolvedValueOnce({
        userId: "user_cust_pref_test",
        orderUpdates: true,
        emailOrderUpdates: true,
      } as any);

      const mockFindOrder = vi.spyOn(mongoOrders, "findById" as any).mockResolvedValueOnce({
        id: "ORD-STATUS-TEST-1",
        userId: "user_cust_pref_test",
        address: {
          name: "Sneha Patel",
          email: "sneha.patel@attached.in",
          city: "Surat",
          state: "Gujarat",
          pincode: "395001",
        },
      });

      await insertOrderStatusNotification({
        userId: "user_cust_pref_test",
        type: "order_shipped",
        orderId: "ORD-STATUS-TEST-1",
        itemName: "Surat Zari Saree",
        extraItemCount: 0,
        trackingNumber: "DELHIVERY-123456",
        carrier: "Delhivery",
      });

      mockPrefs.mockRestore();
      mockFindOrder.mockRestore();
    });

    it("delivers order status update email with customerEmail explicitly passed", async () => {
      const res = await sendTransactionalEmail({
        userId: "cust_direct_attached",
        toEmail: "direct.attached@vastraabuyer.in",
        type: "order_delivered",
        orderId: "ORD-DIRECT-DELIV",
        itemName: "Kanchipuram Silk",
      });

      expect(res.delivered).toBe(true);
      expect(res.status).not.toBe("skipped");
    });
  });
});
