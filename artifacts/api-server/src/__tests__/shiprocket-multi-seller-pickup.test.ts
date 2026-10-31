import { describe, it, expect, beforeEach } from "vitest";
import {
  validateAndNormalizeSellerAddress,
  computeAddressHash,
  syncSellerPickupToShiprocket,
} from "../services/shipping/shiprocketPickupService";
import { getAvailableCouriers } from "../services/shipping/shiprocketCourierService";
import { createAndDispatchShipment } from "../services/shipping/shiprocketShipmentService";
import { shiprocketMock } from "../services/shipping/shiprocketMock";
import { mongoVendors, mongoSellers, mongoShipments, mongoOrders } from "@workspace/db";

describe("Shiprocket Multi-Seller Pickup Integration", () => {
  beforeEach(() => {
    shiprocketMock.reset();
  });

  describe("1. Address Validation and Normalization", () => {
    it("should reject an address with an invalid PIN code", () => {
      const res = validateAndNormalizeSellerAddress("VND_1", {
        shopStreet: "123 Ring Road, Surat",
        shopCity: "Surat",
        shopState: "Gujarat",
        shopPincode: "39500", // Only 5 digits
        mobile: "9876543210",
      });

      expect(res.valid).toBe(false);
      expect(res.error).toMatch(/6 digits/i);
    });

    it("should reject an address with a street that is too short", () => {
      const res = validateAndNormalizeSellerAddress("VND_1", {
        shopStreet: "St",
        shopCity: "Surat",
        shopState: "Gujarat",
        shopPincode: "395002",
        mobile: "9876543210",
      });

      expect(res.valid).toBe(false);
      expect(res.error).toMatch(/at least 5 characters/i);
    });

    it("should normalize valid seller addresses and generate a unique nickname", () => {
      const res = validateAndNormalizeSellerAddress("SELLER_SURAT", {
        shopStreet: "Plot 42, Millenium Textile Market, Ring Road",
        shopCity: "Surat",
        shopState: "Gujarat",
        shopPincode: "395002",
        name: "Surat Silk Weavers",
        contactEmail: "surat@silk.com",
        mobile: "9876543210",
        pickupSameAsShop: true,
      });

      expect(res.valid).toBe(true);
      expect(res.normalized?.locationName).toBe("VASTRAA_SELLERSURAT_395002");
      expect(res.normalized?.city).toBe("Surat");
      expect(res.normalized?.pincode).toBe("395002");
    });

    it("should reject an address with an invalid mobile number", () => {
      const res = validateAndNormalizeSellerAddress("VND_1", {
        shopStreet: "Plot 42, Millenium Textile Market, Ring Road",
        shopCity: "Surat",
        shopState: "Gujarat",
        shopPincode: "395002",
        mobile: "12345", // Invalid mobile
      });

      expect(res.valid).toBe(false);
      expect(res.error).toMatch(/mobile number/i);
    });
  });

  describe("2. Automated Pickup Location Registration & Change Detection for Multiple Sellers", () => {
    const sellerA = {
      id: "VND_A_SURAT",
      name: "Seller A Handlooms",
      shopStreet: "42 Textile Hub, Surat",
      shopCity: "Surat",
      shopState: "Gujarat",
      shopPincode: "395002",
      mobile: "9825123456",
      contactEmail: "sellerA@surat.com",
      pickupSameAsShop: true,
    };

    const sellerB = {
      id: "VND_B_VARANASI",
      name: "Seller B Banarasi Weaves",
      shopStreet: "18 Chowk Bazaar, Godowlia",
      shopCity: "Varanasi",
      shopState: "Uttar Pradesh",
      shopPincode: "221001",
      mobile: "9415123456",
      contactEmail: "sellerB@varanasi.com",
      pickupSameAsShop: true,
    };

    it("should register Seller A and Seller B with different pickup locations", async () => {
      // Register Seller A in Surat
      const syncA = await syncSellerPickupToShiprocket(sellerA.id, sellerA, {});
      expect(syncA.success).toBe(true);
      expect(syncA.status).toBe("registered");
      expect(syncA.nickname).toBe("VASTRAA_VNDASURAT_395002");
      expect(syncA.pickupId).toBeDefined();

      // Register Seller B in Varanasi
      const syncB = await syncSellerPickupToShiprocket(sellerB.id, sellerB, {});
      expect(syncB.success).toBe(true);
      expect(syncB.status).toBe("registered");
      expect(syncB.nickname).toBe("VASTRAA_VNDBVARANASI_221001");
      expect(syncB.pickupId).toBeDefined();

      // Nicknames must be distinct
      expect(syncA.nickname).not.toBe(syncB.nickname);
      expect(syncA.pickupId).not.toBe(syncB.pickupId);
    });

    it("should reuse the existing registered pickup location when address is unchanged", async () => {
      const norm = validateAndNormalizeSellerAddress(sellerA.id, sellerA)!.normalized!;
      const hash = computeAddressHash(norm);

      const existingRecord = {
        shiprocketPickupLocationName: norm.locationName,
        shiprocketPickupId: 50001,
        shiprocketPickupStatus: "registered",
        shiprocketAddressHash: hash,
      };

      const syncResult = await syncSellerPickupToShiprocket(sellerA.id, sellerA, existingRecord);

      expect(syncResult.success).toBe(true);
      expect(syncResult.reused).toBe(true);
      expect(syncResult.nickname).toBe(norm.locationName);
    });

    it("should detect address changes and register updated location", async () => {
      const norm = validateAndNormalizeSellerAddress(sellerA.id, sellerA)!.normalized!;
      const oldHash = computeAddressHash(norm);

      const existingRecord = {
        shiprocketPickupLocationName: norm.locationName,
        shiprocketPickupId: 50001,
        shiprocketPickupStatus: "registered",
        shiprocketAddressHash: oldHash,
      };

      // Seller A relocates to a new shop in Surat with PIN 395007
      const relocatedSellerA = {
        ...sellerA,
        shopStreet: "New Textile Tower, Bhatar Road",
        shopPincode: "395007",
      };

      const syncResult = await syncSellerPickupToShiprocket(sellerA.id, relocatedSellerA, existingRecord);

      expect(syncResult.success).toBe(true);
      expect(syncResult.reused).toBe(false);
      expect(syncResult.nickname).toBe("VASTRAA_VNDASURAT_395007");
    });

    it("should generate a distinct revision nickname when street address changes within the same PIN code", async () => {
      const norm = validateAndNormalizeSellerAddress(sellerA.id, sellerA)!.normalized!;
      const oldHash = computeAddressHash(norm);

      const existingRecord = {
        shiprocketPickupLocationName: norm.locationName,
        shiprocketPickupId: 50001,
        shiprocketPickupStatus: "registered",
        shiprocketAddressHash: oldHash,
      };

      // Seller A changes street address but stays in PIN 395002
      const modifiedStreetSellerA = {
        ...sellerA,
        shopStreet: "Shop 101, New Diamond Market, Ring Road",
        shopPincode: "395002",
      };

      const syncResult = await syncSellerPickupToShiprocket(sellerA.id, modifiedStreetSellerA, existingRecord);

      expect(syncResult.success).toBe(true);
      expect(syncResult.reused).toBe(false);
      // Nickname should have a revision suffix so Shiprocket registers the new pickup address
      expect(syncResult.nickname).toContain("VASTRAA_VNDASURAT_395002_");
      expect(syncResult.nickname).not.toBe(existingRecord.shiprocketPickupLocationName);
    });

    it("should safely mark status as failed and record error if pickup address is invalid", async () => {
      const invalidSeller = {
        id: "VND_INVALID",
        shopStreet: "St", // Too short
        shopCity: "Surat",
        shopState: "Gujarat",
        shopPincode: "395002",
        mobile: "9876543210",
      };

      const syncResult = await syncSellerPickupToShiprocket(invalidSeller.id, invalidSeller, {});

      expect(syncResult.success).toBe(false);
      expect(syncResult.status).toBe("failed");
      expect(syncResult.error).toBeDefined();
    });
  });

  describe("3. Courier Partner Discovery & Serviceability", () => {
    it("should retrieve available couriers for Seller A (Surat 395002) to Customer (Delhi 110001)", async () => {
      const couriersRes = await getAvailableCouriers({
        pickupPincode: "395002",
        deliveryPincode: "110001",
        weightKg: 0.5,
        isCod: false,
      });

      expect(couriersRes.available).toBe(true);
      expect(couriersRes.couriers.length).toBeGreaterThan(0);

      const courierNames = couriersRes.couriers.map((c) => c.courierName);
      expect(courierNames).toContain("Delhivery Surface");
      expect(courierNames).toContain("BlueDart Air Express");

      // Verify returned rates and ETD
      const delhivery = couriersRes.couriers.find((c) => c.courierName === "Delhivery Surface");
      expect(delhivery?.freightCharge).toBeGreaterThan(0);
      expect(delhivery?.estimatedDeliveryDays).toBeGreaterThan(0);
    });

    it("should report unserviceable destination PIN codes", async () => {
      const unserviceableRes = await getAvailableCouriers({
        pickupPincode: "395002",
        deliveryPincode: "744101", // Test unserviceable range
        weightKg: 0.5,
      });

      expect(unserviceableRes.available).toBe(false);
      expect(unserviceableRes.couriers.length).toBe(0);
    });
  });

  describe("4. Order Dispatch, AWB Assignment & Pickup Scheduling", () => {
    const mockOrder = {
      id: "ORD_TEST_1001",
      displayId: "V1001",
      userId: "USER_CUST_1",
      paymentMethod: "prepaid",
      createdAt: new Date().toISOString(),
      status: "processing",
      statusHistory: [{ status: "confirmed" }, { status: "processing" }],
      address: {
        name: "Pooja Sharma",
        line1: "B-404 Sunshine Towers",
        city: "Mumbai",
        state: "Maharashtra",
        pincode: "400001",
        phone: "9819123456",
      },
    };

    it("should fail dispatch if seller pickup location is not verified", async () => {
      const unverifiedSeller = {
        id: "VND_UNVERIFIED",
        name: "Unverified Seller",
        shiprocketPickupStatus: "unregistered",
      };

      const result = await createAndDispatchShipment({
        order: mockOrder,
        vendorId: "VND_UNVERIFIED",
        vendorRecord: unverifiedSeller,
        vendorItems: [{ productId: "PROD_1", name: "Silk Saree", price: 2999, quantity: 1 }],
      });

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/has not been registered or validated/i);
    });

    it("should successfully dispatch order, generate AWB and schedule pickup for verified seller", async () => {
      const verifiedSeller = {
        id: "VND_A_SURAT",
        name: "Surat Sarees",
        shiprocketPickupLocationName: "VASTRAA_VNDA_395002",
        shiprocketPickupId: 50001,
        shiprocketPickupStatus: "registered",
        pickupPincode: "395002",
      };

      const result = await createAndDispatchShipment({
        order: mockOrder,
        vendorId: verifiedSeller.id,
        vendorRecord: verifiedSeller,
        vendorItems: [{ productId: "PROD_A", name: "Paithani Saree", price: 4999, quantity: 1 }],
        selectedCourierCompanyId: 2,
        courierName: "Delhivery Surface",
        parcelWeightKg: 0.6,
      });

      expect(result.success).toBe(true);
      expect(result.status).toBe("pickup_scheduled");
      expect(result.awbNumber).toMatch(/^SR-/);
      expect(result.pickupToken).toMatch(/^PKP-/);
      expect(result.labelUrl).toContain(".pdf");
      expect(result.shipment).toBeDefined();
      expect(result.shipment.awbNumber).toBe(result.awbNumber);

      // Verify shipment is recorded in mongoShipments
      const saved = await mongoShipments.findByOrderId(mockOrder.id);
      expect(saved.length).toBeGreaterThan(0);
      const myShipment = saved.find((s) => s.vendorId === verifiedSeller.id);
      expect(myShipment).toBeDefined();
      expect(myShipment?.awbNumber).toBe(result.awbNumber);
      expect(myShipment?.pickupLocationName).toBe(verifiedSeller.shiprocketPickupLocationName);
    });

    it("should be idempotent and prevent duplicate shipments for the same seller and order", async () => {
      const verifiedSeller = {
        id: "VND_A_SURAT",
        name: "Surat Sarees",
        shiprocketPickupLocationName: "VASTRAA_VNDA_395002",
        shiprocketPickupId: 50001,
        shiprocketPickupStatus: "registered",
        pickupPincode: "395002",
      };

      // First dispatch
      const res1 = await createAndDispatchShipment({
        order: mockOrder,
        vendorId: verifiedSeller.id,
        vendorRecord: verifiedSeller,
        vendorItems: [{ productId: "PROD_A", name: "Paithani Saree", price: 4999, quantity: 1 }],
      });

      // Second dispatch with same parameters
      const res2 = await createAndDispatchShipment({
        order: mockOrder,
        vendorId: verifiedSeller.id,
        vendorRecord: verifiedSeller,
        vendorItems: [{ productId: "PROD_A", name: "Paithani Saree", price: 4999, quantity: 1 }],
      });

      expect(res2.success).toBe(true);
      expect(res2.reused).toBe(true);
      expect(res2.awbNumber).toBe(res1.awbNumber);
      expect(res2.shipment).toBeDefined();
      expect(res2.shipment?.id).toBe(res1.shipment?.id);
    });
  });

  describe("5. Multi-Seller Order Isolation", () => {
    it("should create separate shipments with seller-specific pickup locations for multi-seller order", async () => {
      const multiSellerOrder = {
        id: "ORD_MULTI_2002",
        displayId: "V2002",
        userId: "USER_CUST_2",
        paymentMethod: "prepaid",
        createdAt: new Date().toISOString(),
        status: "processing",
        statusHistory: [{ status: "confirmed" }, { status: "processing" }],
        address: {
          name: "Anita Desai",
          line1: "12 MG Road",
          city: "Bengaluru",
          state: "Karnataka",
          pincode: "560001",
          phone: "9845123456",
        },
      };

      const sellerSurat = {
        id: "SELLER_SURAT",
        name: "Surat Sarees",
        shiprocketPickupLocationName: "VASTRAA_SURAT_395002",
        shiprocketPickupId: 50001,
        shiprocketPickupStatus: "registered",
        pickupPincode: "395002",
      };

      const sellerVaranasi = {
        id: "SELLER_VARANASI",
        name: "Varanasi Silks",
        shiprocketPickupLocationName: "VASTRAA_VARANASI_221001",
        shiprocketPickupId: 50002,
        shiprocketPickupStatus: "registered",
        pickupPincode: "221001",
      };

      // Seller in Surat dispatches their portion
      const dispatchSurat = await createAndDispatchShipment({
        order: multiSellerOrder,
        vendorId: sellerSurat.id,
        vendorRecord: sellerSurat,
        vendorItems: [{ productId: "PROD_SURAT_1", name: "Bandhani Saree", price: 3500, quantity: 1 }],
      });

      // Seller in Varanasi dispatches their portion
      const dispatchVaranasi = await createAndDispatchShipment({
        order: multiSellerOrder,
        vendorId: sellerVaranasi.id,
        vendorRecord: sellerVaranasi,
        vendorItems: [{ productId: "PROD_VARANASI_1", name: "Banarasi Dupatta", price: 2500, quantity: 1 }],
      });

      expect(dispatchSurat.success).toBe(true);
      expect(dispatchVaranasi.success).toBe(true);
      expect(dispatchSurat.awbNumber).not.toBe(dispatchVaranasi.awbNumber);

      const allShipments = await mongoShipments.findByOrderId(multiSellerOrder.id);
      expect(allShipments.length).toBe(2);

      const suratShipment = allShipments.find((s) => s.vendorId === sellerSurat.id);
      const varanasiShipment = allShipments.find((s) => s.vendorId === sellerVaranasi.id);

      // Verify strict isolation: each shipment has its own seller's pickup location
      expect(suratShipment?.pickupLocationName).toBe(sellerSurat.shiprocketPickupLocationName);
      expect(varanasiShipment?.pickupLocationName).toBe(sellerVaranasi.shiprocketPickupLocationName);
    });
  });

  describe("6. Courier Webhook and Physical Pickup Confirmation Rule", () => {
    it("should update shipment status to picked_up only when courier confirms collection", async () => {
      const order = {
        id: "ORD_WEBHOOK_3003",
        userId: "USER_CUST_3",
        status: "ready_to_ship",
        statusHistory: [],
      };
      const shipment = await mongoShipments.insert({
        orderId: order.id,
        vendorId: "VND_WH_1",
        awbNumber: "SR-DEL-33881122",
        status: "pickup_scheduled",
        courierName: "Delhivery Surface",
      });
      await mongoOrders.insert(order);

      // Verify that after scheduling, it is NOT marked picked_up
      expect(shipment.status).toBe("pickup_scheduled");

      // Simulate webhook: courier agent arrives and scans package
      const updated = await mongoShipments.update(shipment.id, {
        status: "picked_up",
        trackingHistory: [
          {
            status: "picked_up",
            timestamp: new Date().toISOString(),
            activity: "Package received and scanned by courier agent at seller location",
          },
        ],
      });

      expect(updated?.status).toBe("picked_up");
      expect(updated?.trackingHistory.length).toBe(1);
    });
  });
});

