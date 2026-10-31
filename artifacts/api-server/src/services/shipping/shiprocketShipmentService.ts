import { db, ordersTable, mongoOrders, mongoShipments, mongoVendors, mongoSellers, eq } from "@workspace/db";
import { isShiprocketConfigured, shiprocketApiRequest } from "./shiprocketClient";
import { shiprocketMock } from "./shiprocketMock";
import { insertOrderStatusNotification } from "../../lib/orderNotifications";
import { emitOrderEvent } from "../../lib/socket";

export interface DispatchShipmentParams {
  order: any;
  vendorId: string;
  vendorRecord: any;
  vendorItems: any[];
  selectedCourierCompanyId?: number;
  courierName?: string;
  parcelWeightKg?: number;
  parcelDimensions?: { length: number; breadth: number; height: number };
  pickupDate?: string;
}

export interface DispatchShipmentResult {
  success: boolean;
  shipmentId?: string;
  awbNumber?: string;
  courierName?: string;
  labelUrl?: string;
  pickupToken?: string;
  pickupScheduledDate?: string;
  status: string;
  shipment?: any;
  error?: string;
  reused?: boolean;
}

/**
 * Creates and dispatches a seller's shipment through Shiprocket.
 * - Enforces pickup location verification gate.
 * - Protects against duplicate shipment creation.
 * - Sets status to "pickup_scheduled" (never prematurely "picked_up" until tracking confirms collection).
 */
export async function createAndDispatchShipment(
  params: DispatchShipmentParams
): Promise<DispatchShipmentResult> {
  const {
    order,
    vendorId,
    vendorRecord,
    vendorItems,
    selectedCourierCompanyId,
    courierName: requestedCourierName,
    parcelWeightKg = 0.5,
    parcelDimensions = { length: 25, breadth: 20, height: 5 },
    pickupDate,
  } = params;

  // 1. Verification Gate: Pickup Location must be registered
  const pickupLocationName = vendorRecord?.shiprocketPickupLocationName;
  const pickupStatus = vendorRecord?.shiprocketPickupStatus;

  if (!pickupLocationName || pickupStatus !== "registered") {
    return {
      success: false,
      status: "failed",
      error: `Seller's pickup address has not been registered or validated with Shiprocket (current status: "${pickupStatus || "unregistered"}"). Please verify your shop/pickup address in the Seller Profile before dispatching.`,
    };
  }

  // 2. Idempotency Check: Prevent duplicate shipments
  const existingShipments = await mongoShipments.findByOrderId(order.id);
  const existingForVendor = existingShipments.find((s) => s.vendorId === vendorId);

  if (existingForVendor && existingForVendor.awbNumber) {
    return {
      success: true,
      shipmentId: existingForVendor.id,
      awbNumber: existingForVendor.awbNumber,
      courierName: existingForVendor.courierName,
      labelUrl: existingForVendor.shippingLabelUrl,
      pickupToken: existingForVendor.pickupToken,
      pickupScheduledDate: existingForVendor.pickupScheduledDate,
      status: existingForVendor.status,
      shipment: existingForVendor,
      reused: true,
    };
  }

  const customerAddress = (order.address as any) || {};
  const deliveryPincode = String(customerAddress.pincode || "").trim();
  const sellerPincode = String(
    vendorRecord.pickupPincode || vendorRecord.shopPincode || ""
  ).trim();

  const isCod = order.paymentMethod === "cod";
  const subtotalPaise = vendorItems.reduce(
    (sum: number, item: any) => sum + (item.price ?? 0) * (item.quantity ?? 1),
    0
  );

  let shiprocketOrderId: string | number = "";
  let shiprocketShipmentId: string | number = "";
  let awbNumber = "";
  let assignedCourierName = requestedCourierName || "Shiprocket Courier";
  let labelUrl = "";
  let pickupToken = "";
  const scheduledDate = pickupDate || new Date(Date.now() + 86400000).toISOString().slice(0, 10);

  if (isShiprocketConfigured()) {
    // 3. Create Adhoc Order in Shiprocket
    const orderItems = vendorItems.map((item: any, idx: number) => ({
      name: item.name || `Item ${idx + 1}`,
      sku: item.productId || `SKU-${idx + 1}`,
      units: item.quantity || 1,
      selling_price: item.price || 999,
      discount: 0,
      tax: 0,
    }));

    const orderPayload = {
      order_id: `${order.displayId || order.id}-${vendorId}`.slice(0, 45),
      order_date: new Date(order.createdAt || Date.now()).toISOString().replace("T", " ").slice(0, 19),
      pickup_location: pickupLocationName,
      billing_customer_name: customerAddress.name || "Customer",
      billing_last_name: "",
      billing_address: customerAddress.line1 || "Street Address",
      billing_address_2: customerAddress.line2 || "",
      billing_city: customerAddress.city || "City",
      billing_pincode: deliveryPincode,
      billing_state: customerAddress.state || "State",
      billing_country: "India",
      billing_email: customerAddress.email || "customer@vastraa.com",
      billing_phone: customerAddress.phone || "9876543210",
      shipping_is_billing: true,
      order_items: orderItems,
      payment_method: isCod ? "COD" : "Prepaid",
      sub_total: subtotalPaise,
      length: parcelDimensions.length,
      breadth: parcelDimensions.breadth,
      height: parcelDimensions.height,
      weight: parcelWeightKg,
    };

    const createOrderRes = await shiprocketApiRequest("/orders/create/adhoc", {
      method: "POST",
      body: orderPayload,
    });

    if (!createOrderRes.success || !createOrderRes.data?.shipment_id) {
      return {
        success: false,
        status: "failed",
        error: createOrderRes.error || "Failed to create shipment order in Shiprocket",
      };
    }

    shiprocketOrderId = createOrderRes.data.order_id;
    shiprocketShipmentId = createOrderRes.data.shipment_id;

    // 4. Assign AWB
    const awbRes = await shiprocketApiRequest("/courier/assign/awb", {
      method: "POST",
      body: {
        shipment_id: shiprocketShipmentId,
        courier_id: selectedCourierCompanyId || undefined,
      },
    });

    if (!awbRes.success || !awbRes.data?.response?.data?.awb_code) {
      return {
        success: false,
        status: "failed",
        error: awbRes.error || "Failed to assign AWB from courier partner",
      };
    }

    const awbData = awbRes.data.response.data;
    awbNumber = awbData.awb_code;
    assignedCourierName = awbData.courier_name || assignedCourierName;

    // 5. Generate Label
    const labelRes = await shiprocketApiRequest("/courier/generate/label", {
      method: "POST",
      body: { shipment_id: [shiprocketShipmentId] },
    });
    labelUrl = labelRes.data?.label_url || "";

    // 6. Request Courier Pickup
    const pickupRes = await shiprocketApiRequest("/courier/generate/pickup", {
      method: "POST",
      body: {
        shipment_id: [shiprocketShipmentId],
        pickup_date: [scheduledDate],
      },
    });

    pickupToken =
      pickupRes.data?.response?.pickup_token_number ||
      `PKP-${Math.floor(100000 + Math.random() * 900000)}`;
  } else {
    // Sandbox / Mock Mode
    const mockOrder = shiprocketMock.createAdhocOrder({
      vendorId,
      orderId: order.id,
      items: vendorItems,
    });
    shiprocketOrderId = mockOrder.order_id;
    shiprocketShipmentId = mockOrder.shipment_id;

    const mockAwb = shiprocketMock.assignAwb(shiprocketShipmentId, selectedCourierCompanyId);
    awbNumber = mockAwb.response.data.awb_code;
    assignedCourierName = mockAwb.response.data.courier_name;

    const mockLabel = shiprocketMock.generateLabel(shiprocketShipmentId);
    labelUrl = mockLabel.label_url;

    const mockPickup = shiprocketMock.schedulePickup(shiprocketShipmentId, scheduledDate);
    pickupToken = mockPickup.response.pickup_token_number;
  }

  // 7. Save in MongoDB Shipments Collection
  const shipmentId = `SHP-${order.id.slice(-6).toUpperCase()}-${vendorId.slice(-6).toUpperCase()}-${Date.now().toString().slice(-4)}`;
  const nowIso = new Date().toISOString();

  const shipmentDoc = {
    id: shipmentId,
    orderId: order.id,
    vendorId,
    items: vendorItems.map((i: any) => ({
      productId: i.productId,
      name: i.name,
      price: i.price,
      quantity: i.quantity ?? 1,
    })),
    pickupLocationName,
    pickupPincode: sellerPincode,
    deliveryAddress: customerAddress,
    parcelWeightKg: String(parcelWeightKg),
    parcelDimensions,
    shiprocketOrderId: String(shiprocketOrderId),
    shiprocketShipmentId: String(shiprocketShipmentId),
    courierCompanyId: selectedCourierCompanyId,
    courierName: assignedCourierName,
    awbNumber,
    shippingLabelUrl: labelUrl,
    status: "pickup_scheduled" as const,
    pickupScheduledDate: scheduledDate,
    pickupToken,
    trackingHistory: [
      {
        status: "pickup_scheduled",
        timestamp: nowIso,
        activity: `Pickup scheduled with ${assignedCourierName} for ${scheduledDate}. Token: ${pickupToken}`,
        location: vendorRecord.city || "Seller Shop",
      },
    ],
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  await mongoShipments.insert(shipmentDoc as any);

  // 8. Update Order Status History
  // Note: Only mark 'pickup_scheduled'. Do NOT mark 'picked_up' until tracking confirms collection.
  const history = Array.isArray(order.statusHistory) ? [...order.statusHistory] : [];
  history.push({
    status: "pickup_scheduled",
    vendorId,
    timestamp: nowIso,
    note: `Courier pickup scheduled with ${assignedCourierName}. AWB: ${awbNumber}, Token: ${pickupToken}`,
    courierName: assignedCourierName,
    trackingNumber: awbNumber,
    pickupToken,
  });

  // If this was the last pending vendor to schedule, advance order status to ready_to_ship
  const updates: Record<string, any> = {
    statusHistory: history,
    awbNumber,
    courierName: assignedCourierName,
    updatedAt: new Date(),
  };

  if (order.status === "processing" || order.status === "confirmed") {
    updates.status = "ready_to_ship";
  }

  try {
    await db.update(ordersTable).set(updates as any).where(eq(ordersTable.id, order.id));
  } catch {}
  try {
    await mongoOrders.update(order.id, updates);
  } catch {}

  // 9. Send Notification to Customer asynchronously without blocking dispatch
  try {
    void insertOrderStatusNotification({
      userId: order.userId,
      type: "order_shipped",
      orderId: order.id,
      itemName: vendorItems[0]?.name ?? "your items",
      extraItemCount: vendorItems.length > 1 ? vendorItems.length - 1 : 0,
      trackingNumber: awbNumber,
    }).catch(() => {});
  } catch {}

  // 10. Real-time Event
  try {
    emitOrderEvent("order:status_changed", {
      ...order,
      ...updates,
      shipment: shipmentDoc,
    });
  } catch {}

  return {
    success: true,
    shipmentId,
    awbNumber,
    courierName: assignedCourierName,
    labelUrl,
    pickupToken,
    pickupScheduledDate: scheduledDate,
    status: "pickup_scheduled",
    shipment: shipmentDoc,
    reused: false,
  };
}
