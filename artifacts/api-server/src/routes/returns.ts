import { Router, Request, Response } from "express";
import express from "express";
import { returnsService } from "../services/returns/returnsService";
import { ALLOWED_RETURN_ISSUES, ReturnIssueCategory } from "../services/returns/returnsTypes";
import { isAuthenticated as requireAuth } from "../middlewares/isAuthenticated";
import { requireAdminKey } from "../middlewares/isAdmin";
import { requireVendorAuth } from "../middlewares/requireVendorAuth";
import { r2StorageService } from "../services/r2StorageService";
import { verifyCashfreeWebhookSignature } from "../lib/cashfree";
import { logger } from "../lib/logger";

const router = Router();

// ─────────────────────────────────────────────────────────────────────────────
// 1. CUSTOMER PORTAL ENDPOINTS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/returns/eligible-orders
 * Returns customer's delivered orders within the 7-calendar-day window with item-level eligibility.
 */
router.get("/returns/eligible-orders", requireAuth, async (req: any, res: Response) => {
  try {
    const userId = req.userId;
    const { mongoOrders } = await import("@workspace/db");
    const deliveredOrders = await mongoOrders.findMany(
      {
        userId,
        status: "delivered",
        isDemo: { $ne: true },
        isTest: { $ne: true },
      },
      { sort: { deliveredAt: -1, updatedAt: -1, createdAt: -1 } }
    );

    const results = [];
    for (const ord of deliveredOrders) {
      const elig = await returnsService.checkOrderEligibility(ord.id, userId);
      results.push({
        orderId: ord.id,
        displayId: ord.displayId || ord.id,
        createdAt: ord.createdAt,
        deliveredAt: elig.deliveredAt,
        daysSinceDelivery: elig.daysSinceDelivery,
        daysRemaining: elig.daysRemaining,
        eligible: elig.eligible,
        ineligibleReason: elig.ineligibleReason,
        items: elig.itemsEligibility,
        total: ord.total,
        orderData: {
          items: ord.items,
          address: ord.address,
        },
      });
    }

    res.json({ eligibleOrders: results, allowedIssueCategories: ALLOWED_RETURN_ISSUES });
  } catch (err: any) {
    logger.error({ err }, "Failed to fetch customer eligible return orders");
    res.status(500).json({ error: err?.message || "Failed to fetch eligible return orders" });
  }
});

/**
 * GET /api/returns
 * Lists all return/exchange claims for the authenticated customer.
 */
router.get("/returns", requireAuth, async (req: any, res: Response) => {
  try {
    const userId = req.userId;
    const returns = await returnsService.getCustomerReturns(userId);
    res.json({ returns });
  } catch (err: any) {
    logger.error({ err }, "Failed to fetch customer returns");
    res.status(500).json({ error: err?.message || "Failed to fetch returns" });
  }
});

/**
 * GET /api/returns/:id
 * Retrieves single return detail for customer with ownership check.
 */
router.get("/returns/:id", requireAuth, async (req: any, res: Response) => {
  try {
    const userId = req.userId;
    const ret = await returnsService.getReturnById(req.params.id, { userId });
    if (!ret) return res.status(404).json({ error: "Return claim not found" });
    res.json({ return: ret });
  } catch (err: any) {
    res.status(403).json({ error: err?.message || "Unauthorized" });
  }
});

/**
 * POST /api/returns
 * Submits an Issue-Based Return or Exchange request.
 */
router.post("/returns", requireAuth, async (req: any, res: Response) => {
  try {
    const userId = req.userId;
    const {
      orderId,
      requestType = "return",
      issueCategory,
      customerNotes,
      evidenceUrls,
      selectedItems,
      preferredRefundMethod = "original_payment",
      bankDetails,
    } = req.body;

    if (!orderId) {
      return res.status(400).json({ error: "orderId is required" });
    }
    if (!issueCategory) {
      return res.status(400).json({ error: "issueCategory is required" });
    }

    const result = await returnsService.createReturnRequest({
      userId,
      userName: req.user?.name || req.userEmail?.split("@")[0],
      userEmail: req.userEmail || req.user?.email,
      userPhone: req.user?.phone,
      orderId,
      requestType,
      issueCategory: issueCategory as ReturnIssueCategory,
      customerNotes: customerNotes || "",
      evidenceUrls: Array.isArray(evidenceUrls) ? evidenceUrls : [],
      selectedItems: Array.isArray(selectedItems) ? selectedItems : [],
      preferredRefundMethod,
      bankDetails,
    });

    res.status(201).json(result);
  } catch (err: any) {
    logger.error({ err }, "Error submitting return request");
    res.status(400).json({ error: err?.message || "Failed to submit return request" });
  }
});

/**
 * POST /api/returns/:id/cancel
 * Allows customer to cancel their pending/approved return request before pickup.
 */
router.post("/returns/:id/cancel", requireAuth, async (req: any, res: Response) => {
  try {
    const userId = req.userId;
    const { reason } = req.body || {};
    const updated = await returnsService.cancelReturnRequest(req.params.id, {
      userId,
      reason: reason || "Cancelled by customer",
    });
    res.json({ success: true, return: updated });
  } catch (err: any) {
    res.status(400).json({ error: err?.message || "Failed to cancel return request" });
  }
});

/**
 * POST /api/returns/upload-evidence
 * Uploads supporting photographic evidence for a return or exchange claim.
 */
router.post(
  "/returns/upload-evidence",
  requireAuth,
  express.raw({ type: () => true, limit: "15mb" }),
  async (req: any, res: Response) => {
    try {
      const rawContentType = (req.headers["content-type"] || "image/jpeg").split(";")[0].trim();
      if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
        return res.status(400).json({ error: "No image payload received." });
      }

      const userId = req.userId || "customer";
      const { publicUrl, objectKey } = await r2StorageService.uploadObjectServerSide(
        req.body,
        rawContentType,
        userId,
        undefined,
        `return-evidence-${Date.now()}.jpg`
      );

      res.json({ url: publicUrl, objectKey });
    } catch (err: any) {
      logger.error({ err }, "Failed to upload return evidence image");
      res.status(500).json({ error: err?.message || "Failed to upload evidence image" });
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// 2. ADMIN PORTAL ENDPOINTS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/admin/returns/analytics
 * Seller-wise and category-wise return & exchange intelligence.
 */
router.get("/admin/returns/analytics", requireAdminKey, async (_req: Request, res: Response) => {
  try {
    const analytics = await returnsService.getReturnAnalytics();
    res.json(analytics);
  } catch (err: any) {
    logger.error({ err }, "Failed to load return analytics");
    res.status(500).json({ error: err?.message || "Failed to load return analytics" });
  }
});

/**
 * GET /api/admin/returns
 * Comprehensive admin return/exchange list with multi-parameter filtering.
 */
router.get("/admin/returns", requireAdminKey, async (req: Request, res: Response) => {
  try {
    const { status, requestType, vendorId, issueCategory, search } = req.query;
    const data = await returnsService.getAllReturns({
      status: status as string,
      requestType: requestType as string,
      vendorId: vendorId as string,
      issueCategory: issueCategory as string,
      search: search as string,
    });
    res.json({ ...data, orders: data.returns });
  } catch (err: any) {
    logger.error({ err }, "Failed to load admin returns");
    res.status(500).json({ error: err?.message || "Failed to load admin returns" });
  }
});

/**
 * GET /api/admin/returns/:id
 * Detailed return claim view for admin inspection.
 */
router.get("/admin/returns/:id", requireAdminKey, async (req: Request, res: Response) => {
  try {
    const ret = await returnsService.getReturnById(req.params.id, { isAdmin: true });
    if (!ret) return res.status(404).json({ error: "Return claim not found" });
    res.json({ return: ret });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Failed to fetch return claim" });
  }
});

/**
 * POST /api/admin/returns/:id/review
 * Admin reviews claim: APPROVE (schedules reverse pickup) or REJECT (with mandatory note).
 */
router.post("/admin/returns/:id/review", requireAdminKey, async (req: Request, res: Response) => {
  try {
    const { decision, reviewNotes, rejectionReason } = req.body;
    if (!decision || !["approved", "rejected"].includes(decision)) {
      return res.status(400).json({ error: "decision must be 'approved' or 'rejected'" });
    }

    const updated = await returnsService.reviewReturnRequest({
      returnId: req.params.id,
      actor: "admin",
      decision,
      reviewNotes,
      rejectionReason,
    });

    res.json({ success: true, return: updated });
  } catch (err: any) {
    logger.error({ err }, "Admin review failed");
    res.status(400).json({ error: err?.message || "Review failed" });
  }
});

/**
 * POST /api/admin/returns/:id/tracking
 * Updates tracking status for a return shipment.
 */
router.post("/admin/returns/:id/tracking", requireAdminKey, async (req: Request, res: Response) => {
  try {
    const { event, location, note } = req.body;
    if (!event || !["PICKUP_COMPLETED", "IN_TRANSIT", "RECEIVED", "PICKUP_FAILED"].includes(event)) {
      return res.status(400).json({ error: "Invalid tracking event" });
    }

    const updated = await returnsService.updatePickupTracking(req.params.id, event, location, note);
    res.json({ success: true, return: updated });
  } catch (err: any) {
    res.status(400).json({ error: err?.message || "Tracking update failed" });
  }
});

/**
 * POST /api/admin/returns/:id/pickup
 * Manually schedules or updates reverse pickup details.
 */
router.post("/admin/returns/:id/pickup", requireAdminKey, async (req: Request, res: Response) => {
  try {
    const { courierName, awbNumber, pickupDate, notes } = req.body || {};
    const updated = await returnsService.schedulePickupManually(req.params.id, {
      courierName,
      awbNumber,
      pickupDate,
      notes,
    });
    res.json({ success: true, return: updated });
  } catch (err: any) {
    res.status(400).json({ error: err?.message || "Failed to schedule pickup" });
  }
});

/**
 * POST /api/admin/returns/:id/receive
 * Admin marks returned package received at warehouse facility.
 */
router.post("/admin/returns/:id/receive", requireAdminKey, async (req: Request, res: Response) => {
  try {
    const updated = await returnsService.updatePickupTracking(
      req.params.id,
      "RECEIVED",
      "VASTRAA Central Inspection Facility",
      "Package received at warehouse. Ready for Quality Check."
    );
    res.json({ success: true, return: updated });
  } catch (err: any) {
    res.status(400).json({ error: err?.message || "Failed to mark as received" });
  }
});

/**
 * POST /api/admin/returns/:id/qc
 * Conducts physical Quality Check upon warehouse receipt.
 */
router.post("/admin/returns/:id/qc", requireAdminKey, async (req: Request, res: Response) => {
  try {
    const {
      conditionPass,
      defectVerified,
      originalTagsPresent,
      packagingIntact,
      qcNotes = "",
      qcPhotos,
    } = req.body;

    const updated = await returnsService.submitQualityCheck({
      returnId: req.params.id,
      inspector: "admin",
      conditionPass: Boolean(conditionPass),
      defectVerified: Boolean(defectVerified),
      originalTagsPresent: Boolean(originalTagsPresent),
      packagingIntact: Boolean(packagingIntact),
      qcNotes: String(qcNotes),
      qcPhotos: Array.isArray(qcPhotos) ? qcPhotos : [],
    });

    res.json({ success: true, return: updated });
  } catch (err: any) {
    logger.error({ err }, "Admin QC submission failed");
    res.status(400).json({ error: err?.message || "Quality check failed" });
  }
});

/**
 * POST /api/admin/returns/:id/refund
 * Initiates or finalizes payment gateway refund with idempotency.
 */
router.post("/admin/returns/:id/refund", requireAdminKey, async (req: Request, res: Response) => {
  try {
    const updated = await returnsService.processRefundPayment(req.params.id, "super_admin");
    res.json({ success: true, return: updated });
  } catch (err: any) {
    logger.error({ err }, "Admin refund processing failed");
    res.status(400).json({ error: err?.message || "Refund processing failed" });
  }
});

/**
 * POST /api/admin/returns/:id/exchange
 * Dispatches replacement saree for an exchange request.
 */
router.post("/admin/returns/:id/exchange", requireAdminKey, async (req: Request, res: Response) => {
  try {
    const updated = await returnsService.processExchangeFulfillment(req.params.id, "super_admin");
    res.json({ success: true, return: updated });
  } catch (err: any) {
    logger.error({ err }, "Admin exchange fulfillment failed");
    res.status(400).json({ error: err?.message || "Exchange fulfillment failed" });
  }
});

/**
 * POST /api/admin/returns/:id/delivered
 * Confirms delivery of replacement product to customer.
 */
router.post("/admin/returns/:id/delivered", requireAdminKey, async (req: Request, res: Response) => {
  try {
    const updated = await returnsService.markExchangeDelivered(req.params.id, "super_admin");
    res.json({ success: true, return: updated });
  } catch (err: any) {
    logger.error({ err }, "Admin mark exchange delivered failed");
    res.status(400).json({ error: err?.message || "Failed to mark exchange as delivered" });
  }
});

/**
 * POST /api/admin/returns/:id/cancel
 * Admin cancels a return or exchange request.
 */
router.post("/admin/returns/:id/cancel", requireAdminKey, async (req: Request, res: Response) => {
  try {
    const { reason } = req.body || {};
    const updated = await returnsService.cancelReturnRequest(req.params.id, {
      isAdmin: true,
      reason: reason || "Cancelled by admin",
    });
    res.json({ success: true, return: updated });
  } catch (err: any) {
    logger.error({ err }, "Admin cancel return request failed");
    res.status(400).json({ error: err?.message || "Failed to cancel return request" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. SELLER PORTAL ENDPOINTS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/seller/returns
 * Lists returns strictly scoped to items belonging to the authenticated vendor.
 */
router.get("/seller/returns", requireVendorAuth, async (req: any, res: Response) => {
  try {
    const vendorId = req.vendorId;
    const returns = await returnsService.getSellerReturns(vendorId);
    res.json({ returns });
  } catch (err: any) {
    logger.error({ err }, "Failed to fetch seller returns");
    res.status(500).json({ error: err?.message || "Failed to fetch seller returns" });
  }
});

/**
 * GET /api/seller/returns/:id
 * Seller inspects single return claim for their product.
 */
router.get("/seller/returns/:id", requireVendorAuth, async (req: any, res: Response) => {
  try {
    const vendorId = req.vendorId;
    const ret = await returnsService.getReturnById(req.params.id, { vendorId });
    if (!ret) return res.status(404).json({ error: "Return claim not found" });
    res.json({ return: ret });
  } catch (err: any) {
    res.status(403).json({ error: err?.message || "Unauthorized" });
  }
});

/**
 * POST /api/seller/returns/:id/review
 * Seller reviews return request for their product.
 */
router.post("/seller/returns/:id/review", requireVendorAuth, async (req: any, res: Response) => {
  try {
    const vendorId = req.vendorId;
    const { decision, reviewNotes, rejectionReason } = req.body;

    const ret = await returnsService.getReturnById(req.params.id, { vendorId });
    if (!ret) return res.status(404).json({ error: "Return claim not found" });

    const updated = await returnsService.reviewReturnRequest({
      returnId: req.params.id,
      actor: "seller",
      actorId: vendorId,
      decision,
      reviewNotes,
      rejectionReason,
    });

    res.json({ success: true, return: updated });
  } catch (err: any) {
    res.status(400).json({ error: err?.message || "Seller review failed" });
  }
});

/**
 * POST /api/seller/returns/:id/receive
 * Seller marks returned package received at workshop/warehouse.
 */
router.post("/seller/returns/:id/receive", requireVendorAuth, async (req: any, res: Response) => {
  try {
    const vendorId = req.vendorId;
    const ret = await returnsService.getReturnById(req.params.id, { vendorId });
    if (!ret) return res.status(404).json({ error: "Return claim not found" });

    const updated = await returnsService.updatePickupTracking(
      req.params.id,
      "RECEIVED",
      ret.vendorName || "Seller Hub",
      "Package delivered and received at artisan workshop. Ready for Quality Inspection."
    );

    res.json({ success: true, return: updated });
  } catch (err: any) {
    res.status(400).json({ error: err?.message || "Receipt confirmation failed" });
  }
});

/**
 * POST /api/seller/returns/:id/qc
 * Seller conducts physical Quality Check on returned item.
 */
router.post("/seller/returns/:id/qc", requireVendorAuth, async (req: any, res: Response) => {
  try {
    const vendorId = req.vendorId;
    const ret = await returnsService.getReturnById(req.params.id, { vendorId });
    if (!ret) return res.status(404).json({ error: "Return claim not found" });

    const {
      conditionPass,
      defectVerified,
      originalTagsPresent,
      packagingIntact,
      qcNotes = "",
      qcPhotos,
    } = req.body;

    const updated = await returnsService.submitQualityCheck({
      returnId: req.params.id,
      inspector: "seller",
      inspectorName: ret.vendorName || vendorId,
      conditionPass: Boolean(conditionPass),
      defectVerified: Boolean(defectVerified),
      originalTagsPresent: Boolean(originalTagsPresent),
      packagingIntact: Boolean(packagingIntact),
      qcNotes: String(qcNotes),
      qcPhotos: Array.isArray(qcPhotos) ? qcPhotos : [],
    });

    res.json({ success: true, return: updated });
  } catch (err: any) {
    res.status(400).json({ error: err?.message || "Quality check failed" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. WEBHOOKS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /api/webhooks/returns/shipping
 * Reverse courier tracking webhook (Shiprocket / logistics carrier).
 */
router.post("/webhooks/returns/shipping", async (req: Request, res: Response) => {
  try {
    const { awb, current_status, location, notes } = req.body || {};
    if (!awb) {
      return res.status(400).json({ error: "awb number is required" });
    }

    const { getCollection } = await import("@workspace/db");
    const col = getCollection("returns");
    const ret: any = await col.findOne({ "pickupDetails.awbNumber": String(awb).trim() });

    if (!ret) {
      return res.status(200).json({ received: true, matched: false });
    }

    const statusNorm = String(current_status || "").toUpperCase();
    let mappedEvent: "PICKUP_COMPLETED" | "IN_TRANSIT" | "RECEIVED" | "PICKUP_FAILED" = "IN_TRANSIT";

    if (statusNorm.includes("PICKED") || statusNorm.includes("COLLECTED")) {
      mappedEvent = "PICKUP_COMPLETED";
    } else if (statusNorm.includes("DELIVERED") || statusNorm.includes("RTO_DELIVERED")) {
      mappedEvent = "RECEIVED";
    } else if (statusNorm.includes("CANCEL") || statusNorm.includes("FAILED")) {
      mappedEvent = "PICKUP_FAILED";
    }

    await returnsService.updatePickupTracking(ret.id, mappedEvent, location, notes);
    res.json({ received: true, mappedEvent });
  } catch (err: any) {
    logger.error({ err }, "Error processing reverse shipping webhook");
    res.status(500).json({ error: "Webhook processing error" });
  }
});

/**
 * POST /api/webhooks/returns/refund
 * Cashfree refund status verification webhook.
 */
router.post("/webhooks/returns/refund", async (req: Request, res: Response) => {
  try {
    const rawBody = (req as any).rawBody || JSON.stringify(req.body);
    const signature = (req.headers["x-webhook-signature"] as string) || "";
    const timestamp = (req.headers["x-webhook-timestamp"] as string) || "";

    const verified = await verifyCashfreeWebhookSignature({
      rawBody: typeof rawBody === "string" ? rawBody : rawBody.toString("utf-8"),
      signature,
      timestamp,
    });

    if (!verified && process.env.NODE_ENV === "production") {
      return res.status(401).json({ error: "Invalid webhook signature" });
    }

    const event = req.body?.type;
    const refundData = req.body?.data?.refund;

    if (refundData?.refund_id) {
      const { getCollection, mongoOrders } = await import("@workspace/db");
      const col = getCollection("returns");
      const ret: any = await col.findOne({
        $or: [
          { "refundDetails.refundId": refundData.refund_id },
          { "refundDetails.cfRefundId": String(refundData.cf_refund_id) },
        ],
      });

      if (ret) {
        const isSuccess = String(refundData.refund_status).toUpperCase() === "SUCCESS";
        const now = new Date();
        const history = Array.isArray(ret.statusHistory) ? [...ret.statusHistory] : [];

        if (isSuccess) {
          history.push({
            status: "REFUNDED",
            timestamp: now.toISOString(),
            actor: "system",
            note: `Payment gateway confirmed refund of ₹${refundData.refund_amount} (Reference: ${refundData.cf_refund_id || refundData.refund_id}).`,
          });

          await col.updateOne(
            { id: ret.id },
            {
              $set: {
                status: "REFUNDED",
                "refundDetails.refundStatus": "SUCCESS",
                "refundDetails.cfRefundId": String(refundData.cf_refund_id),
                statusHistory: history,
                updatedAt: now,
              },
            }
          );

          try {
            await mongoOrders.update(ret.orderId, {
              refundStatus: "processed",
              refundProcessedAt: now,
              refundReference: String(refundData.cf_refund_id || refundData.refund_id),
              updatedAt: now,
            });
          } catch {}
        }
      }
    }

    res.json({ received: true });
  } catch (err: any) {
    logger.error({ err }, "Error processing refund webhook");
    res.status(500).json({ error: "Refund webhook error" });
  }
});

export default router;
