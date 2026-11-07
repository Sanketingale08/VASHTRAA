import { describe, it, expect } from "vitest";
import { renderInvoiceHtml, generateInvoicePdf } from "../lib/invoiceRenderer";
import { buildInvoiceData, INVOICE_CONFIG } from "../lib/invoiceData";

describe("Invoice Alignment & Professional Layout Verification", () => {
  const sampleOrder = {
    id: "ORD-ALIGN-101",
    displayId: "V101",
    createdAt: "2026-11-06T12:00:00Z",
    paymentVerifiedAt: "2026-11-06T12:05:00Z",
    paymentStatus: "PAID",
    paymentMethod: "UPI",
    cashfreePaymentId: "cf_pay_test_987654",
    status: "processing",
    address: {
      name: "Ananya Sharma",
      phone: "+91 98765 43210",
      line1: "Flat 402, Golden Palms Residency",
      line2: "Opposite High Street Mall, Baner",
      city: "Pune",
      state: "Maharashtra",
      pincode: "411045",
      buyerGstin: "27AAACB1234D1Z2",
    },
    seller: {
      name: "Paithani Heritage Weaves",
      address: "Yeola Silk Cluster, Nashik District, Maharashtra - 423401",
      state_code: "27",
      gstin: "27AAACP9999M1Z8",
      pan: "AAACP9999M",
      regd_office: "Yeola Silk Cluster, Nashik, Maharashtra",
    },
    charges: [
      { name: "Platform Fee", sac: "998599", amount: 20.0, gst_rate: 0.0 },
      { name: "Shipping Fee", sac: "996511", amount: 0.0, gst_rate: 0.0, free_label: "FREE" },
    ],
    items: [
      {
        name: "Authentic Pure Silk Yeola Paithani Saree with Peacock Zari Border",
        category: "Sarees",
        sku: "PAI-SLK-001",
        hsn: "5007",
        quantity: 2,
        price: 4999.0,
        mrp: 6999.0,
        gst_rate: 5.0,
        image: "/images/artisan-handloom-saree.png",
      },
      {
        name: "Handwoven Chanderi Cotton Silk Dupatta",
        category: "Dupattas",
        sku: "CHN-DUP-002",
        hsn: "5208",
        quantity: 1,
        price: 1500.0,
        mrp: 1800.0,
        gst_rate: 5.0,
        image: null,
      },
    ],
  };

  it("1. Corrects all alignment issues and formats layout consistently", async () => {
    const { html, invoiceData } = await renderInvoiceHtml(sampleOrder);

    expect(html).toContain("<!DOCTYPE html>");
    expect(invoiceData.invoice.number).toBe("INV-V101");
    expect(invoiceData.totals.qty).toBe(3);
    // 4999 * 2 + 1500 = 11498.00 items subtotal
    expect(invoiceData.totals.items_subtotal).toBe(11498.0);
    // Grand total = 11498 + 20 (platform fee) = 11518.00
    expect(invoiceData.totals.grand).toBe(11518.0);
  });

  it("2. Invoice Header: VASTRAA logo on left, Invoice Number, Order ID, Date, Payment Status on right", async () => {
    const { html } = await renderInvoiceHtml(sampleOrder);

    // Left: VASTRAA logo
    expect(html).toMatch(/<div class="header-left">[\s\S]*?<img[^>]*class="company-logo"/i);

    // Right: Document title, Invoice Number, Order ID, Date, and Payment Status
    expect(html).toContain("TAX INVOICE");
    expect(html).toContain("INV-V101");
    expect(html).toContain("#V101");
    expect(html).toContain("06-11-2026");
    expect(html).toMatch(/pay-status-pill pay-status-paid[\s\S]*?PAID/i);
  });

  it("3. Product Table Alignment: All 8 columns properly aligned with headers matching cells", async () => {
    const { html } = await renderInvoiceHtml(sampleOrder);

    // Header alignments
    expect(html).toMatch(/<th class="th-img text-center">Image<\/th>/);
    expect(html).toMatch(/<th class="th-name text-left">Product Name<\/th>/);
    expect(html).toMatch(/<th class="th-sku text-left">SKU \/ HSN<\/th>/);
    expect(html).toMatch(/<th class="th-qty text-center">Qty<\/th>/);
    expect(html).toMatch(/<th class="th-price text-right">Unit Price<\/th>/);
    expect(html).toMatch(/<th class="th-discount text-right">Discount<\/th>/);
    expect(html).toMatch(/<th class="th-tax text-right">Tax<\/th>/);
    expect(html).toMatch(/<th class="th-total text-right">Total Amount<\/th>/);

    // Data cells alignment check
    expect(html).toContain('class="td-img text-center"');
    expect(html).toContain('class="td-name text-left"');
    expect(html).toContain('class="td-sku text-left"');
    expect(html).toContain('class="td-qty text-center font-medium"');
    expect(html).toContain('class="td-price text-right"');
    expect(html).toContain('class="td-discount text-right"');
    expect(html).toContain('class="td-tax text-right"');
    expect(html).toContain('class="td-total text-right font-bold text-navy"');

    // SKU, HSN, and INR prices
    expect(html).toContain("PAI-SLK-001");
    expect(html).toContain("HSN: 5007");
    expect(html).toContain("₹ 4,999.00");
    expect(html).toContain("₹ 9,998.00");
  });

  it("4. Invoice Summary: Totals properly aligned on right side with Grand Total highlighted", async () => {
    const { html } = await renderInvoiceHtml(sampleOrder);

    // Summary section contains all specified line items in order
    expect(html).toContain("Subtotal:");
    expect(html).toContain("Discount:");
    expect(html).toContain("Shipping Charges:");
    expect(html).toContain("Platform Fee:");
    expect(html).toContain("GST / Tax:");
    expect(html).toContain("Grand Total:");

    // Values formatted in INR
    expect(html).toContain("₹ 11,498.00"); // Subtotal
    expect(html).toContain("FREE"); // Shipping
    expect(html).toContain("₹ 20.00"); // Platform Fee
    expect(html).toContain("₹ 11,518.00"); // Grand total

    // Highlighted grand total
    expect(html).toMatch(/class="sum-grand-total"[\s\S]*?Grand Total:[\s\S]*?₹ 11,518.00/i);
    expect(html).toContain("Eleven Thousand Five Hundred Eighteen Rupees Only");
  });

  it("5. Footer: Aligns payment info, seller details, and VASTRAA branding without overlap", async () => {
    const { html } = await renderInvoiceHtml(sampleOrder);

    // Payment method and note
    expect(html).toContain("Payment Mode:</strong> UPI");
    expect(html).toContain("cf_pay_test_987654");

    // VASTRAA Branding and thank-you
    expect(html).toContain("Thank You for shopping with VASTRAA!");
    expect(html).toContain("Returns Policy:</strong>");
    expect(html).toContain("Yeola Silk Cluster, Nashik, Maharashtra");
    expect(html).toContain("This is a computer generated invoice. No signature required.");
  });

  it("6. PDF & Print Optimization: A4 dimensions, print margins, and page-break isolation", async () => {
    const { html } = await renderInvoiceHtml(sampleOrder);

    // A4 Portrait and margins in CSS
    expect(html).toContain("size: A4 portrait");
    expect(html).toContain("margin: 8mm 10mm 10mm 10mm");

    // Print optimization rules
    expect(html).toContain("@media print");
    expect(html).toContain("page-break-inside: avoid !important");
    expect(html).toContain("break-inside: avoid !important");
    expect(html).toContain("display: none !important"); // screen-toolbar hidden in print

    // Headless Chromium PDF Generation
    const { pdfBuffer, filename } = await generateInvoicePdf(sampleOrder);
    expect(pdfBuffer).toBeDefined();
    expect(pdfBuffer.length).toBeGreaterThan(1000);
    expect(filename).toBe("Invoice-INV-V101.pdf");
  });

  it("7. Responsive Mobile Behavior: Breakpoints, vertical stacking, and touch actions", async () => {
    const { html } = await renderInvoiceHtml(sampleOrder);

    // Responsive breakpoints
    expect(html).toContain("@media screen and (max-width: 768px)");
    expect(html).toContain("@media screen and (max-width: 480px)");

    // Touch-friendly action buttons
    expect(html).toContain("Print Invoice");
    expect(html).toContain("Download PDF");
    expect(html).toContain("window.print()");
    expect(html).toContain('href="?format=pdf"');
  });
});
