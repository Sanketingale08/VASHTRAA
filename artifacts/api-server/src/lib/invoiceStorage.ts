import { mongoGeneric, isMongoDbConnected } from "@workspace/db";
import { type InvoiceCalculatedResult, buildInvoiceData, buildMasterOrderSummary } from "./invoiceData";
import { logger } from "./logger";

export interface StoredInvoiceSnapshot {
  id: string; // e.g. "INV-V225", "INV-V225-V1", "MOS-V225", "CN-V225"
  invoiceNumber: string;
  documentType: "tax_invoice" | "master_order_summary" | "bill_of_supply" | "credit_note";
  documentTitle: string; // "TAX INVOICE", "MASTER ORDER SUMMARY", "CREDIT NOTE"
  orderId: string;
  masterOrderId?: string | null;
  sellerSuborderId?: string | null;
  displayOrderId: string;
  sellerId: string | null; // null for master order summary
  sellerName: string | null;
  customerId: string;
  customerEmail?: string | null;
  customerName: string;
  paymentMethod: string;
  paymentStatus: string;
  gatewayReference?: string | null;
  refundReference?: string | null;
  originalInvoiceNumber?: string | null;
  originalInvoiceDate?: string | null;
  financials: {
    gross: number;
    discount: number;
    taxable: number;
    cgst: number;
    sgst: number;
    igst: number;
    platformFee: number;
    shippingFee: number;
    grandTotal: number;
  };
  invoiceData: InvoiceCalculatedResult;
  pdfFilename: string;
  pdfUrl?: string | null;
  status: "issued" | "cancelled" | "refunded" | "adjusted";
  issuedAt: string;
  createdAt: string;
  updatedAt: string;
}

// In-memory fallback map ensuring resilience
const inMemoryInvoicesMap = new Map<string, StoredInvoiceSnapshot>();

function getInvoicesCollection() {
  return mongoGeneric.getCollection<StoredInvoiceSnapshot>("invoices");
}

/**
 * Finds a stored invoice snapshot by orderId, sellerId, and documentType.
 */
export async function findStoredInvoice(
  orderId: string,
  sellerId?: string | null,
  documentType?: string
): Promise<StoredInvoiceSnapshot | null> {
  if (!orderId) return null;

  if (isMongoDbConnected()) {
    try {
      const col = getInvoicesCollection();
      const filter: any = {
        $or: [{ orderId }, { displayOrderId: orderId }],
      };
      if (sellerId !== undefined) {
        filter.sellerId = sellerId;
      }
      if (documentType) {
        filter.documentType = documentType;
      }

      const doc = await col.findOne(filter);
      if (doc) {
        inMemoryInvoicesMap.set(doc.id, doc);
        return doc;
      }
    } catch (err) {
      logger.warn({ err, orderId }, "Failed to find invoice from MongoDB, falling back to cache");
    }
  }

  // Fallback to in-memory store
  for (const inv of inMemoryInvoicesMap.values()) {
    if (inv.orderId === orderId || inv.displayOrderId === orderId) {
      if (sellerId !== undefined && inv.sellerId !== sellerId) continue;
      if (documentType && inv.documentType !== documentType) continue;
      return inv;
    }
  }

  return null;
}

/**
 * Persists an immutable invoice snapshot into MongoDB.
 */
export async function saveInvoiceSnapshot(
  snapshot: StoredInvoiceSnapshot
): Promise<StoredInvoiceSnapshot> {
  inMemoryInvoicesMap.set(snapshot.id, snapshot);

  if (isMongoDbConnected()) {
    try {
      const col = getInvoicesCollection();
      const { createdAt, ...setFields } = snapshot;
      await col.updateOne(
        { id: snapshot.id },
        {
          $set: {
            ...setFields,
            updatedAt: new Date().toISOString(),
          },
          $setOnInsert: {
            createdAt: createdAt || new Date().toISOString(),
          },
        },
        { upsert: true }
      );
    } catch (err) {
      logger.error({ err, invoiceId: snapshot.id }, "Failed to persist invoice snapshot to MongoDB");
    }
  }

  return snapshot;
}

/**
 * Lists all invoices for a given order, scoped by caller role and seller ownership.
 */
export async function listInvoicesForOrder(
  orderId: string,
  caller?: { role?: string; vendorId?: string; userId?: string }
): Promise<StoredInvoiceSnapshot[]> {
  let list: StoredInvoiceSnapshot[] = [];

  if (isMongoDbConnected()) {
    try {
      const col = getInvoicesCollection();
      list = await col
        .find({ $or: [{ orderId }, { displayOrderId: orderId }] })
        .sort({ issuedAt: 1 })
        .toArray();
    } catch (err) {
      logger.warn({ err, orderId }, "Failed to list invoices from MongoDB, using cache");
    }
  }

  if (list.length === 0) {
    for (const inv of inMemoryInvoicesMap.values()) {
      if (inv.orderId === orderId || inv.displayOrderId === orderId) {
        list.push(inv);
      }
    }
  }

  // Enforce role-based isolation
  if (caller?.role === "vendor" || caller?.vendorId) {
    const vId = caller.vendorId;
    return list.filter((inv) => inv.sellerId && String(inv.sellerId) === String(vId));
  }

  return list;
}

/**
 * Creates or retrieves a Credit Note snapshot for an order that has been refunded or cancelled.
 */
export async function getOrCreateCreditNoteSnapshot(
  order: any,
  originalInvoice: StoredInvoiceSnapshot,
  refundDetails: { amount: number; refundReference?: string; reason?: string }
): Promise<StoredInvoiceSnapshot> {
  const orderRef = order.displayId || order.id || "V225";
  const cnNumber = `CN-${orderRef}`;

  const existing = await findStoredInvoice(order.id, originalInvoice.sellerId, "credit_note");
  if (existing) {
    return existing;
  }

  const now = new Date().toISOString();
  const cnInvoiceData: InvoiceCalculatedResult = JSON.parse(JSON.stringify(originalInvoice.invoiceData));

  // Update labels for Credit Note
  cnInvoiceData.invoice.number = cnNumber;
  cnInvoiceData.bos.number = `BOS-${cnNumber}`;
  (cnInvoiceData as any).document_title = "CREDIT NOTE";
  (cnInvoiceData as any).document_number_label = "Credit Note Number";
  (cnInvoiceData as any).bos_title = "CREDIT ADJUSTMENT SUMMARY";
  (cnInvoiceData.order as any).original_invoice_no = originalInvoice.invoiceNumber;
  (cnInvoiceData.order as any).original_invoice_date = originalInvoice.issuedAt;
  (cnInvoiceData.order as any).payment_status = "REFUNDED";
  (cnInvoiceData.order as any).refund_ref = refundDetails.refundReference || order.refundReference || "REF-AUTO";

  const snapshot: StoredInvoiceSnapshot = {
    id: cnNumber,
    invoiceNumber: cnNumber,
    documentType: "credit_note",
    documentTitle: "CREDIT NOTE",
    orderId: String(order.id),
    displayOrderId: String(orderRef),
    sellerId: originalInvoice.sellerId,
    sellerName: originalInvoice.sellerName,
    customerId: String(order.userId || "customer"),
    customerEmail: (order.address as any)?.email || null,
    customerName: originalInvoice.customerName,
    paymentMethod: String(order.paymentMethod || "UPI").toUpperCase(),
    paymentStatus: "REFUNDED",
    gatewayReference: order.cashfreePaymentId || null,
    refundReference: refundDetails.refundReference || order.refundReference || null,
    originalInvoiceNumber: originalInvoice.invoiceNumber,
    originalInvoiceDate: originalInvoice.issuedAt,
    financials: {
      ...originalInvoice.financials,
      grandTotal: refundDetails.amount || originalInvoice.financials.grandTotal,
    },
    invoiceData: cnInvoiceData,
    pdfFilename: `CreditNote-${cnNumber}.pdf`,
    pdfUrl: `/api/orders/${order.id}/invoice?documentType=credit_note`,
    status: "refunded",
    issuedAt: now,
    createdAt: now,
    updatedAt: now,
  };

  await saveInvoiceSnapshot(snapshot);
  return snapshot;
}

/**
 * Automatically generates and permanently stores the official invoice snapshots
 * (Master Order Summary and Seller Tax Invoices) for an order using the standardized template.
 * Idempotent: safe against retries, double-clicks, and page refreshes.
 */
export async function ensureOrderInvoicesGenerated(order: any): Promise<StoredInvoiceSnapshot[]> {
  if (!order || !order.id) return [];

  // Parse items safely
  let orderItems: any[] = [];
  if (Array.isArray(order.items)) {
    orderItems = order.items;
  } else if (typeof order.items === "string") {
    try {
      orderItems = JSON.parse(order.items);
    } catch {}
  }

  // Determine unique vendors
  const vendorMap = new Map<string, string>();
  for (const it of orderItems) {
    const vid = it.vendorId || it.sellerId || "default";
    const vname = it.vendorName || it.sellerName || "VASTRAA Artisan";
    vendorMap.set(String(vid), vname);
  }
  const isMultiVendor = vendorMap.size > 1;

  const results: StoredInvoiceSnapshot[] = [];

  if (isMultiVendor) {
    // 1. Master Order Summary
    let mosSnapshot = await findStoredInvoice(order.id, null, "master_order_summary");
    if (!mosSnapshot) {
      const mosData = await buildMasterOrderSummary(order);
      mosSnapshot = {
        id: mosData.invoice.number,
        invoiceNumber: mosData.invoice.number,
        documentType: "master_order_summary",
        documentTitle: "MASTER ORDER SUMMARY",
        orderId: String(order.id),
        masterOrderId: String(order.id),
        sellerSuborderId: null,
        displayOrderId: String(order.displayId || order.id),
        sellerId: null,
        sellerName: "VASTRAA Marketplace",
        customerId: String(order.userId || "customer"),
        customerEmail: (order.address as any)?.email || null,
        customerName: mosData.customer?.bill_to?.name || "Customer",
        paymentMethod: String(order.paymentMethod || "COD").toUpperCase(),
        paymentStatus: (mosData.order as any)?.payment_status || (String(order.paymentStatus || "").toLowerCase() === "paid" ? "PAID" : "PENDING"),
        gatewayReference: (mosData.order as any)?.gateway_ref || order.cashfreePaymentId || null,
        refundReference: null,
        financials: {
          gross: mosData.totals.items_subtotal,
          discount: mosData.totals.discount,
          taxable: mosData.totals.taxable,
          cgst: mosData.totals.cgst,
          sgst: mosData.totals.sgst,
          igst: mosData.totals.igst,
          platformFee: 0,
          shippingFee: mosData.totals.charges,
          grandTotal: mosData.totals.grand,
        },
        invoiceData: mosData,
        pdfFilename: `Summary-${mosData.invoice.number}.pdf`,
        pdfUrl: `/api/orders/${order.id}/invoice?documentType=master_order_summary`,
        status: "issued",
        issuedAt: mosData.invoice.date || new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await saveInvoiceSnapshot(mosSnapshot);
    }
    results.push(mosSnapshot);

    // 2. Separate seller-specific invoices
    for (const [vId, vName] of vendorMap.entries()) {
      let invSnapshot = await findStoredInvoice(order.id, vId, "tax_invoice");
      if (!invSnapshot) {
        const invData = await buildInvoiceData(order, vId, undefined, "tax_invoice");
        invSnapshot = {
          id: invData.invoice.number,
          invoiceNumber: invData.invoice.number,
          documentType: "tax_invoice",
          documentTitle: "TAX INVOICE",
          orderId: String(order.id),
          masterOrderId: String(order.id),
          sellerSuborderId: `${order.id}-${vId}`,
          displayOrderId: String(order.displayId || order.id),
          sellerId: vId,
          sellerName: invData.seller?.legal_name || invData.seller?.trade_name || vName,
          customerId: String(order.userId || "customer"),
          customerEmail: (order.address as any)?.email || null,
          customerName: invData.customer?.bill_to?.name || "Customer",
          paymentMethod: String(order.paymentMethod || "COD").toUpperCase(),
          paymentStatus: (invData.order as any)?.payment_status || (String(order.paymentStatus || "").toLowerCase() === "paid" ? "PAID" : "PENDING"),
          gatewayReference: (invData.order as any)?.gateway_ref || order.cashfreePaymentId || null,
          refundReference: null,
          financials: {
            gross: invData.totals.items_subtotal,
            discount: invData.totals.discount,
            taxable: invData.totals.taxable,
            cgst: invData.totals.cgst,
            sgst: invData.totals.sgst,
            igst: invData.totals.igst,
            platformFee: 0,
            shippingFee: invData.totals.charges,
            grandTotal: invData.totals.grand,
          },
          invoiceData: invData,
          pdfFilename: `Invoice-${invData.invoice.number}.pdf`,
          pdfUrl: `/api/orders/${order.id}/invoice?vendorId=${vId}`,
          status: "issued",
          issuedAt: invData.invoice.date || new Date().toISOString(),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        await saveInvoiceSnapshot(invSnapshot);
      }
      results.push(invSnapshot);
    }
  } else {
    // Single vendor order -> Tax Invoice
    const singleVendorId = vendorMap.keys().next().value || null;
    let invSnapshot = await findStoredInvoice(order.id, null, "tax_invoice");
    if (!invSnapshot && singleVendorId) {
      invSnapshot = await findStoredInvoice(order.id, singleVendorId, "tax_invoice");
    }
    if (!invSnapshot) {
      const invData = await buildInvoiceData(order, undefined, undefined, "tax_invoice");
      invSnapshot = {
        id: invData.invoice.number,
        invoiceNumber: invData.invoice.number,
        documentType: "tax_invoice",
        documentTitle: "TAX INVOICE",
        orderId: String(order.id),
        masterOrderId: String(order.id),
        sellerSuborderId: String(order.id),
        displayOrderId: String(order.displayId || order.id),
        sellerId: singleVendorId,
        sellerName: invData.seller?.legal_name || invData.seller?.trade_name || "VASTRAA Artisan",
        customerId: String(order.userId || "customer"),
        customerEmail: (order.address as any)?.email || null,
        customerName: invData.customer?.bill_to?.name || "Customer",
        paymentMethod: String(order.paymentMethod || "COD").toUpperCase(),
        paymentStatus: (invData.order as any)?.payment_status || (String(order.paymentStatus || "").toLowerCase() === "paid" ? "PAID" : "PENDING"),
        gatewayReference: (invData.order as any)?.gateway_ref || order.cashfreePaymentId || null,
        refundReference: null,
        financials: {
          gross: invData.totals.items_subtotal,
          discount: invData.totals.discount,
          taxable: invData.totals.taxable,
          cgst: invData.totals.cgst,
          sgst: invData.totals.sgst,
          igst: invData.totals.igst,
          platformFee: 0,
          shippingFee: invData.totals.charges,
          grandTotal: invData.totals.grand,
        },
        invoiceData: invData,
        pdfFilename: `Invoice-${invData.invoice.number}.pdf`,
        pdfUrl: `/api/orders/${order.id}/invoice`,
        status: "issued",
        issuedAt: invData.invoice.date || new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await saveInvoiceSnapshot(invSnapshot);
    }
    results.push(invSnapshot);
  }

  // Sync primary invoice reference back to orders collection
  const primarySnapshot = results[0];
  if (primarySnapshot) {
    try {
      const { mongoOrders } = await import("@workspace/db");
      await mongoOrders.update(order.id, {
        invoiceNumber: primarySnapshot.invoiceNumber,
        invoiceUrl: `/api/orders/${order.id}/invoice`,
      });
    } catch (err) {
      logger.warn({ err, orderId: order.id }, "Failed to sync primary invoice to order");
    }
  }

  return results;
}

