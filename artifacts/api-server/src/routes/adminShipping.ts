import { Router } from "express";
import { mongoVendors, mongoSellers, mongoShipments, db, vendorsTable, eq } from "@workspace/db";
import { requireAdminKey } from "../middlewares/isAdmin";
import { isShiprocketConfigured, getShiprocketCredentials } from "../services/shipping/shiprocketClient";
import { syncSellerPickupToShiprocket } from "../services/shipping/shiprocketPickupService";
import { shiprocketMock } from "../services/shipping/shiprocketMock";

const router = Router();

/**
 * GET /admin/shipping/status
 * Returns system-wide Shiprocket integration status.
 */
router.get("/admin/shipping/status", requireAdminKey, async (_req: any, res: any) => {
  const configured = isShiprocketConfigured();
  const { email } = getShiprocketCredentials();

  let mockLocationsCount = 0;
  if (!configured) {
    mockLocationsCount = shiprocketMock.getAllPickupLocations().length;
  }

  const allVendors = (await mongoVendors.findMany({})) || [];
  const registeredCount = allVendors.filter((v: any) => v.shiprocketPickupStatus === "registered").length;

  res.json({
    configured,
    mode: configured ? "live" : "sandbox_mock",
    accountEmail: email ? `${email.slice(0, 3)}***@${email.split("@")[1] || ""}` : null,
    totalSellers: allVendors.length,
    registeredPickupLocations: registeredCount,
    mockLocationsCount,
  });
});

/**
 * GET /admin/shipping/sellers
 * Lists all sellers with their Shiprocket pickup location and activation details.
 */
router.get("/admin/shipping/sellers", requireAdminKey, async (_req: any, res: any) => {
  try {
    const sellers = (await mongoVendors.findMany({})) || [];
    const formatted = sellers.map((s: any) => ({
      vendorId: s.id || s.vendorId,
      name: s.shopName || s.name || "Seller",
      email: s.contactEmail || s.email,
      mobile: s.mobile,
      city: s.pickupCity || s.shopCity,
      state: s.pickupState || s.shopState,
      pincode: s.pickupPincode || s.shopPincode,
      shiprocketPickupLocationName: s.shiprocketPickupLocationName || null,
      shiprocketPickupId: s.shiprocketPickupId || null,
      shiprocketPickupStatus: s.shiprocketPickupStatus || "unregistered",
      shiprocketPickupError: s.shiprocketPickupError || null,
      shippingActivated: s.shippingActivated ?? true,
    }));

    res.json({ sellers: formatted });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to load seller shipping records" });
  }
});

/**
 * POST /admin/shipping/sellers/:vendorId/toggle
 * Toggles shipping activation for a specific seller.
 */
router.post("/admin/shipping/sellers/:vendorId/toggle", requireAdminKey, async (req: any, res: any) => {
  const { vendorId } = req.params;
  try {
    const vendor = (await mongoVendors.findById(vendorId)) || (await mongoSellers.findById(vendorId));
    if (!vendor) return res.status(404).json({ error: "Seller not found" });

    const currentStatus = vendor.shippingActivated ?? true;
    const newStatus = !currentStatus;

    await mongoVendors.update(vendorId, { shippingActivated: newStatus });
    await mongoSellers.update(vendorId, { shippingActivated: newStatus });
    try {
      await db.update(vendorsTable).set({ shippingActivated: newStatus }).where(eq(vendorsTable.id, vendorId));
    } catch {}

    res.json({ success: true, vendorId, shippingActivated: newStatus });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to toggle seller shipping activation" });
  }
});

/**
 * POST /admin/shipping/sellers/:vendorId/sync
 * Admin-triggered sync of seller pickup location to Shiprocket.
 */
router.post("/admin/shipping/sellers/:vendorId/sync", requireAdminKey, async (req: any, res: any) => {
  const { vendorId } = req.params;
  try {
    const vendor = (await mongoVendors.findById(vendorId)) || (await mongoSellers.findById(vendorId));
    if (!vendor) return res.status(404).json({ error: "Seller not found" });

    const result = await syncSellerPickupToShiprocket(vendorId, req.body || {}, vendor);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: "Failed to sync seller pickup location" });
  }
});

/**
 * GET /admin/shipping/shipments
 * Lists all shipments across all sellers.
 */
router.get("/admin/shipping/shipments", requireAdminKey, async (req: any, res: any) => {
  try {
    const statusFilter = req.query.status ? String(req.query.status).trim() : undefined;
    const filter = statusFilter ? { status: statusFilter } : {};
    const shipments = await mongoShipments.findMany(filter as any, { sort: { createdAt: -1 }, limit: 100 });

    res.json({ shipments, total: shipments.length });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to load shipments" });
  }
});

export default router;
