import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

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

const MAROON = [123, 28, 44] as [number, number, number];
const GOLD = [201, 168, 76] as [number, number, number];
const IVORY = [250, 246, 238] as [number, number, number];
const DARK = [40, 40, 40] as [number, number, number];
const GRAY = [120, 120, 120] as [number, number, number];

const paymentLabels: Record<string, string> = {
  upi: "UPI",
  card: "Credit / Debit Card",
  credit_card: "Credit Card",
  debit_card: "Debit Card",
  net_banking: "Net Banking",
  wallet: "Wallet",
  cod: "Cash on Delivery",
};

function fmt(n: number): string {
  return `Rs. ${n.toLocaleString("en-IN")}`;
}

export function generateInvoice(order: InvoiceOrder): void {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const W = doc.internal.pageSize.getWidth();

  doc.setFillColor(...MAROON);
  doc.rect(0, 0, W, 30, "F");

  doc.setFontSize(22);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(201, 168, 76);
  doc.text("TwirlDrape", 14, 14);

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(250, 246, 238);
  doc.text("Premium Saree Collection", 14, 20);
  doc.text("support@twirldrape.com", 14, 25);

  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...IVORY);
  doc.text("INVOICE", W - 14, 14, { align: "right" });

  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...IVORY);
  const placedDate = new Date(order.createdAt).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  doc.text(`Date: ${placedDate}`, W - 14, 20, { align: "right" });
  doc.text(`Status: ${order.status.replace(/_/g, " ").toUpperCase()}`, W - 14, 25, { align: "right" });

  let y = 38;

  doc.setFillColor(...IVORY);
  doc.rect(0, y - 3, W, 24, "F");

  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...GRAY);
  doc.text("ORDER ID", 14, y + 1);
  doc.text("SHIP TO", W / 2, y + 1);

  doc.setFont("helvetica", "normal");
  doc.setTextColor(...DARK);
  doc.setFontSize(7.5);
  doc.text(`#${order.id}`, 14, y + 6);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.text(order.address.name, W / 2, y + 6);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(...GRAY);

  const addrParts = [
    order.address.line1,
    order.address.line2,
    `${order.address.city}, ${order.address.state} - ${order.address.pincode}`,
    order.address.phone,
  ].filter(Boolean) as string[];

  addrParts.forEach((line, i) => {
    doc.text(line, W / 2, y + 11 + i * 4);
  });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...GRAY);
  doc.text("PAYMENT", 14, y + 11);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(...DARK);
  doc.text(paymentLabels[order.paymentMethod] ?? order.paymentMethod, 14, y + 16);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...GRAY);
  doc.text("DELIVERY", 14, y + 20);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(...DARK);
  doc.text(order.deliveryMethod === "express" ? "Express (3 days)" : "Standard (7 days)", 14, y + 25);

  y += 32;

  doc.setDrawColor(...GOLD);
  doc.setLineWidth(0.3);
  doc.line(14, y, W - 14, y);
  y += 5;

  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...MAROON);
  doc.text("Items Ordered", 14, y);
  y += 4;

  const tableBody = order.items.map((item) => [
    item.name,
    item.vendorName,
    String(item.quantity),
    fmt(item.price),
    fmt(item.price * item.quantity),
  ]);

  autoTable(doc, {
    startY: y,
    head: [["Product", "Vendor", "Qty", "Unit Price", "Total"]],
    body: tableBody,
    margin: { left: 14, right: 14 },
    headStyles: {
      fillColor: MAROON,
      textColor: [201, 168, 76],
      fontStyle: "bold",
      fontSize: 8,
    },
    bodyStyles: {
      fontSize: 8,
      textColor: DARK,
    },
    alternateRowStyles: {
      fillColor: [252, 249, 244],
    },
    columnStyles: {
      0: { cellWidth: 70 },
      1: { cellWidth: 40 },
      2: { cellWidth: 12, halign: "center" },
      3: { cellWidth: 28, halign: "right" },
      4: { cellWidth: 28, halign: "right" },
    },
    styles: {
      lineColor: [230, 220, 200],
      lineWidth: 0.1,
    },
  });

  y = (doc as any).lastAutoTable.finalY + 8;

  const totals: [string, string, boolean][] = [
    ["Subtotal", fmt(order.subtotal), false],
  ];

  if (order.discount > 0) {
    const label = order.couponCode
      ? `Discount (${order.couponCode})`
      : "Discount";
    totals.push([label, `- ${fmt(order.discount)}`, false]);
  }

  totals.push(["Shipping", order.shipping === 0 ? "Free" : fmt(order.shipping), false]);
  totals.push(["GST", fmt(order.tax), false]);
  totals.push(["Grand Total", fmt(order.total), true]);

  const colW = 50;
  const startX = W - 14 - colW * 2;

  totals.forEach(([label, value, isBold]) => {
    if (isBold) {
      doc.setFillColor(...MAROON);
      doc.rect(startX - 2, y - 4, colW * 2 + 4, 8, "F");
      doc.setTextColor(...GOLD);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
    } else {
      doc.setTextColor(...GRAY);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
    }
    doc.text(label, startX + 2, y);
    doc.text(value, W - 14, y, { align: "right" });
    y += isBold ? 10 : 7;
  });

  const pageH = doc.internal.pageSize.getHeight();

  doc.setFillColor(...MAROON);
  doc.rect(0, pageH - 18, W, 18, "F");

  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(201, 168, 76);
  doc.text("Thank you for shopping with TwirlDrape!", W / 2, pageH - 11, { align: "center" });
  doc.setTextColor(250, 246, 238);
  doc.setFontSize(7);
  doc.text("For queries: support@twirldrape.com", W / 2, pageH - 6, { align: "center" });

  doc.save(`invoice-${order.id}.pdf`);
}
