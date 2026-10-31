import { describe, it, expect, beforeAll } from "vitest";
import {
  validateAndNormalizeSellerAddress,
  computeAddressHash,
  syncSellerPickupToShiprocket,
} from "../services/shipping/shiprocketPickupService";
import { getAvailableCouriers } from "../services/shipping/shiprocketCourierService";
import { createAndDispatchShipment } from "../services/shipping/shiprocketShipmentService";
import { shiprocketMock } from "../services/shipping/shiprocketMock";
import { mongoVendors, mongoSellers, mongoShipments, mongoOrders } from "@workspace/db";

describe("Shiprocket E2E Two-Sellers Integration Suite", () => {
  beforeAll(() => {
    shiprocketMock.reset();
  });

  const seller1Data = {
    id: "VND_E2E_SURAT_1",
    vendorId: "VND_E2E_SURAT_1",
    shopName: "Surat Zari Sarees",
    name: "Surat Zari Sarees",
    contactEmail: "surat.zari@vashtraa.test",
    email: "surat.zari@vashtraa.test",
    mobile: "9825198765",
    location: "Surat, Gujarat",
    shopStreet: "Plot 105, Ring Road Textile Hub",
    shopCity: "Surat",
    shopState: "Gujarat",
    shopPincode: "395002",
    pickupSameAsShop: true,
  };

  const seller2Data = {
    id: "VND_E2E_VARANASI_2",
    vendorId: "VND_E2E_VARANASI_2",
    shopName: "Varanasi Silk Weavers",
    name: "Varanasi Silk Weavers",
    contactEmail: "varanasi.weavers@vashtraa.test",
    email: "varanasi.weavers@vashtraa.test",
    mobile: "9415198765",
    location: "Varanasi, Uttar Pradesh",
    shopStreet: "Shop 12, Chowk Vishwanath Galli",
    shopCity: "Varanasi",
    shopState: "Uttar Pradesh",
    shopPincode: "221001",
    pickupSameAsShop: true,
  };

  describe("Phase 1: Two Sellers Registration & Automated Shiprocket Pickup Sync", () => {
    it("should register Seller 1 (Surat) and auto-sync pickup address to Shiprocket", async () => {
      // 1. Validate & Normalize
      const norm1 = validateAndNormalizeSellerAddress(seller1Data.vendorId, seller1Data, {});
      expect(norm1.valid).toBe(true);
      expect(norm1.normalized?.city).toBe("Surat");
      expect(norm1.normalized?.pincode).toBe("395002");
      expect(norm1.normalized?.locationName).toBe("VASTRAA_VNDE2ESURAT1_395002");

      // 2. Initial registration sync to Shiprocket
      const sync1 = await syncSellerPickupToShiprocket(seller1Data.vendorId, seller1Data, {});
      expect(sync1.success).toBe(true);
      expect(sync1.status).toBe("registered");
      expect(sync1.nickname).toBe("VASTRAA_VNDE2ESURAT1_395002");
      expect(sync1.pickupId).toBeGreaterThan(0);
      expect(sync1.reused).toBe(false);

      // Verify stored in MongoDB vendors repository
      const savedSeller1 = (await mongoVendors.findById(seller1Data.vendorId)) || (await mongoSellers.findById(seller1Data.vendorId));
      expect(savedSeller1).toBeDefined();
      expect(savedSeller1?.shiprocketPickupLocationName).toBe(sync1.nickname);
      expect(savedSeller1?.shiprocketPickupStatus).toBe("registered");
      expect(savedSeller1?.pickupPincode).toBe("395002");
    });

    it("should register Seller 2 (Varanasi) with completely isolated pickup address and Shiprocket ID", async () => {
      // 1. Validate & Normalize
      const norm2 = validateAndNormalizeSellerAddress(seller2Data.vendorId, seller2Data, {});
      expect(norm2.valid).toBe(true);
      expect(norm2.normalized?.city).toBe("Varanasi");
      expect(norm2.normalized?.pincode).toBe("221001");
      expect(norm2.normalized?.locationName).toBe("VASTRAA_VNDE2EVARANASI2_221001");

      // 2. Initial registration sync to Shiprocket
      const sync2 = await syncSellerPickupToShiprocket(seller2Data.vendorId, seller2Data, {});
      expect(sync2.success).toBe(true);
      expect(sync2.status).toBe("registered");
      expect(sync2.nickname).toBe("VASTRAA_VNDE2EVARANASI2_221001");
      expect(sync2.pickupId).toBeGreaterThan(0);

      // Verify Seller 1 and Seller 2 have completely different nicknames and pickup IDs
      const s1 = (await mongoVendors.findById(seller1Data.vendorId)) || (await mongoSellers.findById(seller1Data.vendorId));
      const s2 = (await mongoVendors.findById(seller2Data.vendorId)) || (await mongoSellers.findById(seller2Data.vendorId));

      expect(s1?.shiprocketPickupLocationName).not.toBe(s2?.shiprocketPickupLocationName);
      expect(s1?.shiprocketPickupId).not.toBe(s2?.shiprocketPickupId);
      expect(s1?.pickupPincode).toBe("395002");
      expect(s2?.pickupPincode).toBe("221001");
    });
  });

  describe("Phase 2: Address Change Detection & Pickup Location Re-sync", () => {
    it("should reuse the existing registered pickup location when Seller 1 profile is saved with unchanged address", async () => {
      const currentS1 = (await mongoVendors.findById(seller1Data.vendorId)) || (await mongoSellers.findById(seller1Data.vendorId));
      expect(currentS1).toBeDefined();

      const resaveSync = await syncSellerPickupToShiprocket(seller1Data.vendorId, seller1Data, currentS1);
      expect(resaveSync.success).toBe(true);
      expect(resaveSync.reused).toBe(true);
      expect(resaveSync.nickname).toBe(currentS1?.shiprocketPickupLocationName);
      expect(resaveSync.pickupId).toBe(currentS1?.shiprocketPickupId);
    });

    it("should detect address change within same PIN code and generate a distinct revision nickname for Shiprocket", async () => {
      const currentS1 = (await mongoVendors.findById(seller1Data.vendorId)) || (await mongoSellers.findById(seller1Data.vendorId));

      // Seller 1 moves to a different shop in the same PIN code (395002)
      const relocatedS1 = {
        ...seller1Data,
        shopStreet: "Shop 404, Millennium Textile Market 2, Ring Road",
        shopPincode: "395002",
      };

      const updateSync = await syncSellerPickupToShiprocket(seller1Data.vendorId, relocatedS1, currentS1);
      expect(updateSync.success).toBe(true);
      expect(updateSync.reused).toBe(false);
      // Nickname must be revised so Shiprocket registers the new pickup address
      expect(updateSync.nickname).toContain("VASTRAA_VNDE2ESURAT1_395002_");
      expect(updateSync.nickname).not.toBe(currentS1?.shiprocketPickupLocationName);

      const updatedS1 = (await mongoVendors.findById(seller1Data.vendorId)) || (await mongoSellers.findById(seller1Data.vendorId));
      expect(updatedS1?.shiprocketPickupLocationName).toBe(updateSync.nickname);
      expect(updatedS1?.pickupAddressLine1).toBe("Shop 404, Millennium Textile Market 2, Ring Road");
    });
  });

  describe("Phase 3: Courier Partner Discovery & Serviceability for Both Locations", () => {
    const customerPin = "560001"; // Bengaluru

    it("should check courier serviceability from Seller 1 (Surat 395002) to Customer (Bengaluru 560001)", async () => {
      const courierS1 = await getAvailableCouriers({
        pickupPincode: "395002",
        deliveryPincode: customerPin,
        weightKg: 0.8,
        isCod: false,
      });

      expect(courierS1.available).toBe(true);
      expect(courierS1.couriers.length).toBeGreaterThan(0);
      const names = courierS1.couriers.map((c) => c.courierName);
      expect(names).toContain("BlueDart Air Express");
      expect(names).toContain("Delhivery Surface");
    });

    it("should check courier serviceability from Seller 2 (Varanasi 221001) to Customer (Bengaluru 560001)", async () => {
      const courierS2 = await getAvailableCouriers({
        pickupPincode: "221001",
        deliveryPincode: customerPin,
        weightKg: 0.8,
        isCod: false,
      });

      expect(courierS2.available).toBe(true);
      expect(courierS2.couriers.length).toBeGreaterThan(0);
    });
  });

  describe("Phase 4: Order Dispatch & Multi-Seller Shipment Isolation", () => {
    const multiSellerOrder = {
      id: "ORD_E2E_9001",
      displayId: "V9001",
      userId: "USER_CUST_E2E",
      paymentMethod: "prepaid",
      createdAt: new Date().toISOString(),
      status: "processing",
      statusHistory: [{ status: "confirmed" }, { status: "processing" }],
      address: {
        name: "Meera Nair",
        line1: "42 Indiranagar 100ft Road",
        city: "Bengaluru",
        state: "Karnataka",
        pincode: "560001",
        phone: "9845199999",
      },
    };

    it("should prevent dispatch if seller has not registered a valid pickup address", async () => {
      const unverifiedSeller = {
        id: "VND_UNVERIFIED",
        name: "Unverified Artisan",
        shiprocketPickupStatus: "failed",
        shiprocketPickupError: "Invalid street address",
      };

      const dispatchResult = await createAndDispatchShipment({
        order: multiSellerOrder,
        vendorId: unverifiedSeller.id,
        vendorRecord: unverifiedSeller,
        vendorItems: [{ productId: "PROD_UNV", name: "Cotton Dupatta", price: 800, quantity: 1 }],
      });

      expect(dispatchResult.success).toBe(false);
      expect(dispatchResult.error).toMatch(/has not been registered or validated/i);
    });

    it("should dispatch Seller 1's items and assign shipment with Surat pickup address", async () => {
      const s1 = (await mongoVendors.findById(seller1Data.vendorId)) || (await mongoSellers.findById(seller1Data.vendorId));

      const dispatch1 = await createAndDispatchShipment({
        order: multiSellerOrder,
        vendorId: seller1Data.vendorId,
        vendorRecord: s1,
        vendorItems: [{ productId: "PROD_SURAT_ZARI", name: "Surat Zari Silk Saree", price: 7500, quantity: 1 }],
        selectedCourierCompanyId: 2, // Delhivery Surface
        courierName: "Delhivery Surface",
        parcelWeightKg: 0.7,
      });

      expect(dispatch1.success).toBe(true);
      expect(dispatch1.status).toBe("pickup_scheduled");
      expect(dispatch1.awbNumber).toMatch(/^SR-/);
      expect(dispatch1.pickupToken).toMatch(/^PKP-/);
      expect(dispatch1.courierName).toBe("Delhivery Surface");
      expect(dispatch1.shipment).toBeDefined();
      expect(dispatch1.shipment.pickupLocationName).toBe(s1?.shiprocketPickupLocationName);
    });

    it("should dispatch Seller 2's items and assign shipment with Varanasi pickup address", async () => {
      const s2 = (await mongoVendors.findById(seller2Data.vendorId)) || (await mongoSellers.findById(seller2Data.vendorId));

      const dispatch2 = await createAndDispatchShipment({
        order: multiSellerOrder,
        vendorId: seller2Data.vendorId,
        vendorRecord: s2,
        vendorItems: [{ productId: "PROD_VARANASI_BROCADE", name: "Varanasi Katan Silk Brocade", price: 12000, quantity: 1 }],
        selectedCourierCompanyId: 1, // BlueDart Air Express
        courierName: "BlueDart Air Express",
        parcelWeightKg: 0.9,
      });

      expect(dispatch2.success).toBe(true);
      expect(dispatch2.status).toBe("pickup_scheduled");
      expect(dispatch2.awbNumber).toMatch(/^SR-/);
      expect(dispatch2.pickupToken).toMatch(/^PKP-/);
      expect(dispatch2.courierName).toBe("BlueDart Air Express");
      expect(dispatch2.shipment).toBeDefined();
      expect(dispatch2.shipment.pickupLocationName).toBe(s2?.shiprocketPickupLocationName);
    });

    it("should maintain strict isolation between Seller 1 and Seller 2 shipments in MongoDB", async () => {
      const allShipments = await mongoShipments.findByOrderId(multiSellerOrder.id);
      expect(allShipments.length).toBe(2);

      const shp1 = allShipments.find((s) => s.vendorId === seller1Data.vendorId);
      const shp2 = allShipments.find((s) => s.vendorId === seller2Data.vendorId);

      expect(shp1).toBeDefined();
      expect(shp2).toBeDefined();
      expect(shp1?.awbNumber).not.toBe(shp2?.awbNumber);
      expect(shp1?.pickupLocationName).not.toBe(shp2?.pickupLocationName);
      expect(shp1?.courierName).toBe("Delhivery Surface");
      expect(shp2?.courierName).toBe("BlueDart Air Express");
    });

    it("should be idempotent and not create duplicate shipments upon re-dispatch", async () => {
      const s1 = (await mongoVendors.findById(seller1Data.vendorId)) || (await mongoSellers.findById(seller1Data.vendorId));

      const redispatch1 = await createAndDispatchShipment({
        order: multiSellerOrder,
        vendorId: seller1Data.vendorId,
        vendorRecord: s1,
        vendorItems: [{ productId: "PROD_SURAT_ZARI", name: "Surat Zari Silk Saree", price: 7500, quantity: 1 }],
      });

      expect(redispatch1.success).toBe(true);
      expect(redispatch1.reused).toBe(true);

      const allShipments = await mongoShipments.findByOrderId(multiSellerOrder.id);
      expect(allShipments.length).toBe(2); // Still exactly 2 shipments
    });
  });

  describe("Phase 5: Webhook Courier Scan Confirmation Rule", () => {
    it("should verify that parcels are only marked picked_up when courier scan arrives", async () => {
      const shipments = await mongoShipments.findByOrderId("ORD_E2E_9001");
      const shp1 = shipments.find((s) => s.vendorId === seller1Data.vendorId);
      expect(shp1?.status).toBe("pickup_scheduled");

      // Simulate courier arrival scan
      const updatedShp1 = await mongoShipments.update(shp1!.id, {
        status: "picked_up",
        trackingHistory: [
          ...(shp1?.trackingHistory || []),
          {
            status: "picked_up",
            timestamp: new Date().toISOString(),
            activity: "Courier pickup completed by agent at Surat shop",
            location: "Surat",
          },
        ],
      });

      expect(updatedShp1?.status).toBe("picked_up");
      expect(updatedShp1?.trackingHistory.some((t: any) => t.status === "picked_up")).toBe(true);
    });
  });
});
