import { mongoVendors, mongoSellers, mongoProducts } from "@workspace/db";

// ============================================================================
// CONFIGURATION & OPEN ITEMS
// ============================================================================
export const INVOICE_CONFIG = {
  company: {
    name: process.env.VASTRAA_COMPANY_NAME || "VASTRAA",
    legalName: process.env.VASTRAA_COMPANY_LEGAL_NAME || "Vastraa",
    gstin: process.env.VASTRAA_COMPANY_GSTIN || "27AACCT1234A1Z5",
    pan: process.env.VASTRAA_COMPANY_PAN || "AACCT1234A",
    address: process.env.VASTRAA_COMPANY_ADDRESS || "Add Vastraa registered address here",
    phone: process.env.VASTRAA_COMPANY_PHONE || "",
    email: process.env.VASTRAA_COMPANY_EMAIL || "support@vastraa.com",
    website: process.env.VASTRAA_COMPANY_WEBSITE || "www.vastraa.com",
  },
  // Open items left as config (confirm with CA):
  sac: {
    platformFee: process.env.VASTRAA_SAC_PLATFORM_FEE || "998599",
    shippingFee: process.env.VASTRAA_SAC_SHIPPING_FEE || "996511",
  },
  fees: {
    platformFeeAmount: Number(process.env.VASTRAA_PLATFORM_FEE_AMOUNT ?? 20.0),
    platformFeeGstRate: Number(process.env.VASTRAA_PLATFORM_FEE_GST_RATE ?? 0.0),
    shippingGstRate: Number(process.env.VASTRAA_SHIPPING_GST_RATE ?? 0.0),
  },
  policy: {
    returns:
      process.env.VASTRAA_RETURNS_POLICY ||
      "At Vastraa we try to deliver perfectly each and every time. But in the off-chance that you need to return the item, please do so with the original packing, tags and invoice, without which it will be really difficult for us to act on your request. Terms and conditions apply.",
  },
  defaultTemplate: process.env.INVOICE_DEFAULT_TEMPLATE || "vastraa-v2",
};

// ============================================================================
// INDIAN STATE GST & ISO CODE DICTIONARY
// ============================================================================
export interface StateCodeInfo {
  name: string;
  code: string; // 2-digit GST state code (e.g. "27")
  iso: string;  // ISO 3166-2:IN code (e.g. "IN-MH")
}

export const INDIAN_STATES: Record<string, StateCodeInfo> = {
  maharashtra: { name: "Maharashtra", code: "27", iso: "IN-MH" },
  karnataka: { name: "Karnataka", code: "29", iso: "IN-KA" },
  delhi: { name: "Delhi", code: "07", iso: "IN-DL" },
  gujarat: { name: "Gujarat", code: "24", iso: "IN-GJ" },
  rajasthan: { name: "Rajasthan", code: "08", iso: "IN-RJ" },
  "uttar pradesh": { name: "Uttar Pradesh", code: "09", iso: "IN-UP" },
  "tamil nadu": { name: "Tamil Nadu", code: "33", iso: "IN-TN" },
  "west bengal": { name: "West Bengal", code: "19", iso: "IN-WB" },
  telangana: { name: "Telangana", code: "36", iso: "IN-TG" },
  "andhra pradesh": { name: "Andhra Pradesh", code: "37", iso: "IN-AP" },
  "madhya pradesh": { name: "Madhya Pradesh", code: "23", iso: "IN-MP" },
  kerala: { name: "Kerala", code: "32", iso: "IN-KL" },
  punjab: { name: "Punjab", code: "03", iso: "IN-PB" },
  haryana: { name: "Haryana", code: "06", iso: "IN-HR" },
  bihar: { name: "Bihar", code: "10", iso: "IN-BR" },
  odisha: { name: "Odisha", code: "21", iso: "IN-OD" },
  orissa: { name: "Odisha", code: "21", iso: "IN-OD" },
  assam: { name: "Assam", code: "18", iso: "IN-AS" },
  goa: { name: "Goa", code: "30", iso: "IN-GA" },
  jharkhand: { name: "Jharkhand", code: "20", iso: "IN-JH" },
  chhattisgarh: { name: "Chhattisgarh", code: "22", iso: "IN-CG" },
  uttarakhand: { name: "Uttarakhand", code: "05", iso: "IN-UK" },
  "himachal pradesh": { name: "Himachal Pradesh", code: "02", iso: "IN-HP" },
  "jammu and kashmir": { name: "Jammu and Kashmir", code: "01", iso: "IN-JK" },
  chandigarh: { name: "Chandigarh", code: "04", iso: "IN-CH" },
  puducherry: { name: "Puducherry", code: "34", iso: "IN-PY" },
  tripura: { name: "Tripura", code: "16", iso: "IN-TR" },
  meghalaya: { name: "Meghalaya", code: "17", iso: "IN-ML" },
  manipur: { name: "Manipur", code: "14", iso: "IN-MN" },
  nagaland: { name: "Nagaland", code: "13", iso: "IN-NL" },
  "arunachal pradesh": { name: "Arunachal Pradesh", code: "12", iso: "IN-AR" },
  mizoram: { name: "Mizoram", code: "15", iso: "IN-MZ" },
  sikkim: { name: "Sikkim", code: "11", iso: "IN-SK" },
  ladakh: { name: "Ladakh", code: "38", iso: "IN-LA" },
};

export function resolveStateCode(rawState?: string | null): StateCodeInfo {
  if (!rawState) {
    return { name: "Maharashtra", code: "27", iso: "IN-MH" };
  }
  const clean = rawState.trim().toLowerCase();
  if (INDIAN_STATES[clean]) {
    return INDIAN_STATES[clean];
  }
  // Try matching by ISO code or partial name
  for (const [key, val] of Object.entries(INDIAN_STATES)) {
    if (val.iso.toLowerCase() === clean || val.code === clean || key.includes(clean) || clean.includes(key)) {
      return val;
    }
  }
  return { name: rawState, code: "27", iso: "IN-MH" };
}

// ============================================================================
// INTEGER-PAISE ARITHMETIC & HALF-UP ROUNDING
// ============================================================================
export function toPaise(rupees: number): number {
  return Math.round(rupees * 100);
}

export function toRupees(paise: number): number {
  return paise / 100;
}

export function roundHalfUp(val: number): number {
  return Math.floor(val + 0.5);
}

// Indian comma formatting: e.g. 1,155.00 or 1,00,000.00
export function formatNum(val: number): string {
  const rounded = (Math.round(val * 100) / 100).toFixed(2);
  const [intPart, fracPart] = rounded.split(".");
  if (intPart.length > 3) {
    const last3 = intPart.slice(-3);
    const rest = intPart.slice(0, -3);
    const groups: string[] = [];
    let rem = rest;
    while (rem.length > 2) {
      groups.unshift(rem.slice(-2));
      rem = rem.slice(0, -2);
    }
    if (rem.length > 0) {
      groups.unshift(rem);
    }
    return `${groups.join(",")},${last3}.${fracPart}`;
  }
  return `${intPart}.${fracPart}`;
}

export function formatMoney(val: number): string {
  return `₹ ${formatNum(val)}`;
}

export function formatInvoiceDate(d?: Date | string | number | null): string {
  const dt = d ? new Date(d) : new Date();
  if (isNaN(dt.getTime())) return new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "2-digit", year: "numeric" }).replace(/\//g, "-");
  const day = String(dt.getDate()).padStart(2, "0");
  const month = String(dt.getMonth() + 1).padStart(2, "0");
  const year = dt.getFullYear();
  return `${day}-${month}-${year}`;
}

// ============================================================================
// AMOUNT IN INDIAN WORDS (LAKH / CRORE)
// ============================================================================
const ONES = [
  "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
  "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen",
  "Seventeen", "Eighteen", "Nineteen"
];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function twoDigitsToWords(n: number): string {
  if (n < 20) return ONES[n];
  const t = TENS[Math.floor(n / 10)];
  const o = ONES[n % 10];
  return o ? `${t} ${o}` : t;
}

function threeDigitsToWords(n: number): string {
  const hundreds = Math.floor(n / 100);
  const remainder = n % 100;
  const parts: string[] = [];
  if (hundreds > 0) parts.push(`${ONES[hundreds]} Hundred`);
  if (remainder > 0) parts.push(twoDigitsToWords(remainder));
  return parts.join(" ");
}

export function amountToIndianWords(amount: number): string {
  const totalPaise = Math.round(amount * 100);
  let rupees = Math.floor(totalPaise / 100);
  const paise = totalPaise % 100;

  if (rupees === 0 && paise === 0) {
    return "Zero Rupees Only";
  }

  const parts: string[] = [];
  const crores = Math.floor(rupees / 10000000);
  rupees %= 10000000;
  const lakhs = Math.floor(rupees / 100000);
  rupees %= 100000;
  const thousands = Math.floor(rupees / 1000);
  rupees %= 1000;
  const hundreds = rupees;

  if (crores > 0) parts.push(`${twoDigitsToWords(crores)} Crore`);
  if (lakhs > 0) parts.push(`${twoDigitsToWords(lakhs)} Lakh`);
  if (thousands > 0) parts.push(`${twoDigitsToWords(thousands)} Thousand`);
  if (hundreds > 0) parts.push(threeDigitsToWords(hundreds));

  let words = `${parts.join(" ")} Rupees`.trim();
  if (paise > 0) {
    words += ` and ${twoDigitsToWords(paise)} Paise`;
  }
  words += " Only";
  return words;
}

// ============================================================================
// INVOICE DATA BUILDER
// ============================================================================
export interface BuildInvoiceDataOptions {
  order: any;
  vendorId?: string;
  logoDataUri?: string;
  defaultTemplate?: string;
}

export interface InvoiceCalculatedResult {
  document_title?: string;
  document_number_label?: string;
  bos_title?: string;
  company: {
    name: string;
    legal_name: string;
    logo: string;
    website: string;
    email: string;
    phone: string;
    gstin: string;
    pan: string | null;
    address: string;
  };
  invoice: {
    number: string;
    date: string;
  };
  bos: {
    number: string;
    date: string;
  };
  order: {
    id: string;
    date: string;
    payment_method: string;
    payment_status?: string;
    gateway_ref?: string | null;
    refund_ref?: string | null;
    original_invoice_no?: string | null;
    original_invoice_date?: string | null;
    vehicle_no?: string | null;
    tracking_id?: string | null;
  };
  seller: {
    name: string;
    address: string;
    state_code: string;
    gstin?: string | null;
    pan?: string | null;
    regd_office?: string | null;
  };
  customer: {
    name: string;
    phone: string;
    gstin?: string | null;
  };
  billing: {
    line1: string;
    line2: string;
    state: string;
    pin: string;
    iso: string;
  };
  shipping: {
    line1: string;
    line2: string;
    state: string;
    pin: string;
    iso: string;
  };
  items: Array<{
    name: string;
    category: string;
    sku: string | null;
    hsn: string;
    vendor: string;
    qty: number;
    mrp: number;
    unit_price: number;
    gst_rate: number;
    gross: number;
    discount: number;
    taxable: number;
    cgst: number;
    sgst: number;
    igst: number;
    total: number;
    weight?: string | null;
  }>;
  charges: Array<{
    name: string;
    sac: string;
    amount: number;
    gst_rate: number;
    taxable: number;
    cgst: number;
    sgst: number;
    igst: number;
    free_label?: string | null;
  }>;
  totals: {
    qty: number;
    gross: number;
    discount: number;
    taxable: number;
    cgst: number;
    sgst: number;
    igst: number;
    items_subtotal: number;
    items_words: string;
    charges: number;
    charges_taxable: number;
    charges_cgst: number;
    charges_sgst: number;
    charges_igst: number;
    grand: number;
    words: string;
  };
  tax: {
    intra_state: boolean;
  };
  policy: {
    returns: string;
  };
  qr?: string;
}

/**
 * Returns list of distinct vendor IDs present in an order's items.
 */
export function getOrderVendorIds(order: any): string[] {
  const items: any[] = Array.isArray(order.items) ? order.items : [];
  const set = new Set<string>();
  for (const it of items) {
    const vId = it.vendorId || it.sellerId;
    if (vId) set.add(String(vId));
  }
  return Array.from(set);
}

/**
 * Builds the exact data shape required by the Vastraa 2-page invoice template.
 * All math strictly follows integer-paise decimal rules (GST inclusive).
 */
export async function buildInvoiceData(
  order: any,
  selectedVendorId?: string,
  logoDataUri?: string,
  documentType: "tax_invoice" | "master_order_summary" | "credit_note" = "tax_invoice"
): Promise<InvoiceCalculatedResult> {
  const orderRef = order.displayId || order.id || "V225";
  const orderDateFormatted = formatInvoiceDate(order.createdAt || order.date);
  const invoiceDateFormatted = formatInvoiceDate(order.paymentVerifiedAt || order.createdAt || order.date);

  let docTitle = "TAX INVOICE";
  let docNumberLabel = "Invoice Number";
  let bosTitle = "BILL OF SUPPLY";
  let invPrefix = "INV-";
  let bosPrefix = "BOS-";

  if (documentType === "master_order_summary") {
    docTitle = "MASTER ORDER SUMMARY";
    docNumberLabel = "Summary Reference";
    bosTitle = "BILL OF SUPPLY & CHARGES";
    invPrefix = "MOS-";
    bosPrefix = "BOS-MOS-";
  } else if (documentType === "credit_note") {
    docTitle = "CREDIT NOTE";
    docNumberLabel = "Credit Note Number";
    bosTitle = "CREDIT ADJUSTMENT SUMMARY";
    invPrefix = "CN-";
    bosPrefix = "BOS-CN-";
  }

  const rawAddress = order.address || {};
  const shippingInfo = resolveStateCode(rawAddress.state);
  const billingInfo = resolveStateCode(rawAddress.billingState || rawAddress.state);

  const customerName = rawAddress.name || order.customer?.name || "Valued Customer";
  const customerPhone = rawAddress.phone || order.customer?.phone || "";
  const customerGstin = rawAddress.buyerGstin || order.customer?.gstin || "URP (Unregistered)";

  // Filter items if a specific vendor was requested
  const allItems: any[] = Array.isArray(order.items) ? order.items : [];
  let filteredItems = allItems;
  if (selectedVendorId) {
    filteredItems = allItems.filter(
      (it) => String(it.vendorId || it.sellerId) === String(selectedVendorId)
    );
    if (filteredItems.length === 0) filteredItems = allItems; // fallback if vendor not matched
  }

  // Determine seller / vendor details
  const firstItem = filteredItems[0] || allItems[0] || {};
  const vendorId = selectedVendorId || firstItem.vendorId || firstItem.sellerId;

  let sellerObj: any = null;
  if (vendorId) {
    try {
      sellerObj = await mongoVendors.findById(vendorId);
      if (!sellerObj) {
        sellerObj = await mongoSellers.findById(vendorId);
      }
    } catch {}
  }

  const sellerName =
    order.seller?.name ||
    sellerObj?.name ||
    sellerObj?.storeName ||
    firstItem.vendorName ||
    firstItem.vendor ||
    "Kange Collection";

  const sellerAddress =
    order.seller?.address ||
    sellerObj?.pickupAddress?.addressLine1 ||
    sellerObj?.registeredAddress?.addressLine1 ||
    sellerObj?.address ||
    "India";

  const sellerStateCode =
    order.seller?.state_code ||
    (sellerObj?.pickupAddress?.state ? resolveStateCode(sellerObj.pickupAddress.state).code : "27");

  const sellerGstin = order.seller?.gstin ?? (sellerObj?.gstin || sellerObj?.businessDetails?.gstin || null);
  const sellerPan = order.seller?.pan ?? (sellerObj?.pan || sellerObj?.businessDetails?.pan || null);
  const sellerRegdOffice = order.seller?.regd_office ?? (sellerObj?.registeredAddress?.addressLine1
    ? `${sellerObj.registeredAddress.addressLine1}, ${sellerObj.registeredAddress.city || ""}, ${sellerObj.registeredAddress.state || ""}`.replace(/,\s*,/g, ",").trim()
    : null);

  // Intra-state check: Seller State Code == Shipping State Code
  const intraState = sellerStateCode === shippingInfo.code;

  // ── Compute Items (GST Inclusive Math) ─────────────────────────────────────
  let totalGrossPaise = 0;
  let totalDiscountPaise = 0;
  let totalTaxablePaise = 0;
  let totalCgstPaise = 0;
  let totalSgstPaise = 0;
  let totalIgstPaise = 0;
  let totalItemsSubtotalPaise = 0;
  let totalQty = 0;

  const computedItems = filteredItems.map((it: any) => {
    const qty = Math.max(1, Number(it.quantity || it.qty || 1));
    totalQty += qty;

    const unitPriceRupees = Number(it.price || it.unit_price || 0);
    const mrpRupees = Number(it.mrp || unitPriceRupees);
    const gstRate = Number(it.gst_rate ?? it.gstRate ?? 5.0);

    const unitPricePaise = toPaise(unitPriceRupees);
    const mrpPaise = toPaise(mrpRupees);

    const sellingTotalPaise = unitPricePaise * qty;
    const grossPaise = mrpPaise * qty;
    const discountPaise = Math.max(0, grossPaise - sellingTotalPaise);

    // Taxable = sellingTotal / (1 + rate/100)
    const rateBps = Math.round(gstRate * 100);
    const taxablePaise = Math.round((sellingTotalPaise * 10000) / (10000 + rateBps));
    const gstPaise = sellingTotalPaise - taxablePaise;

    let cgstPaise = 0;
    let sgstPaise = 0;
    let igstPaise = 0;

    if (intraState) {
      cgstPaise = Math.round(gstPaise / 2);
      sgstPaise = gstPaise - cgstPaise;
    } else {
      igstPaise = gstPaise;
    }

    totalGrossPaise += grossPaise;
    totalDiscountPaise += discountPaise;
    totalTaxablePaise += taxablePaise;
    totalCgstPaise += cgstPaise;
    totalSgstPaise += sgstPaise;
    totalIgstPaise += igstPaise;
    totalItemsSubtotalPaise += sellingTotalPaise;

    return {
      name: it.name || "Silk Saree",
      category: it.category || "Saree",
      sku: it.sku || null,
      hsn: it.hsn || "5007",
      vendor: it.vendorName || it.vendor || sellerName,
      qty,
      mrp: toRupees(mrpPaise),
      unit_price: toRupees(unitPricePaise),
      gst_rate: gstRate,
      gross: toRupees(grossPaise),
      discount: toRupees(discountPaise),
      taxable: toRupees(taxablePaise),
      cgst: toRupees(cgstPaise),
      sgst: toRupees(sgstPaise),
      igst: toRupees(igstPaise),
      total: toRupees(sellingTotalPaise),
      weight: it.weight || null,
    };
  });

  // ── Compute Charges (Platform Fee & Shipping) ──────────────────────────────
  const allVendorIds = getOrderVendorIds(order);
  const isMultiVendor = allVendorIds.length > 1;
  const isSellerSuborder = isMultiVendor && selectedVendorId && documentType !== "master_order_summary";

  let platformFeeRupees = INVOICE_CONFIG.fees.platformFeeAmount;
  let platformGstRate = INVOICE_CONFIG.fees.platformFeeGstRate;
  let shippingRupees = 0;
  let shippingGstRate = INVOICE_CONFIG.fees.shippingGstRate;

  if (Array.isArray(order.charges)) {
    const pCharge = order.charges.find((c: any) => c.name?.toLowerCase().includes("platform"));
    if (pCharge) {
      platformFeeRupees = Number(pCharge.amount ?? 0);
      platformGstRate = Number(pCharge.gst_rate ?? platformGstRate);
    } else {
      platformFeeRupees = 0;
    }
    const sCharge = order.charges.find((c: any) => c.name?.toLowerCase().includes("shipping"));
    if (sCharge) {
      shippingRupees = Number(sCharge.amount ?? 0);
      shippingGstRate = Number(sCharge.gst_rate ?? shippingGstRate);
    }
  } else {
    const orderShippingVal =
      typeof order.shipping === "number"
        ? order.shipping
        : typeof order.shippingFee === "number"
        ? order.shippingFee
        : 0;
    shippingRupees = orderShippingVal > 1000 ? toRupees(orderShippingVal) : orderShippingVal;

    // Do not add extra platform fee if recorded order total equals items subtotal or if seller suborder
    const recordedTotal = Number(order.total ?? order.totalAmount ?? 0);
    if (recordedTotal > 0 && toPaise(recordedTotal) <= totalItemsSubtotalPaise) {
      platformFeeRupees = 0;
    }
  }

  // Seller tax invoices never charge marketplace platform fees (those belong to VASTRAA Master Order Summary)
  if (isSellerSuborder) {
    platformFeeRupees = 0;
  }

  const platformFeePaise = toPaise(platformFeeRupees);
  const platformTaxablePaise = platformFeePaise; // 0% GST default
  const platformCgstPaise = 0;
  const platformSgstPaise = 0;
  const platformIgstPaise = 0;

  const shippingPaise = toPaise(shippingRupees);
  const shippingTaxablePaise = shippingPaise;
  const shippingCgstPaise = 0;
  const shippingSgstPaise = 0;
  const shippingIgstPaise = 0;

  const computedCharges = [
    {
      name: "Platform Fee",
      sac: INVOICE_CONFIG.sac.platformFee,
      amount: toRupees(platformFeePaise),
      gst_rate: platformGstRate,
      taxable: toRupees(platformTaxablePaise),
      cgst: toRupees(platformCgstPaise),
      sgst: toRupees(platformSgstPaise),
      igst: toRupees(platformIgstPaise),
    },
    {
      name: "Shipping Fee",
      sac: INVOICE_CONFIG.sac.shippingFee,
      amount: toRupees(shippingPaise),
      gst_rate: shippingGstRate,
      taxable: toRupees(shippingTaxablePaise),
      cgst: toRupees(shippingCgstPaise),
      sgst: toRupees(shippingSgstPaise),
      igst: toRupees(shippingIgstPaise),
      free_label: shippingPaise === 0 ? "FREE" : null,
    },
  ];

  const totalChargesPaise = platformFeePaise + shippingPaise;
  const totalChargesTaxablePaise = platformTaxablePaise + shippingTaxablePaise;
  const totalChargesCgstPaise = platformCgstPaise + shippingCgstPaise;
  const totalChargesSgstPaise = platformSgstPaise + shippingSgstPaise;
  const totalChargesIgstPaise = platformIgstPaise + shippingIgstPaise;

  const grandTotalPaise = totalItemsSubtotalPaise + totalChargesPaise;

  const totals = {
    qty: totalQty,
    gross: toRupees(totalGrossPaise),
    discount: toRupees(totalDiscountPaise),
    taxable: toRupees(totalTaxablePaise),
    cgst: toRupees(totalCgstPaise),
    sgst: toRupees(totalSgstPaise),
    igst: toRupees(totalIgstPaise),
    items_subtotal: toRupees(totalItemsSubtotalPaise),
    items_words: amountToIndianWords(toRupees(totalItemsSubtotalPaise)),
    charges: toRupees(totalChargesPaise),
    charges_taxable: toRupees(totalChargesTaxablePaise),
    charges_cgst: toRupees(totalChargesCgstPaise),
    charges_sgst: toRupees(totalChargesSgstPaise),
    charges_igst: toRupees(totalChargesIgstPaise),
    grand: toRupees(grandTotalPaise),
    words: amountToIndianWords(toRupees(grandTotalPaise)),
  };

  const rawPm = String(order.paymentMethod || "UPI").toLowerCase();
  const rawPs = String(order.paymentStatus || "").toLowerCase();
  const rawStatus = String(order.status || "").toLowerCase();

  const isRefunded =
    order.refundStatus === "processed" ||
    rawStatus === "refunded" ||
    rawPs === "refunded" ||
    Boolean(order.refundReference || order.refundAmount);

  const isCancelled = rawStatus === "cancelled" || rawStatus === "rejected";
  const isCod = rawPm === "cod" || rawPm.includes("cash") || rawPm.includes("delivery");
  const isCodPending = isCod && rawStatus !== "delivered";

  let paymentStatus: string;
  if (isRefunded) {
    paymentStatus = "REFUNDED";
  } else if (isCancelled) {
    paymentStatus = "CANCELLED";
  } else if (isCodPending) {
    paymentStatus = "PENDING";
  } else if (rawPs === "paid" || rawPs === "completed" || rawPs === "success") {
    paymentStatus = "PAID";
  } else if (rawPs === "pending" || rawPs === "initiated") {
    paymentStatus = "PENDING";
  } else {
    paymentStatus = isCod ? "PENDING" : "PAID";
  }

  const paymentMethodLabel = isCod ? "Cash on Delivery" : (order.paymentMethod || "UPI").toUpperCase();

  const effectiveSellerName =
    documentType === "master_order_summary"
      ? `${INVOICE_CONFIG.company.name} MARKETPLACE (Fulfilled by Verified Sellers)`
      : sellerName;

  let vendorSuffix = "";
  if (isMultiVendor && selectedVendorId && documentType !== "master_order_summary") {
    const idx = allVendorIds.indexOf(String(selectedVendorId));
    vendorSuffix = idx >= 0 ? `-V${idx + 1}` : `-${selectedVendorId}`;
  }

  return {
    document_title: docTitle,
    document_number_label: docNumberLabel,
    bos_title: bosTitle,
    company: {
      name: INVOICE_CONFIG.company.name,
      legal_name: INVOICE_CONFIG.company.legalName,
      logo: logoDataUri || "",
      website: INVOICE_CONFIG.company.website,
      email: INVOICE_CONFIG.company.email,
      phone: INVOICE_CONFIG.company.phone,
      gstin: INVOICE_CONFIG.company.gstin,
      pan: INVOICE_CONFIG.company.pan,
      address: INVOICE_CONFIG.company.address,
    },
    invoice: {
      number: `${invPrefix}${orderRef}${vendorSuffix}`,
      date: invoiceDateFormatted,
    },
    bos: {
      number: `${bosPrefix}${orderRef}${vendorSuffix}`,
      date: invoiceDateFormatted,
    },
    order: {
      id: orderRef,
      date: orderDateFormatted,
      payment_method: paymentMethodLabel,
      payment_status: paymentStatus,
      gateway_ref: order.cashfreePaymentId || order.paymentReference || null,
      refund_ref: order.refundReference || null,
      original_invoice_no: (order as any).original_invoice_no || null,
      original_invoice_date: (order as any).original_invoice_date || null,
      vehicle_no: order.vehicleNo || order.vehicle_no || null,
      tracking_id: order.trackingId || order.tracking_id || null,
    },
    seller: {
      name: effectiveSellerName,
      address: sellerAddress,
      state_code: sellerStateCode,
      gstin: sellerGstin,
      pan: sellerPan,
      regd_office: sellerRegdOffice,
    },
    customer: {
      name: customerName,
      phone: customerPhone,
      gstin: customerGstin,
    },
    billing: {
      line1: rawAddress.line1 || rawAddress.address || "Tisgaon",
      line2: rawAddress.line2 || rawAddress.city || "Tisgaon",
      state: billingInfo.name,
      pin: rawAddress.pincode || "400001",
      iso: billingInfo.iso,
    },
    shipping: {
      line1: rawAddress.line1 || rawAddress.address || "Tisgaon",
      line2: rawAddress.line2 || rawAddress.city || "Tisgaon",
      state: shippingInfo.name,
      pin: rawAddress.pincode || "400001",
      iso: shippingInfo.iso,
    },
    items: computedItems,
    charges: computedCharges,
    totals,
    tax: {
      intra_state: intraState,
    },
    policy: {
      returns: INVOICE_CONFIG.policy.returns,
    },
  };
}

/**
 * Resolves the configured default invoice template.
 * Checks mongoSiteSettings / site_settings for 'invoice_default_template' or 'invoice.defaultTemplate',
 * falling back to INVOICE_CONFIG.defaultTemplate ("vastraa-v2").
 */
export async function getInvoiceDefaultTemplate(): Promise<string> {
  try {
    const { mongoSiteSettings, siteSettingsTable, db, eq } = await import("@workspace/db");
    if (mongoSiteSettings && typeof mongoSiteSettings.get === "function") {
      const val =
        (await mongoSiteSettings.get("invoice_default_template")) ||
        (await mongoSiteSettings.get("invoice.defaultTemplate"));
      if (val) return String(val).trim();
    }
    if (db && siteSettingsTable && typeof db.select === "function") {
      const [row] = await db
        .select({ value: siteSettingsTable.value })
        .from(siteSettingsTable)
        .where(eq(siteSettingsTable.key, "invoice_default_template"))
        .limit(1);
      if (row?.value) return String(row.value).trim();
    }
  } catch {}
  return INVOICE_CONFIG.defaultTemplate;
}

/**
 * Builds invoice data for all vendors present in an order.
 * If the order has items from several vendors, generates one invoice per vendor.
 */
export async function buildAllInvoicesForOrder(
  order: any,
  logoDataUri?: string
): Promise<InvoiceCalculatedResult[]> {
  const allItems: any[] = Array.isArray(order.items) ? order.items : [];
  const vendorIds = new Set<string>();

  for (const it of allItems) {
    const vid = it.vendorId || it.sellerId || it.vendorName || it.vendor;
    if (vid) {
      vendorIds.add(String(vid));
    }
  }

  // Single vendor or no explicit vendor markers -> single invoice
  if (vendorIds.size <= 1) {
    const single = await buildInvoiceData(order, undefined, logoDataUri);
    return [single];
  }

  // Multiple vendors -> generate one invoice per vendor
  const vendorList = Array.from(vendorIds);
  const invoices: InvoiceCalculatedResult[] = [];
  const orderRef = order.displayId || order.id || "V225";

  for (let i = 0; i < vendorList.length; i++) {
    const vid = vendorList[i];
    const inv = await buildInvoiceData(order, vid, logoDataUri);
    inv.invoice.number = `INV-${orderRef}-V${i + 1}`;
    inv.bos.number = `BOS-${orderRef}-V${i + 1}`;
    invoices.push(inv);
  }

  return invoices;
}

/**
 * Builds the Master Order Summary covering all products across all sellers in a multi-seller checkout.
 * Reuses the same approved visual template with document title "MASTER ORDER SUMMARY".
 */
export async function buildMasterOrderSummary(
  order: any,
  logoDataUri?: string
): Promise<InvoiceCalculatedResult> {
  return buildInvoiceData(order, undefined, logoDataUri, "master_order_summary");
}
