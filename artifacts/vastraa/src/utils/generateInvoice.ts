import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import QRCode from "qrcode";
import { apiFetch } from "@/lib/api";
import { VASTRAA_LOGO_DATA_URI } from "./invoiceLogo";

export async function downloadOfficialInvoicePdf(orderId: string, displayId?: string | null): Promise<boolean> {
  try {
    const res = await apiFetch(`/api/orders/${orderId}/invoice`);
    if (res.ok) {
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Invoice-INV-${displayId || orderId}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      return true;
    }
  } catch (err) {
    console.warn("downloadOfficialInvoicePdf error:", err);
  }
  return false;
}

// ─── Types ───────────────────────────────────────────────────────────────────

export type OrderItem = {
  productId?: string;
  name: string;
  price: number;
  quantity: number;
  images?: string[];
  vendorName?: string;
  category?: string;
  sku?: string | null;
  hsn?: string | null;
  gst_rate?: number;
};

export type OrderAddress = {
  name: string;
  phone?: string;
  line1: string;
  line2?: string;
  city?: string;
  state: string;
  pincode: string;
};

export type FinancialBreakdown = {
  sellerBasePrice?: number;
  platformCommission?: number;
  shippingFee?: number;
  taxableAmount?: number;
  gstRateBps?: number;
  gstAmount?: number;
  cgst?: number;
  sgst?: number;
  igst?: number;
  customerPays?: number;
  gstOnCommission?: number;
  tcsDeduction?: number;
  sellerSettlement?: number;
  pricingVersion?: "v1" | "v2" | string;
  platformKeeps?: number;
};

export type InvoiceOrder = {
  id: string;
  displayId?: string | null;
  createdAt: string;
  items: OrderItem[];
  address: OrderAddress;
  paymentMethod: string;
  deliveryMethod?: string;
  subtotal?: number;
  discount?: number;
  platformFee?: number;
  codFee?: number;
  shipping?: number;
  tax?: number;
  total: number;
  couponCode?: string | null;
  status: string;
  financials?: FinancialBreakdown;
  sellerName?: string;
  sellerAddress?: string;
  sellerGstin?: string;
  buyerGstin?: string;
  vehicleNo?: string | null;
  trackingId?: string | null;
};

// ─── Color Palette Matching Approved Template ────────────────────────────────

const NAVY = [10, 31, 68] as [number, number, number]; // #0A1F44
const GOLD = [184, 145, 42] as [number, number, number]; // #B8912A
const GOLD_LIGHT = [246, 239, 217] as [number, number, number]; // #F6EFD9
const LINE_COLOR = [217, 213, 199] as [number, number, number]; // #D9D5C7
const TEXT_DARK = [31, 41, 55] as [number, number, number]; // #1F2937
const MUTED = [107, 114, 128] as [number, number, number]; // #6B7280
const TEXT_SMALL = [75, 85, 99] as [number, number, number]; // #4B5563
const PAID_GOLD = [243, 214, 117] as [number, number, number]; // #F3D675

// ─── Format Helpers ──────────────────────────────────────────────────────────

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
    if (rem.length > 0) groups.unshift(rem);
    return `${groups.join(",")},${last3}.${fracPart}`;
  }
  return `${intPart}.${fracPart}`;
}

export function formatMoney(val: number): string {
  return `₹ ${formatNum(val)}`;
}

export function formatInvoiceDate(d?: Date | string | number | null): string {
  const dt = d ? new Date(d) : new Date();
  if (isNaN(dt.getTime())) return "19-10-2026";
  const day = String(dt.getDate()).padStart(2, "0");
  const month = String(dt.getMonth() + 1).padStart(2, "0");
  const year = dt.getFullYear();
  return `${day}-${month}-${year}`;
}

// ─── Number to Indian Words ──────────────────────────────────────────────────

const ONES = [
  "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
  "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen",
  "Seventeen", "Eighteen", "Nineteen",
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

  if (rupees === 0 && paise === 0) return "Zero Rupees Only";

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
  if (paise > 0) words += ` and ${twoDigitsToWords(paise)} Paise`;
  words += " Only";
  return words;
}

// ─── Unicode Font Registration for Rupee (₹) Symbol ──────────────────────────

async function ensureUnicodeFont(doc: jsPDF): Promise<boolean> {
  try {
    if (typeof window !== "undefined" && typeof fetch === "function") {
      const [regRes, boldRes] = await Promise.allSettled([
        fetch("/fonts/NotoSans-Regular.ttf"),
        fetch("/fonts/NotoSans-Bold.ttf"),
      ]);
      let loaded = false;
      if (regRes.status === "fulfilled" && regRes.value.ok) {
        const buf = await regRes.value.arrayBuffer();
        const bytes = new Uint8Array(buf);
        let binary = "";
        for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
        doc.addFileToVFS("NotoSans-Regular.ttf", binary);
        doc.addFont("NotoSans-Regular.ttf", "NotoSans", "normal");
        loaded = true;
      }
      if (boldRes.status === "fulfilled" && boldRes.value.ok) {
        const buf = await boldRes.value.arrayBuffer();
        const bytes = new Uint8Array(buf);
        let binary = "";
        for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
        doc.addFileToVFS("NotoSans-Bold.ttf", binary);
        doc.addFont("NotoSans-Bold.ttf", "NotoSans", "bold");
      }
      return loaded;
    } else if (typeof process !== "undefined" && (process as any).versions?.node) {
      const fs = await import("fs");
      const path = await import("path");
      const possibleDirs = [
        path.resolve(process.cwd(), "public", "fonts"),
        path.resolve(process.cwd(), "artifacts", "vastraa", "public", "fonts"),
        path.resolve(process.cwd(), "..", "vastraa", "public", "fonts"),
        path.resolve(process.cwd(), "..", "..", "artifacts", "vastraa", "public", "fonts"),
        path.resolve(process.cwd(), "artifacts", "api-server", "assets", "fonts"),
      ];
      let foundDir: string | null = null;
      for (const d of possibleDirs) {
        if (fs.existsSync(path.join(d, "NotoSans-Regular.ttf"))) {
          foundDir = d;
          break;
        }
      }
      if (foundDir) {
        const regBuf = fs.readFileSync(path.join(foundDir, "NotoSans-Regular.ttf"));
        const boldBuf = fs.readFileSync(path.join(foundDir, "NotoSans-Bold.ttf"));
        doc.addFileToVFS("NotoSans-Regular.ttf", regBuf.toString("binary"));
        doc.addFont("NotoSans-Regular.ttf", "NotoSans", "normal");
        doc.addFileToVFS("NotoSans-Bold.ttf", boldBuf.toString("binary"));
        doc.addFont("NotoSans-Bold.ttf", "NotoSans", "bold");
        return true;
      }
    }
  } catch (err) {
    console.warn("Could not register Unicode font in jsPDF:", err);
  }
  return false;
}

// ─── Client-side 2-Page PDF Renderer (Matches attached template) ──────────────

export async function renderClientInvoicePdf(order: InvoiceOrder): Promise<jsPDF> {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const hasUnicodeFont = await ensureUnicodeFont(doc);
  const fontRegular = hasUnicodeFont ? "NotoSans" : "helvetica";
  const fontBold = hasUnicodeFont ? "NotoSans" : "helvetica";
  const fontSerif = hasUnicodeFont ? "NotoSans" : "times";

  const W = 210;
  const H = 297;
  const MX = 12; // 12mm margins matching CSS wrap

  const orderRef = order.displayId || order.id || "V225";
  const invNumber = `INV-${orderRef}`;
  const bosNumber = `BOS-${orderRef}`;
  const invDate = formatInvoiceDate(order.createdAt);

  const customerName = order.address?.name || "Customer";
  const customerPhone = order.address?.phone || "";
  const customerState = order.address?.state || "Maharashtra";
  const customerPin = order.address?.pincode || "400001";
  const line1 = order.address?.line1 || "Tisgaon";
  const line2 = order.address?.line2 || order.address?.city || "Tisgaon";

  const isIntraState = customerState.trim().toLowerCase() === "maharashtra";

  // Derive seller details
  const firstVendor = order.items?.[0]?.vendorName || order.sellerName || "Kange Collection";
  const sellerName = firstVendor;
  const sellerAddress = order.sellerAddress || "India";
  const sellerGstin = order.sellerGstin || null;

  // Calculate items financial totals
  let totalGross = 0;
  let totalDiscount = order.discount || 0;
  let totalTaxable = 0;
  let totalSgst = 0;
  let totalCgst = 0;
  let totalIgst = 0;
  let totalItemsSubtotal = 0;
  let totalQty = 0;

  type CalculatedItem = {
    category: string;
    sku: string | null;
    hsn: string;
    name: string;
    vendor: string;
    gstRate: number;
    qty: number;
    gross: number;
    discount: number;
    taxable: number;
    sgst: number;
    cgst: number;
    igst: number;
    total: number;
  };

  const calculatedItems: CalculatedItem[] = (order.items || []).map((it, idx) => {
    const qty = it.quantity || 1;
    totalQty += qty;
    const gross = (it.price || 0) * qty;
    totalGross += gross;

    // Distribute discount proportionally
    const itemDiscount = order.items.length === 1 ? totalDiscount : 0;
    const net = gross - itemDiscount;

    const gstRate = it.gst_rate || 5.0;
    const taxable = Math.round((net / (1 + gstRate / 100)) * 100) / 100;
    totalTaxable += taxable;

    const totalTax = Math.round((net - taxable) * 100) / 100;
    let sgst = 0;
    let cgst = 0;
    let igst = 0;

    if (isIntraState) {
      sgst = Math.round((totalTax / 2) * 100) / 100;
      cgst = Math.round((totalTax - sgst) * 100) / 100;
      totalSgst += sgst;
      totalCgst += cgst;
    } else {
      igst = totalTax;
      totalIgst += igst;
    }

    const itemTotal = net;
    totalItemsSubtotal += itemTotal;

    return {
      category: it.category || "Saree",
      sku: it.sku || null,
      hsn: it.hsn || "5007",
      name: it.name,
      vendor: it.vendorName || sellerName,
      gstRate,
      qty,
      gross,
      discount: itemDiscount,
      taxable,
      sgst,
      cgst,
      igst,
      total: itemTotal,
    };
  });

  const platformFeeVal = order.platformFee ?? 20;
  const shippingFeeVal = order.shipping ?? 0;
  const totalChargesVal = platformFeeVal + shippingFeeVal;
  const grandTotal = order.total || totalItemsSubtotal + totalChargesVal;
  const itemsWords = amountToIndianWords(totalItemsSubtotal);
  const grandWords = amountToIndianWords(grandTotal);

  // Generate QR Code for page 2
  let qrDataUri = "";
  try {
    qrDataUri = await QRCode.toDataURL(`${invNumber}|${orderRef}|${grandTotal.toFixed(2)}|${invDate}`, {
      margin: 1,
      width: 200,
    });
  } catch {}

  // ===========================================================================
  // PAGE 1: TAX INVOICE
  // ===========================================================================

  // 1. Top bar: Navy bar + Gold border
  doc.setFillColor(...NAVY);
  doc.rect(0, 0, W, 4, "F");
  doc.setFillColor(...GOLD);
  doc.rect(0, 4, W, 1.2, "F");

  // 2. Header
  try {
    doc.addImage(VASTRAA_LOGO_DATA_URI, "PNG", MX, 8, 62, 17);
  } catch {}

  // "TAX INVOICE"
  doc.setFont(fontSerif, "bold");
  doc.setFontSize(21);
  doc.setTextColor(...NAVY);
  doc.text("TAX INVOICE", W - MX, 16, { align: "right" });

  // Dashed box for Invoice Number
  doc.setDrawColor(...GOLD);
  doc.setLineDashPattern([1.5, 1.5], 0);
  doc.setLineWidth(0.3);
  doc.rect(130, 19.5, 68, 6.5);
  doc.setLineDashPattern([], 0); // reset dash pattern

  doc.setFont(fontBold, "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(...TEXT_DARK);
  doc.text("Invoice Number", 133, 24);
  doc.setFont(fontRegular, "normal");
  doc.text(`# ${invNumber}`, W - MX - 3, 24, { align: "right" });

  // 3. Gold rule across
  doc.setDrawColor(...GOLD);
  doc.setLineWidth(0.3);
  doc.line(MX, 29, W - MX, 29);

  // 4. Sold By
  doc.setFont(fontBold, "bold");
  doc.setFontSize(10);
  doc.setTextColor(...NAVY);
  doc.text(`Sold By: ${sellerName}`, MX, 34);

  doc.setFont(fontRegular, "italic");
  doc.setFontSize(8.5);
  doc.setTextColor(...TEXT_SMALL);
  doc.text(`Ship-from Address: ${sellerAddress}`, MX, 38.5);

  if (sellerGstin) {
    doc.setFont(fontRegular, "normal");
    doc.text(`GSTIN - ${sellerGstin}`, MX, 43);
  }

  // 5. Thin rule
  doc.setDrawColor(...LINE_COLOR);
  doc.setLineWidth(0.2);
  const ruleY = sellerGstin ? 46 : 42;
  doc.line(MX, ruleY, W - MX, ruleY);

  // 6. 3-Column Block (Order ID, Bill To, Ship To)
  const colY = ruleY + 4;
  const col1X = MX;
  const col2X = 74;
  const col3X = 136;

  // Helper to draw gold header label with underline
  function drawColHeader(title: string, x: number, y: number, w: number) {
    doc.setFont(fontBold, "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(...GOLD);
    doc.text(title.toUpperCase(), x, y);
    doc.setDrawColor(...LINE_COLOR);
    doc.setLineWidth(0.2);
    doc.line(x, y + 1.2, x + w, y + 1.2);
  }

  // Col 1: Order Details
  drawColHeader("Order Details", col1X, colY, 56);
  doc.setFont(fontBold, "bold");
  doc.setFontSize(9.5);
  doc.setTextColor(...NAVY);
  doc.text(`Order ID: ${orderRef}`, col1X, colY + 5);

  doc.setFont(fontRegular, "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...TEXT_SMALL);
  doc.text(`Order Date: ${invDate}`, col1X, colY + 9.5);
  doc.text(`Invoice Date: ${invDate}`, col1X, colY + 13.5);

  // Col 2: Bill To
  drawColHeader("Bill To", col2X, colY, 56);
  doc.setFont(fontBold, "bold");
  doc.setFontSize(9.5);
  doc.setTextColor(...NAVY);
  doc.text(customerName, col2X, colY + 5);

  doc.setFont(fontRegular, "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...TEXT_SMALL);
  doc.text(line1, col2X, colY + 9.5);
  doc.text(line2, col2X, colY + 13.5);
  doc.text(`${customerState} - ${customerPin}`, col2X, colY + 17.5);
  doc.text(`Phone: ${customerPhone}`, col2X, colY + 21.5);
  doc.text(`Buyer GSTIN: ${order.buyerGstin || "URP (Unregistered)"}`, col2X, colY + 25.5);

  // Col 3: Ship To
  drawColHeader("Ship To", col3X, colY, 62);
  doc.setFont(fontBold, "bold");
  doc.setFontSize(9.5);
  doc.setTextColor(...NAVY);
  doc.text(customerName, col3X, colY + 5);

  doc.setFont(fontRegular, "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...TEXT_SMALL);
  doc.text(line1, col3X, colY + 9.5);
  doc.text(line2, col3X, colY + 13.5);
  doc.text(`${customerState} - ${customerPin}`, col3X, colY + 17.5);
  doc.text(`Phone: ${customerPhone}`, col3X, colY + 21.5);

  // 7. Small Warranty Notice & Item count
  const itemsStartLabelY = colY + 31;
  doc.setFont(fontRegular, "italic");
  doc.setFontSize(8);
  doc.setTextColor(...MUTED);
  doc.text("*Keep this invoice and the product box for warranty purposes.", MX, itemsStartLabelY);

  const totalItemsText = calculatedItems.length > 1
    ? `Total distinct products: ${calculatedItems.length}   |   Total Items: ${totalQty} ${totalQty === 1 ? "unit" : "units"}`
    : `Total Items: ${totalQty} ${totalQty === 1 ? "item" : "items"}`;

  doc.setFont(fontBold, "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(...NAVY);
  doc.text(totalItemsText, MX, itemsStartLabelY + 5);

  // 8. Items Table
  const tableHead = isIntraState
    ? [["PRODUCT", "TITLE", "QTY", "GROSS AMOUNT\n₹", "DISCOUNT\n₹", "TAXABLE VALUE\n₹", "SGST\n₹", "CGST\n₹", "TOTAL\n₹"]]
    : [["PRODUCT", "TITLE", "QTY", "GROSS AMOUNT\n₹", "DISCOUNT\n₹", "TAXABLE VALUE\n₹", "IGST\n₹", "TOTAL\n₹"]];

  const tableRows = calculatedItems.map((it) => {
    const prodCol = `${it.category}\n${it.sku ? `SKU: ${it.sku}\n` : ""}HSN/SAC: ${it.hsn}`;
    const taxRateStr = isIntraState
      ? `SGST/UTGST: ${it.gstRate / 2} %\nCGST: ${it.gstRate / 2} %`
      : `IGST: ${it.gstRate} %`;
    const titleCol = `${it.name}\nVendor: ${it.vendor}\n${taxRateStr}`;

    if (isIntraState) {
      return [
        prodCol,
        titleCol,
        String(it.qty),
        formatNum(it.gross),
        it.discount > 0 ? `-${formatNum(it.discount)}` : "0.00",
        formatNum(it.taxable),
        formatNum(it.sgst),
        formatNum(it.cgst),
        formatNum(it.total),
      ];
    } else {
      return [
        prodCol,
        titleCol,
        String(it.qty),
        formatNum(it.gross),
        it.discount > 0 ? `-${formatNum(it.discount)}` : "0.00",
        formatNum(it.taxable),
        formatNum(it.igst),
        formatNum(it.total),
      ];
    }
  });

  // Total row
  if (isIntraState) {
    tableRows.push([
      "",
      "Total",
      String(totalQty),
      formatNum(totalGross),
      totalDiscount > 0 ? `-${formatNum(totalDiscount)}` : "0.00",
      formatNum(totalTaxable),
      formatNum(totalSgst),
      formatNum(totalCgst),
      formatNum(totalItemsSubtotal),
    ]);
  } else {
    tableRows.push([
      "",
      "Total",
      String(totalQty),
      formatNum(totalGross),
      totalDiscount > 0 ? `-${formatNum(totalDiscount)}` : "0.00",
      formatNum(totalTaxable),
      formatNum(totalIgst),
      formatNum(totalItemsSubtotal),
    ]);
  }

  autoTable(doc, {
    startY: itemsStartLabelY + 7,
    head: tableHead,
    body: tableRows,
    margin: { left: MX, right: MX },
    theme: "plain",
    headStyles: {
      fillColor: NAVY,
      textColor: [255, 255, 255],
      font: fontBold,
      fontSize: 7.2,
      fontStyle: "bold",
      halign: "right",
      cellPadding: 2,
    },
    styles: {
      font: fontRegular,
      fontSize: 8,
      cellPadding: 2.2,
      textColor: TEXT_DARK,
      lineColor: LINE_COLOR,
      lineWidth: 0.15,
      halign: "right",
    },
    columnStyles: isIntraState
      ? {
          0: { halign: "left", cellWidth: 26 },
          1: { halign: "left", cellWidth: 46 },
          2: { halign: "center", cellWidth: 10 },
          3: { halign: "right", cellWidth: 22 },
          4: { halign: "right", cellWidth: 18 },
          5: { halign: "right", cellWidth: 22 },
          6: { halign: "right", cellWidth: 14 },
          7: { halign: "right", cellWidth: 14 },
          8: { halign: "right", cellWidth: 20 },
        }
      : {
          0: { halign: "left", cellWidth: 28 },
          1: { halign: "left", cellWidth: 54 },
          2: { halign: "center", cellWidth: 12 },
          3: { halign: "right", cellWidth: 24 },
          4: { halign: "right", cellWidth: 20 },
          5: { halign: "right", cellWidth: 24 },
          6: { halign: "right", cellWidth: 20 },
          7: { halign: "right", cellWidth: 24 },
        },
    didParseCell: (data) => {
      // Style total row
      if (data.row.index === tableRows.length - 1) {
        data.cell.styles.fillColor = GOLD_LIGHT;
        data.cell.styles.fontStyle = "bold";
        data.cell.styles.textColor = NAVY;
      }
    },
  });

  const finalTableY = (doc as any).lastAutoTable?.finalY || 160;

  // 9. Financial Summary Section (Clean right-aligned breakdown with ₹)
  let sumY = finalTableY + 4;
  const sumLabelX = 114;
  const sumValX = W - MX;

  const drawSummaryLine = (label: string, val: string, isBold: boolean = false, isGrand: boolean = false) => {
    if (isGrand) {
      doc.setDrawColor(...GOLD);
      doc.setLineWidth(0.3);
      doc.line(sumLabelX, sumY - 1, sumValX, sumY - 1);
    }
    doc.setFont(isBold ? fontBold : fontRegular, isBold ? "bold" : "normal");
    doc.setFontSize(isGrand ? 9.5 : 8);
    doc.setTextColor(isGrand ? NAVY[0] : MUTED[0], isGrand ? NAVY[1] : MUTED[1], isGrand ? NAVY[2] : MUTED[2]);
    doc.text(label, sumLabelX, sumY);

    doc.setFont(isBold ? fontBold : fontRegular, isBold ? "bold" : "normal");
    doc.setFontSize(isGrand ? 12 : 8.5);
    doc.setTextColor(...NAVY);
    doc.text(val, sumValX, sumY, { align: "right" });

    if (isGrand) {
      doc.setDrawColor(...NAVY);
      doc.setLineWidth(0.35);
      doc.line(sumLabelX, sumY + 2.5, sumValX, sumY + 2.5);
      sumY += 6.5;
    } else {
      sumY += 4.2;
    }
  };

  const subtotalLabel = calculatedItems.length > 1
    ? `Subtotal (${calculatedItems.length} products, ${totalQty} units):`
    : `Subtotal (${totalQty} ${totalQty === 1 ? "item" : "items"}):`;
  drawSummaryLine(subtotalLabel, `₹ ${formatNum(totalItemsSubtotal)}`);

  if (totalDiscount > 0) {
    drawSummaryLine("Product Discount:", `-₹ ${formatNum(totalDiscount)}`);
  }

  drawSummaryLine("Taxable Base Value:", `₹ ${formatNum(totalTaxable)}`);

  if (isIntraState) {
    drawSummaryLine("CGST (Central Tax):", `₹ ${formatNum(totalCgst)}`);
    drawSummaryLine("SGST / UTGST (State Tax):", `₹ ${formatNum(totalSgst)}`);
  } else {
    drawSummaryLine("IGST (Integrated Tax):", `₹ ${formatNum(totalIgst)}`);
  }

  if (totalChargesVal > 0) {
    drawSummaryLine("Platform & Delivery Charges:", `₹ ${formatNum(totalChargesVal)}`);
  }

  drawSummaryLine("Grand Total:", `₹ ${formatNum(grandTotal)}`, true, true);

  doc.setFont(fontRegular, "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(...MUTED);
  doc.text(grandWords, sumValX, sumY, { align: "right" });

  // 10. Computer generated text (centered with top divider)
  const cgY = Math.max(sumY + 12, 235);
  doc.setDrawColor(...LINE_COLOR);
  doc.setLineWidth(0.2);
  doc.line(MX + 20, cgY, W - MX - 20, cgY);

  doc.setFont(fontRegular, "italic");
  doc.setFontSize(7.8);
  doc.setTextColor(...MUTED);
  doc.text("This is a computer generated invoice. No signature required.", W / 2, cgY + 4, { align: "center" });

  // 11. Thank you block (right bottom)
  const thanksY = H - 42;
  try {
    doc.addImage(VASTRAA_LOGO_DATA_URI, "PNG", W - MX - 35, thanksY - 14, 35, 10);
  } catch {}
  doc.setFont(fontRegular, "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...NAVY);
  doc.text("Thank You for shopping with VASTRAA!", W - MX, thanksY, { align: "right" });

  // 12. Footer
  const footY = H - 18;
  doc.setFont(fontBold, "bold");
  doc.setFontSize(7.2);
  doc.setTextColor(...TEXT_SMALL);
  doc.text("Returns Policy:", MX, footY);
  doc.setFont(fontRegular, "normal");
  const returnPolicyText =
    "At Vastraa we try to deliver perfectly each and every time. But in the off-chance that you need to return the item, please do so with the original packing, tags and invoice, without which it will be really difficult for us to act on your request. Terms and conditions apply.";
  doc.text(returnPolicyText, MX + 20, footY, { maxWidth: W - 2 * MX - 20 });

  doc.setDrawColor(...LINE_COLOR);
  doc.setLineDashPattern([0.5, 0.5], 0);
  doc.line(MX, footY + 7, W - MX, footY + 7);
  doc.setLineDashPattern([], 0);

  doc.setFont(fontRegular, "normal");
  doc.text("Contact VASTRAA: support@vastraa.com || www.vastraa.com", MX, footY + 11);
  doc.setFont(fontBold, "bold");
  doc.text("E. & O.E.    page 1 of 2", W - MX, footY + 11, { align: "right" });

  // ===========================================================================
  // PAGE 2: BILL OF SUPPLY
  // ===========================================================================

  doc.addPage("a4", "portrait");

  // 1. Top bar: Navy bar + Gold border
  doc.setFillColor(...NAVY);
  doc.rect(0, 0, W, 4, "F");
  doc.setFillColor(...GOLD);
  doc.rect(0, 4, W, 1.2, "F");

  // 2. Header
  try {
    doc.addImage(VASTRAA_LOGO_DATA_URI, "PNG", MX, 8, 62, 17);
  } catch {}

  doc.setFont(fontSerif, "bold");
  doc.setFontSize(16);
  doc.setTextColor(...NAVY);
  doc.text("BILL OF SUPPLY", 125, 16, { align: "center" });

  if (qrDataUri) {
    try {
      doc.addImage(qrDataUri, "PNG", W - MX - 24, 7, 24, 24);
    } catch {}
  }

  // Gold rule
  doc.setDrawColor(...GOLD);
  doc.setLineWidth(0.3);
  doc.line(MX, 32, W - MX, 32);

  let p2Y = 35;

  // Box helper
  function drawInfoBox(y: number, h: number) {
    doc.setDrawColor(...LINE_COLOR);
    doc.setLineWidth(0.25);
    doc.rect(MX, y, W - 2 * MX, h);
  }

  // Box 1: Bill of Supply Details & Transaction
  drawInfoBox(p2Y, 20);
  drawColHeader("Bill of Supply Details", MX + 3, p2Y + 4, 85);
  doc.setFont(fontRegular, "normal");
  doc.setFontSize(8);
  doc.setTextColor(...TEXT_DARK);
  doc.text(`Bill of Supply Number : ${bosNumber}`, MX + 3, p2Y + 8.5);
  doc.text(`Bill of Supply Date : ${invDate}`, MX + 3, p2Y + 12.5);
  doc.text(`Order Number : ${orderRef}`, MX + 3, p2Y + 16.5);

  drawColHeader("Transaction", MX + 95, p2Y + 4, 85);
  doc.text(`Nature of transaction : ${isIntraState ? "INTRA" : "INTER"}`, MX + 95, p2Y + 8.5);
  doc.text("Nature Of Supply : Service", MX + 95, p2Y + 12.5);

  p2Y += 23;

  // Box 2: Billed From & Billed To
  drawInfoBox(p2Y, 24);
  drawColHeader("Billed From", MX + 3, p2Y + 4, 85);
  doc.setFont(fontBold, "bold");
  doc.text("Vastraa", MX + 3, p2Y + 8.5);
  doc.setFont(fontRegular, "normal");
  doc.text("Add Vastraa registered address here", MX + 3, p2Y + 12.5);
  doc.text("GSTIN : 27AACCT1234A1Z5", MX + 3, p2Y + 16.5);

  drawColHeader("Billed To", MX + 95, p2Y + 4, 85);
  doc.setFont(fontBold, "bold");
  doc.text(customerName, MX + 95, p2Y + 8.5);
  doc.setFont(fontRegular, "normal");
  doc.text(`${line1}, ${line2}, India - ${customerPin}`, MX + 95, p2Y + 12.5);
  doc.text(`State : ${customerState}`, MX + 95, p2Y + 16.5);
  doc.text(`State Code : ${isIntraState ? "IN-MH" : "IN-XX"}    Place of Supply : ${customerState.toUpperCase()}`, MX + 95, p2Y + 20.5);

  p2Y += 27;

  // Box 3: Shipped From & Shipped To
  drawInfoBox(p2Y, 15);
  drawColHeader("Shipped From", MX + 3, p2Y + 4, 85);
  doc.setFont(fontRegular, "normal");
  doc.text(`${sellerName}, ${sellerAddress}`, MX + 3, p2Y + 9);

  drawColHeader("Shipped To", MX + 95, p2Y + 4, 85);
  doc.setFont(fontBold, "bold");
  doc.text(customerName, MX + 95, p2Y + 8.5);
  doc.setFont(fontRegular, "normal");
  doc.text(`${line1}, ${line2}, ${customerState} - ${customerPin}`, MX + 95, p2Y + 12.5);

  p2Y += 18;

  // Table 1 (Charges / BOS)
  const chargesHead = isIntraState
    ? [["PARTICULARS", "SAC", "QTY", "GROSS AMOUNT\n₹", "TAXABLE VALUE\n₹", "SGST\n₹", "CGST\n₹", "TOTAL\n₹"]]
    : [["PARTICULARS", "SAC", "QTY", "GROSS AMOUNT\n₹", "TAXABLE VALUE\n₹", "IGST\n₹", "TOTAL\n₹"]];

  const chargesRows = isIntraState
    ? [
        [
          "Platform Fee",
          "998599\nCGST 0.0 %\nSGST 0.0 %",
          "1.0",
          `₹ ${formatNum(platformFeeVal)}`,
          `₹ ${formatNum(platformFeeVal)}`,
          "₹ 0.00",
          "₹ 0.00",
          `₹ ${formatNum(platformFeeVal)}`,
        ],
        [
          "Shipping Fee",
          "996511\nCGST 0.0 %\nSGST 0.0 %",
          "1.0",
          `₹ ${formatNum(shippingFeeVal)}`,
          `₹ ${formatNum(shippingFeeVal)}`,
          "₹ 0.00",
          "₹ 0.00",
          shippingFeeVal === 0 ? "FREE" : `₹ ${formatNum(shippingFeeVal)}`,
        ],
        [
          "",
          "Total",
          "2.0",
          `₹ ${formatNum(totalChargesVal)}`,
          `₹ ${formatNum(totalChargesVal)}`,
          "₹ 0.00",
          "₹ 0.00",
          `₹ ${formatNum(totalChargesVal)}`,
        ],
      ]
    : [
        [
          "Platform Fee",
          "998599\nIGST 0.0 %",
          "1.0",
          `₹ ${formatNum(platformFeeVal)}`,
          `₹ ${formatNum(platformFeeVal)}`,
          "₹ 0.00",
          `₹ ${formatNum(platformFeeVal)}`,
        ],
        [
          "Shipping Fee",
          "996511\nIGST 0.0 %",
          "1.0",
          `₹ ${formatNum(shippingFeeVal)}`,
          `₹ ${formatNum(shippingFeeVal)}`,
          "₹ 0.00",
          shippingFeeVal === 0 ? "FREE" : `₹ ${formatNum(shippingFeeVal)}`,
        ],
        [
          "",
          "Total",
          "2.0",
          `₹ ${formatNum(totalChargesVal)}`,
          `₹ ${formatNum(totalChargesVal)}`,
          "₹ 0.00",
          `₹ ${formatNum(totalChargesVal)}`,
        ],
      ];

  autoTable(doc, {
    startY: p2Y,
    head: chargesHead,
    body: chargesRows,
    margin: { left: MX, right: MX },
    theme: "plain",
    headStyles: {
      fillColor: NAVY,
      textColor: [255, 255, 255],
      font: fontBold,
      fontSize: 7.4,
      fontStyle: "bold",
      halign: "right",
      cellPadding: 2,
    },
    styles: {
      font: fontRegular,
      fontSize: 8,
      cellPadding: 2,
      textColor: TEXT_DARK,
      lineColor: LINE_COLOR,
      lineWidth: 0.15,
      halign: "right",
    },
    columnStyles: {
      0: { halign: "left", cellWidth: 36 },
      1: { halign: "left", cellWidth: 32 },
    },
    didParseCell: (data) => {
      if (data.row.index === chargesRows.length - 1) {
        data.cell.styles.fillColor = GOLD_LIGHT;
        data.cell.styles.fontStyle = "bold";
        data.cell.styles.textColor = NAVY;
      }
    },
  });

  p2Y = (doc as any).lastAutoTable?.finalY + 5;

  // Banner: DETAILS OF GOODS SHIPPED
  doc.setFillColor(...GOLD_LIGHT);
  doc.rect(MX, p2Y, W - 2 * MX, 6, "F");
  doc.setFillColor(...GOLD);
  doc.rect(MX, p2Y, 1.2, 6, "F");

  doc.setFont(fontBold, "bold");
  doc.setFontSize(8.4);
  doc.setTextColor(...NAVY);
  doc.text("DETAILS OF GOODS SHIPPED", MX + 4, p2Y + 4.2);

  p2Y += 7.5;

  // Table 2 (Goods Shipped)
  const goodsHead = [["DESCRIPTION OF GOODS", "QTY", "GROSS WEIGHT OF CONSIGNMENT", "VALUE OF GOODS\n₹"]];
  const goodsRows = calculatedItems.map((it) => [
    `${it.name} (${it.qty})`,
    `${it.qty}.0`,
    "—",
    formatNum(it.total),
  ]);

  autoTable(doc, {
    startY: p2Y,
    head: goodsHead,
    body: goodsRows,
    margin: { left: MX, right: MX },
    theme: "plain",
    headStyles: {
      fillColor: NAVY,
      textColor: [255, 255, 255],
      font: fontBold,
      fontSize: 7.4,
      fontStyle: "bold",
      halign: "right",
      cellPadding: 2,
    },
    styles: {
      font: fontRegular,
      fontSize: 8,
      cellPadding: 2,
      textColor: TEXT_DARK,
      lineColor: LINE_COLOR,
      lineWidth: 0.15,
      halign: "right",
    },
    columnStyles: {
      0: { halign: "left", cellWidth: 90 },
      1: { halign: "center", cellWidth: 20 },
      2: { halign: "center", cellWidth: 40 },
      3: { halign: "right", cellWidth: 36 },
    },
  });

  p2Y = (doc as any).lastAutoTable?.finalY + 5;

  // Box 4: Consignor / Consignee details
  drawInfoBox(p2Y, 20);
  doc.setFont(fontBold, "bold");
  doc.setFontSize(8);
  doc.setTextColor(...TEXT_DARK);
  doc.text("Consignor details:", MX + 3, p2Y + 4.5);
  doc.setFont(fontRegular, "normal");
  doc.text(`${sellerName} (on behalf of VASTRAA)`, MX + 3, p2Y + 8.5);

  doc.setFont(fontBold, "bold");
  doc.text("Consignee details:", MX + 3, p2Y + 13.5);
  doc.setFont(fontRegular, "normal");
  doc.text(customerName, MX + 3, p2Y + 17.5);

  doc.setFont(fontBold, "bold");
  doc.text("Place of Origin :", MX + 95, p2Y + 4.5);
  doc.setFont(fontRegular, "normal");
  doc.text(sellerAddress, MX + 120, p2Y + 4.5);

  doc.setFont(fontBold, "bold");
  doc.text("Destination :", MX + 95, p2Y + 10);
  doc.setFont(fontRegular, "normal");
  doc.text(`${customerName}, ${line1}, ${line2}, ${customerState} - ${customerPin}`, MX + 95, p2Y + 14, {
    maxWidth: 85,
  });

  p2Y += 23;

  // Paid banner: Navy box with gold total
  doc.setFillColor(...NAVY);
  doc.rect(MX, p2Y, W - 2 * MX, 12, "F");

  doc.setFont(fontRegular, "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(255, 255, 255);
  const payMethodDisplay = order.paymentMethod?.toUpperCase() || "UPI";
  doc.text(`Order total paid via ${payMethodDisplay} (Tax Invoice + Bill of Supply)`, MX + 4, p2Y + 4.5);

  doc.setFontSize(7.5);
  doc.setTextColor(203, 213, 225);
  doc.text(grandWords, MX + 4, p2Y + 9);

  doc.setFont(fontBold, "bold");
  doc.setFontSize(12);
  doc.setTextColor(...PAID_GOLD);
  doc.text(`₹ ${formatNum(grandTotal)}`, W - MX - 4, p2Y + 7.5, { align: "right" });

  p2Y += 16;

  // Disclaimers
  doc.setFont(fontRegular, "normal");
  doc.setFontSize(8);
  doc.setTextColor(...TEXT_SMALL);
  doc.text("Is the supply subject to reverse charge: No", MX, p2Y);
  doc.text("Signature / Digital Signature: Computer generated — no signature required.", MX, p2Y + 4.5);

  // Footer
  const foot2Y = H - 10;
  doc.setFont(fontBold, "bold");
  doc.setFontSize(7.6);
  doc.setTextColor(...TEXT_SMALL);
  doc.text("E. & O.E.    page 2 of 2", W - MX, foot2Y, { align: "right" });

  return doc;
}

// ─── Main Generator (Used across components) ──────────────────────────────────

export async function generateInvoice(order: InvoiceOrder): Promise<void> {
  // 1. Try official high-fidelity server PDF download first
  const serverDownloaded = await downloadOfficialInvoicePdf(order.id, order.displayId);
  if (serverDownloaded) return;

  // 2. Fall back to identical client-side 2-page PDF generator
  const doc = await renderClientInvoicePdf(order);
  const ref = order.displayId || order.id || "order";
  doc.save(`Invoice-INV-${ref}.pdf`);
}
