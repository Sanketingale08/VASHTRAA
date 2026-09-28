import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

// ─── Types ───────────────────────────────────────────────────────────────────

type OrderItem = {
  productId: string;
  name: string;
  price: number;
  quantity: number;
  images: string[];
  vendorName: string;
};

type OrderAddress = {
  name: string;
  phone?: string;
  line1: string;
  line2?: string;
  city: string;
  state: string;
  pincode: string;
};

type InvoiceOrder = {
  id: string;
  displayId?: string | null;
  createdAt: string;
  items: OrderItem[];
  address: OrderAddress;
  paymentMethod: string;
  deliveryMethod: string;
  subtotal: number;
  discount: number;
  shipping: number;
  tax: number;
  total: number;
  couponCode?: string | null;
  status: string;
};

// ─── Brand palette ───────────────────────────────────────────────────────────

const MAROON  = [10,  31,  68] as [number, number, number];   // #0A1F44 Deep Navy
const GOLD    = [199, 204, 209] as [number, number, number];   // #C7CCD1 Platinum Highlight
const CREAM   = [244, 245, 247] as [number, number, number];   // #F4F5F7 Soft Platinum Light
const IVORY   = [229, 232, 236] as [number, number, number];   // #E5E8EC Light Platinum
const DARK    = [ 11,  12,  16] as [number, number, number];   // #0B0C10 Near-black
const GRAY    = [120, 120, 120] as [number, number, number];   // mid-gray
const LGRAY   = [200, 196, 190] as [number, number, number];   // light gray for dividers
const GREEN   = [ 22, 101,  52] as [number, number, number];   // paid badge
const ORANGE  = [154,  52,  18] as [number, number, number];   // refunded badge
const RED     = [153,  27,  27] as [number, number, number];   // cancelled badge

// ─── Helpers ─────────────────────────────────────────────────────────────────

const paymentLabels: Record<string, string> = {
  upi:         "UPI",
  card:        "Credit / Debit Card",
  credit_card: "Credit Card",
  debit_card:  "Debit Card",
  net_banking: "Net Banking",
  wallet:      "Wallet",
  cod:         "Cash on Delivery",
};

function fmt(n: number): string {
  return `Rs. ${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function invoiceNumber(order: InvoiceOrder): string {
  const ref = order.displayId ?? order.id;
  return `INV-${ref}`;
}

function fmtOrderId(order: InvoiceOrder): string {
  return order.displayId ?? order.id;
}

/** Resolve status → { label, badge color } */
function statusBadge(status: string): { label: string; color: [number, number, number] } {
  const s = status.toLowerCase();
  if (s === "delivered" || s === "confirmed" || s === "processing" || s === "shipped") {
    return { label: "PAID", color: GREEN };
  }
  if (s.includes("return") || s.includes("refund")) {
    return { label: "REFUNDED", color: ORANGE };
  }
  if (s === "cancelled") {
    return { label: "CANCELLED", color: RED };
  }
  return { label: status.replace(/_/g, " ").toUpperCase(), color: GRAY };
}

/** Draw a solid rounded rectangle (jsPDF has no native roundRect — approximate with a regular rect) */
function filledRect(
  doc: jsPDF,
  x: number, y: number, w: number, h: number,
  color: [number, number, number],
): void {
  doc.setFillColor(...color);
  doc.roundedRect(x, y, w, h, 1.5, 1.5, "F");
}

/** Print a small section heading */
function sectionLabel(doc: jsPDF, text: string, x: number, y: number): void {
  doc.setFontSize(6.5);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...GOLD);
  doc.text(text.toUpperCase(), x, y);
}

/** Print body text in DARK or GRAY */
function bodyText(
  doc: jsPDF,
  text: string, x: number, y: number,
  opts?: { bold?: boolean; size?: number; color?: [number, number, number]; align?: "left" | "right" | "center" },
): void {
  doc.setFontSize(opts?.size ?? 8);
  doc.setFont("helvetica", opts?.bold ? "bold" : "normal");
  doc.setTextColor(...(opts?.color ?? DARK));
  doc.text(text, x, y, opts?.align ? { align: opts.align } : undefined);
}

// ─── Main generator ──────────────────────────────────────────────────────────

export function generateInvoice(order: InvoiceOrder): void {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const W   = doc.internal.pageSize.getWidth();   // 210
  const H   = doc.internal.pageSize.getHeight();  // 297
  const MX  = 14;   // horizontal margin

  // ── 1. Header bar ─────────────────────────────────────────────────────────
  const HEADER_H = 38;
  doc.setFillColor(...MAROON);
  doc.rect(0, 0, W, HEADER_H, "F");

  // Gold accent line along bottom of header
  doc.setFillColor(...GOLD);
  doc.rect(0, HEADER_H - 1.5, W, 1.5, "F");

  // Brand name — large, gold
  doc.setFontSize(24);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...GOLD);
  doc.text("VASTRAA", MX, 16);

  // Tagline
  doc.setFontSize(7.5);
  doc.setFont("helvetica", "italic");
  doc.setTextColor(...CREAM);
  doc.text("Authentic Paithani & Designer Sarees", MX, 22);

  // Website & support beneath tagline
  doc.setFontSize(6.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(220, 210, 185);
  doc.text("www.vastraa.com  |  support@vastraa.com", MX, 27.5);
  doc.text("GSTIN: 27AACCT1234A1Z5", MX, 32.5);

  // Right side: INVOICE heading + invoice number + date
  doc.setFontSize(22);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...CREAM);
  doc.text("INVOICE", W - MX, 15, { align: "right" });

  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...GOLD);
  doc.text(invoiceNumber(order), W - MX, 22, { align: "right" });

  const placedDate = new Date(order.createdAt).toLocaleDateString("en-IN", {
    day:   "numeric",
    month: "long",
    year:  "numeric",
  });
  doc.setTextColor(...CREAM);
  doc.setFontSize(7.5);
  doc.text(`Date: ${placedDate}`, W - MX, 27.5, { align: "right" });

  // Order ID (smaller)
  doc.setFontSize(6.5);
  doc.setTextColor(200, 190, 170);
  doc.text(`Order: ${fmtOrderId(order)}`, W - MX, 32.5, { align: "right" });

  // ── 2. Status badge ───────────────────────────────────────────────────────
  const badge = statusBadge(order.status);
  const badgeLabel = badge.label;
  const badgeW     = doc.getTextWidth(badgeLabel) / doc.internal.scaleFactor + 8;
  const badgeX     = W / 2 - badgeW / 2;
  const badgeY     = HEADER_H + 5;

  filledRect(doc, badgeX, badgeY, badgeW, 7, badge.color);
  doc.setFontSize(7);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(255, 255, 255);
  doc.text(badgeLabel, W / 2, badgeY + 4.8, { align: "center" });

  let y = HEADER_H + 18;

  // ── 3. Details grid — two columns ─────────────────────────────────────────
  const COL1_X = MX;
  const COL2_X = W / 2 + 4;

  // Thin ivory background behind the info strip
  doc.setFillColor(...IVORY);
  doc.rect(0, y - 4, W, 52, "F");

  // Column 1 — Customer Details
  sectionLabel(doc, "Customer Details", COL1_X, y);
  y += 5.5;
  bodyText(doc, order.address.name, COL1_X, y, { bold: true, size: 8.5 });
  y += 5;
  if (order.address.phone) {
    bodyText(doc, `Ph: ${order.address.phone}`, COL1_X, y, { size: 7.5, color: GRAY });
    y += 4.5;
  }

  // Column 2 — Seller / Vendor Details (derive from items)
  const vendorNames = [...new Set(order.items.map(i => i.vendorName).filter(Boolean))];
  let col2Y = y - (order.address.phone ? 10 : 5.5);
  col2Y -= 5.5; // back to where sectionLabel starts
  sectionLabel(doc, "Seller Details", COL2_X, col2Y);
  col2Y += 5.5;
  vendorNames.forEach((v) => {
    bodyText(doc, v, COL2_X, col2Y, { bold: true, size: 8.5 });
    col2Y += 5;
  });
  bodyText(doc, "India", COL2_X, col2Y, { size: 7.5, color: GRAY });

  // Ensure y is below both columns
  y = Math.max(y, col2Y + 5) + 4;

  // ── 4. Address grid ───────────────────────────────────────────────────────
  // Both billing and shipping use order.address (single address model)
  const addrParts = [
    order.address.line1,
    order.address.line2,
    `${order.address.city}, ${order.address.state}`,
    `PIN: ${order.address.pincode}`,
  ].filter(Boolean) as string[];

  sectionLabel(doc, "Billing Address", COL1_X, y);
  sectionLabel(doc, "Shipping Address", COL2_X, y);
  y += 5.5;

  addrParts.forEach((line) => {
    bodyText(doc, line, COL1_X, y, { size: 7.5, color: DARK });
    bodyText(doc, line, COL2_X, y, { size: 7.5, color: DARK });
    y += 4;
  });

  y += 4;

  // ── 5. Payment & Delivery strip ───────────────────────────────────────────
  doc.setFillColor(238, 232, 218);
  doc.rect(0, y - 2, W, 12, "F");

  sectionLabel(doc, "Payment Method", COL1_X, y + 2);
  bodyText(
    doc,
    paymentLabels[order.paymentMethod] ?? order.paymentMethod.replace(/_/g, " "),
    COL1_X, y + 7,
    { bold: true, size: 7.5 },
  );

  sectionLabel(doc, "Delivery Method", COL2_X, y + 2);
  bodyText(
    doc,
    order.deliveryMethod === "express" ? "Express Delivery (3 working days)" : "Standard Delivery (7 working days)",
    COL2_X, y + 7,
    { bold: true, size: 7.5 },
  );

  y += 16;

  // ── 6. Gold divider ───────────────────────────────────────────────────────
  doc.setDrawColor(...GOLD);
  doc.setLineWidth(0.5);
  doc.line(MX, y, W - MX, y);
  y += 6;

  // ── 7. Items table ────────────────────────────────────────────────────────
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...MAROON);
  doc.text("Items Ordered", MX, y);
  y += 5;

  // Build table rows: Name, Vendor, Qty, Unit Price, Item Total
  // Note: per-item discount/GST not in the data model — totals shown in summary
  const tableBody = order.items.map((item) => [
    item.name,
    item.vendorName || "—",
    String(item.quantity),
    fmt(item.price),
    fmt(item.price * item.quantity),
  ]);

  autoTable(doc, {
    startY: y,
    head: [["Product Name", "Vendor", "Qty", "Unit Price", "Total"]],
    body: tableBody,
    margin: { left: MX, right: MX },
    headStyles: {
      fillColor:  MAROON,
      textColor:  GOLD,
      fontStyle:  "bold",
      fontSize:   8,
      cellPadding: 4,
    },
    bodyStyles: {
      fontSize:    8,
      textColor:   DARK,
      cellPadding: 3.5,
    },
    alternateRowStyles: {
      fillColor: [252, 249, 244],
    },
    columnStyles: {
      0: { cellWidth: 68 },
      1: { cellWidth: 38 },
      2: { cellWidth: 12, halign: "center" },
      3: { cellWidth: 30, halign: "right" },
      4: { cellWidth: 30, halign: "right" },
    },
    styles: {
      lineColor: [230, 218, 195],
      lineWidth: 0.15,
      overflow:  "linebreak",
    },
    tableLineColor: GOLD,
    tableLineWidth: 0,
  });

  y = (doc as any).lastAutoTable.finalY + 8;

  // ── 8. Totals block ───────────────────────────────────────────────────────
  const TOTAL_COL_W = 52;
  const TOTAL_X     = W - MX - TOTAL_COL_W * 2;

  // Thin ivory background behind totals
  const totalsRowCount =
    3 + (order.discount > 0 ? 1 : 0) + (order.couponCode ? 0 : 0); // approx
  doc.setFillColor(...IVORY);
  doc.rect(TOTAL_X - 4, y - 4, TOTAL_COL_W * 2 + 8, (totalsRowCount + 1) * 7 + 20, "F");

  type TotalRow = [string, string, boolean];
  const totals: TotalRow[] = [
    ["Subtotal", fmt(order.subtotal), false],
  ];

  if (order.discount > 0) {
    const label = order.couponCode
      ? `Discount (${order.couponCode})`
      : "Discount";
    totals.push([label, `- ${fmt(order.discount)}`, false]);
  }

  totals.push(["Delivery Charges", order.shipping === 0 ? "FREE" : fmt(order.shipping), false]);
  totals.push(["GST (18%)", fmt(order.tax), false]);

  // Divider before grand total
  doc.setDrawColor(...LGRAY);
  doc.setLineWidth(0.2);

  totals.forEach(([label, value]) => {
    doc.line(TOTAL_X, y + 3, W - MX, y + 3);
    bodyText(doc, label, TOTAL_X + 2, y, { size: 7.5, color: GRAY });
    bodyText(doc, value, W - MX, y, { size: 7.5, color: DARK, align: "right" });
    y += 7;
  });

  // Grand total — maroon band
  y += 2;
  doc.setFillColor(...MAROON);
  doc.rect(TOTAL_X - 4, y - 5, TOTAL_COL_W * 2 + 8, 11, "F");
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...GOLD);
  doc.text("Grand Total", TOTAL_X + 2, y + 1.5);
  doc.text(fmt(order.total), W - MX, y + 1.5, { align: "right" });
  y += 14;

  // Payment status note
  const { label: paidLabel, color: paidColor } = statusBadge(order.status);
  filledRect(doc, TOTAL_X - 4, y, TOTAL_COL_W * 2 + 8, 8, paidColor);
  doc.setFontSize(7.5);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(255, 255, 255);
  doc.text(`Status: ${paidLabel}`, W / 2, y + 5.2, { align: "center" });

  // ── 9. Footer ─────────────────────────────────────────────────────────────
  const FOOTER_H = 22;
  const FOOTER_Y = H - FOOTER_H;

  doc.setFillColor(...MAROON);
  doc.rect(0, FOOTER_Y, W, FOOTER_H, "F");

  // Gold accent line on top of footer
  doc.setFillColor(...GOLD);
  doc.rect(0, FOOTER_Y, W, 1, "F");

  // Thank-you message
  doc.setFontSize(8.5);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...GOLD);
  doc.text("Thank you for shopping with VASTRAA!", W / 2, FOOTER_Y + 7, { align: "center" });

  // Support line
  doc.setFontSize(7);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...CREAM);
  doc.text(
    "For queries: support@vastraa.com  |  www.vastraa.com  |  GSTIN: 27AACCT1234A1Z5",
    W / 2, FOOTER_Y + 13, { align: "center" },
  );

  // Fine print
  doc.setFontSize(6);
  doc.setTextColor(200, 188, 165);
  doc.text(
    "This is a computer-generated invoice and does not require a physical signature.",
    W / 2, FOOTER_Y + 19, { align: "center" },
  );

  doc.save(`invoice-${order.id}.pdf`);
}
