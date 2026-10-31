import fs from "fs";
import path from "path";
import PDFDocument from "../node_modules/.pnpm/pdfkit@0.19.1/node_modules/pdfkit/js/pdfkit.js";

const artifactDir = "C:\\Users\\Administrator\\.gemini\\antigravity-ide\\brain\\04bbd62e-906d-4780-b9c6-db487ed079eb";
const pdfPath = path.join(artifactDir, "sample_invoice_1000.pdf");

// Sample Order Data (₹1000 Base Price, NEW V2 Pricing Model)
const order = {
  invoiceNumber: "INV-2026-V1001",
  orderId: "V1001",
  date: "06 Oct 2026",
  seller: {
    name: "Yeola Weaver Heritage",
    gstin: "27AAACV1234A1Z5",
    state: "Maharashtra",
    address: "Yeola Handloom Hub, Nashik, MH - 423401",
  },
  buyer: {
    name: "Ananya Sharma",
    gstin: "URP (Unregistered Person)",
    state: "Maharashtra",
    address: "B-402 Sunshine Heights, Bandra West, Mumbai, MH - 400050",
  },
  item: {
    name: "Pure Silk Handwoven Paithani Saree",
    hsn: "5007",
    quantity: 1,
    basePriceRupees: 1000.0,
    shippingRupees: 100.0,
    taxableRupees: 1100.0,
    cgstRupees: 27.50,
    sgstRupees: 27.50,
    igstRupees: 0.0,
    totalRupees: 1155.0,
  },
};

const doc = new PDFDocument({ margin: 40, size: "A4" });
const stream = fs.createWriteStream(pdfPath);
doc.pipe(stream);

// Header
doc.rect(0, 0, 595.28, 70).fill("#0A1F44");
doc.fillColor("#C7CCD1").fontSize(22).font("Helvetica-Bold").text("VASTRAA", 40, 18);
doc.fillColor("#F4F5F7").fontSize(9).font("Helvetica").text("Authentic Handloom Sarees", 40, 42);

doc.fillColor("#F4F5F7").fontSize(18).font("Helvetica-Bold").text("TAX INVOICE", 400, 18, { align: "right" });
doc.fillColor("#C7CCD1").fontSize(10).font("Helvetica").text(order.invoiceNumber, 400, 42, { align: "right" });

doc.y = 85;

// Invoice & Party Meta
doc.fillColor("#0A1F44").fontSize(11).font("Helvetica-Bold").text("Seller Details", 40, 90);
doc.fillColor("#333333").fontSize(9).font("Helvetica")
  .text(order.seller.name, 40, 105)
  .text(`GSTIN: ${order.seller.gstin}`)
  .text(`State: ${order.seller.state}`)
  .text(order.seller.address);

doc.fillColor("#0A1F44").fontSize(11).font("Helvetica-Bold").text("Buyer / Delivery Details", 300, 90);
doc.fillColor("#333333").fontSize(9).font("Helvetica")
  .text(order.buyer.name, 300, 105)
  .text(`GSTIN: ${order.buyer.gstin}`)
  .text(`State: ${order.buyer.state}`)
  .text(order.buyer.address);

doc.y = 175;
doc.strokeColor("#C7CCD1").lineWidth(1).moveTo(40, doc.y).lineTo(555, doc.y).stroke();

// Table Header
const tableTop = doc.y + 15;
doc.rect(40, tableTop, 515, 24).fill("#F4F5F7");
doc.fillColor("#0A1F44").fontSize(9).font("Helvetica-Bold");
doc.text("Item Description", 45, tableTop + 7);
doc.text("HSN", 240, tableTop + 7);
doc.text("Qty", 280, tableTop + 7);
doc.text("Base Price", 320, tableTop + 7, { width: 60, align: "right" });
doc.text("Taxable", 390, tableTop + 7, { width: 70, align: "right" });
doc.text("Total", 470, tableTop + 7, { width: 75, align: "right" });

// Table Body
const rowTop = tableTop + 30;
doc.fillColor("#333333").fontSize(9).font("Helvetica");
doc.text(order.item.name, 45, rowTop);
doc.text(order.item.hsn, 240, rowTop);
doc.text(String(order.item.quantity), 280, rowTop);
doc.text(`₹${order.item.basePriceRupees.toFixed(2)}`, 320, rowTop, { width: 60, align: "right" });
doc.text(`₹${order.item.basePriceRupees.toFixed(2)}`, 390, rowTop, { width: 70, align: "right" });
doc.text(`₹${(order.item.basePriceRupees * 1.05).toFixed(2)}`, 470, rowTop, { width: 75, align: "right" });

doc.y = rowTop + 40;
doc.strokeColor("#E5E8EC").lineWidth(0.5).moveTo(40, doc.y).lineTo(555, doc.y).stroke();

// Totals Summary Box
const totalsTop = doc.y + 15;
doc.rect(300, totalsTop, 255, 124).fill("#F4F5F7");
doc.strokeColor("#E5E8EC").rect(300, totalsTop, 255, 124).stroke();

let ty = totalsTop + 10;
const fmtR = (v) => `₹${v.toFixed(2)}`;

doc.fillColor("#333333").fontSize(9).font("Helvetica");

doc.text("Items Base Price:", 310, ty);
doc.text(fmtR(order.item.basePriceRupees), 450, ty, { width: 95, align: "right" });
ty += 16;

doc.text("Shipping Fee:", 310, ty);
doc.text(`+ ${fmtR(order.item.shippingRupees)}`, 450, ty, { width: 95, align: "right" });
ty += 16;

doc.font("Helvetica-Bold").text("Taxable Base Amount:", 310, ty);
doc.text(fmtR(order.item.taxableRupees), 450, ty, { width: 95, align: "right" });
ty += 16;
doc.font("Helvetica");

doc.text("CGST (2.5%):", 310, ty);
doc.text(`+ ${fmtR(order.item.cgstRupees)}`, 450, ty, { width: 95, align: "right" });
ty += 16;

doc.text("SGST (2.5%):", 310, ty);
doc.text(`+ ${fmtR(order.item.sgstRupees)}`, 450, ty, { width: 95, align: "right" });
ty += 20;

doc.rect(300, ty - 4, 255, 26).fill("#0A1F44");
doc.fillColor("#C7CCD1").fontSize(11).font("Helvetica-Bold");
doc.text("Final Total (Customer Pays):", 310, ty + 3);
doc.fillColor("#FFFFFF").text(fmtR(order.item.totalRupees), 450, ty + 3, { width: 95, align: "right" });

// Footer
doc.fillColor("#666666").fontSize(8).font("Helvetica")
  .text("This is a computer-generated tax invoice. Place of Supply: Maharashtra (Intra-state CGST+SGST).", 40, 750, { align: "center" });

doc.end();

stream.on("finish", () => {
  console.log("Sample Invoice PDF for ₹1,000 item generated successfully at:", pdfPath);
});
