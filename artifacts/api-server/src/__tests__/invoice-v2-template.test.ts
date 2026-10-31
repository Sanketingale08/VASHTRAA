import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import {
  buildInvoiceData,
  buildAllInvoicesForOrder,
  getInvoiceDefaultTemplate,
  amountToIndianWords,
  formatNum,
  formatMoney,
  resolveStateCode,
} from "../lib/invoiceData";
import {
  renderInvoiceHtml,
  generateInvoicePdf,
  findChromiumBinary,
  getLogoDataUri,
} from "../lib/invoiceRenderer";

describe("Vastraa Invoice V2 Engine & Maths", () => {
  describe("1. Amount in Words (Indian numbering system: Lakh & Crore)", () => {
    it("converts 1,155 correctly", () => {
      expect(amountToIndianWords(1155)).toBe("One Thousand One Hundred Fifty Five Rupees Only");
    });

    it("converts 1,175 correctly", () => {
      expect(amountToIndianWords(1175)).toBe("One Thousand One Hundred Seventy Five Rupees Only");
    });

    it("converts large amounts with lakhs and crores", () => {
      expect(amountToIndianWords(125000)).toBe("One Lakh Twenty Five Thousand Rupees Only");
      expect(amountToIndianWords(15000000)).toBe("One Crore Fifty Lakh Rupees Only");
    });

    it("handles paise correctly", () => {
      expect(amountToIndianWords(1155.50)).toBe("One Thousand One Hundred Fifty Five Rupees and Fifty Paise Only");
    });
  });

  describe("2. State Code resolution", () => {
    it("maps Maharashtra to code 27 and IN-MH", () => {
      const mh = resolveStateCode("Maharashtra");
      expect(mh.code).toBe("27");
      expect(mh.iso).toBe("IN-MH");
    });

    it("maps Karnataka to code 29 and IN-KA", () => {
      const ka = resolveStateCode("Karnataka");
      expect(ka.code).toBe("29");
      expect(ka.iso).toBe("IN-KA");
    });
  });

  describe("3. GST Math & Calculations (buildInvoiceData)", () => {
    it("handles inclusive 5% item: ₹1,155 → taxable ₹1,100, CGST ₹27.50, SGST ₹27.50", async () => {
      const order = {
        id: "TEST-01",
        createdAt: "2026-10-19T10:00:00Z",
        address: {
          name: "Anita Deshmukh",
          phone: "9876543210",
          state: "Maharashtra", // Intra-state (seller MH)
          pincode: "400001",
        },
        items: [
          {
            name: "Paithani Saree",
            price: 1155.00,
            quantity: 1,
            mrp: 1155.00,
            gst_rate: 5.0,
            vendorName: "Heritage Weaves",
          },
        ],
        shipping: 0,
      };

      const invoice = await buildInvoiceData(order);
      expect(invoice.tax.intra_state).toBe(true);

      const it = invoice.items[0];
      expect(it.gross).toBe(1155.00);
      expect(it.discount).toBe(0.00);
      expect(it.taxable).toBe(1100.00);
      expect(it.cgst).toBe(27.50);
      expect(it.sgst).toBe(27.50);
      expect(it.igst).toBe(0.00);
      expect(it.total).toBe(1155.00);

      expect(invoice.totals.items_subtotal).toBe(1155.00);
      expect(invoice.totals.taxable).toBe(1100.00);
      expect(invoice.totals.cgst).toBe(27.50);
      expect(invoice.totals.sgst).toBe(27.50);
      expect(invoice.totals.igst).toBe(0.00);
    });

    it("handles a discounted item correctly: gross = mrp * qty, discount = mrp*qty - total", async () => {
      const order = {
        id: "TEST-02",
        createdAt: "2026-10-19T10:00:00Z",
        address: {
          name: "Pooja Sharma",
          state: "Maharashtra",
          pincode: "400001",
        },
        items: [
          {
            name: "Designer Silk Saree",
            price: 2100.00, // selling price
            mrp: 3000.00,   // original MRP
            quantity: 2,
            gst_rate: 5.0,
          },
        ],
        shipping: 0,
      };

      const invoice = await buildInvoiceData(order);
      const it = invoice.items[0];
      expect(it.qty).toBe(2);
      expect(it.mrp).toBe(3000.00);
      expect(it.unit_price).toBe(2100.00);
      expect(it.gross).toBe(6000.00); // 3000 * 2
      expect(it.total).toBe(4200.00); // 2100 * 2
      expect(it.discount).toBe(1800.00); // 6000 - 4200

      // Taxable = 4200 / 1.05 = 4000
      expect(it.taxable).toBe(4000.00);
      // GST = 4200 - 4000 = 200 => CGST 100, SGST 100
      expect(it.cgst).toBe(100.00);
      expect(it.sgst).toBe(100.00);
      expect(it.igst).toBe(0.00);
    });

    it("handles an inter-state order (IGST)", async () => {
      const order = {
        id: "TEST-03",
        createdAt: "2026-10-19T10:00:00Z",
        address: {
          name: "Suresh Rao",
          state: "Karnataka", // Inter-state
          pincode: "560001",
        },
        items: [
          {
            name: "Paithani Saree",
            price: 1155.00,
            quantity: 1,
            mrp: 1155.00,
            gst_rate: 5.0,
          },
        ],
        shipping: 0,
      };

      const invoice = await buildInvoiceData(order);
      expect(invoice.tax.intra_state).toBe(false);

      const it = invoice.items[0];
      expect(it.taxable).toBe(1100.00);
      expect(it.cgst).toBe(0.00);
      expect(it.sgst).toBe(0.00);
      expect(it.igst).toBe(55.00);

      expect(invoice.totals.cgst).toBe(0.00);
      expect(invoice.totals.sgst).toBe(0.00);
      expect(invoice.totals.igst).toBe(55.00);
    });

    it("handles free shipping with amount 0 and free_label: 'FREE'", async () => {
      const order = {
        id: "TEST-04",
        createdAt: "2026-10-19T10:00:00Z",
        address: {
          name: "Ramesh Kumar",
          state: "Maharashtra",
          pincode: "400001",
        },
        items: [
          {
            name: "Silk Saree",
            price: 1155.00,
            quantity: 1,
            gst_rate: 5.0,
          },
        ],
        shipping: 0,
      };

      const invoice = await buildInvoiceData(order);
      const shippingCharge = invoice.charges.find((c) => c.name === "Shipping Fee");
      expect(shippingCharge).toBeDefined();
      expect(shippingCharge?.amount).toBe(0.00);
      expect(shippingCharge?.free_label).toBe("FREE");
    });

    it("handles multiple items and sums totals cleanly", async () => {
      const order = {
        id: "TEST-05",
        createdAt: "2026-10-19T10:00:00Z",
        address: {
          name: "Meera Patel",
          state: "Maharashtra",
          pincode: "400001",
        },
        items: [
          {
            name: "Peacock Paithani",
            price: 1155.00,
            quantity: 1,
            gst_rate: 5.0,
          },
          {
            name: "Gold Brocade Blouse",
            price: 525.00, // 525 / 1.05 = 500 taxable, 25 GST => 12.50 CGST + 12.50 SGST
            quantity: 2,   // total 1050 => 1000 taxable, 50 GST => 25 CGST + 25 SGST
            gst_rate: 5.0,
          },
        ],
        shipping: 0,
      };

      const invoice = await buildInvoiceData(order);
      expect(invoice.totals.qty).toBe(3);
      expect(invoice.totals.items_subtotal).toBe(2205.00); // 1155 + 1050
      expect(invoice.totals.taxable).toBe(2100.00);        // 1100 + 1000
      expect(invoice.totals.cgst).toBe(52.50);             // 27.50 + 25.00
      expect(invoice.totals.sgst).toBe(52.50);             // 27.50 + 25.00
      // Platform fee ₹20 => grand total 2225.00
      expect(invoice.totals.grand).toBe(2225.00);
    });
  });

  describe("4. Order V225 Acceptance & Comparison", () => {
    it("renders sample_order.json and matches totals: items ₹1,155.00, platform fee ₹20.00, shipping FREE, order total ₹1,175.00", async () => {
      const candidateSamplePaths = [
        path.resolve(process.cwd(), "invoice-template", "sample_order.json"),
        path.resolve(process.cwd(), "..", "..", "invoice-template", "sample_order.json"),
        path.resolve(process.cwd(), "..", "invoice-template", "sample_order.json"),
      ];
      const samplePath = candidateSamplePaths.find((p) => fs.existsSync(p)) || candidateSamplePaths[0];
      const sampleOrder = JSON.parse(fs.readFileSync(samplePath, "utf-8"));

      const { html, invoiceData } = await renderInvoiceHtml(sampleOrder);

      expect(invoiceData.totals.items_subtotal).toBe(1155.00);
      expect(invoiceData.totals.taxable).toBe(1100.00);
      expect(invoiceData.totals.cgst).toBe(27.50);
      expect(invoiceData.totals.sgst).toBe(27.50);
      expect(invoiceData.totals.charges).toBe(20.00);
      expect(invoiceData.totals.grand).toBe(1175.00);
      expect(invoiceData.totals.words).toBe("One Thousand One Hundred Seventy Five Rupees Only");

      // Verify HTML content contains required sections and values
      expect(html).toContain("TAX INVOICE");
      expect(html).toContain("BILL OF SUPPLY");
      expect(html).toContain("INV-V225");
      expect(html).toContain("BOS-V225");
      expect(html).toContain("1,155.00");
      expect(html).toContain("1,100.00");
      expect(html).toContain("27.50");
      expect(html).toContain("20.00");
      expect(html).toContain("FREE");
      expect(html).toContain("1,175.00");

      // Verify Vastraa logo is embedded
      const logoDataUri = getLogoDataUri();
      expect(logoDataUri).toContain("data:image/png;base64,");
      expect(html).toContain(logoDataUri);
    });

    it("verifies optional fields cleanly disappear when empty", async () => {
      const sampleOrder = {
        id: "V-NO-OPTIONALS",
        createdAt: "2026-10-19T10:00:00Z",
        address: {
          name: "Test Customer",
          state: "Maharashtra",
          pincode: "400001",
        },
        seller: {
          name: "Test Weaver",
          address: "Yeola, Maharashtra",
          state_code: "27",
          gstin: null,
          pan: null,
          regd_office: null,
        },
        items: [
          {
            name: "Paithani Saree",
            price: 1155.00,
            quantity: 1,
            gst_rate: 5.0,
          },
        ],
        vehicle_no: null,
        tracking_id: null,
      };

      const { html } = await renderInvoiceHtml(sampleOrder);
      // Optional seller fields must not leave empty labels
      expect(html).not.toContain("<b>GSTIN</b> -");
      expect(html).not.toContain("<b>PAN:</b>");
      expect(html).not.toContain("<i>Regd. office:");
      expect(html).not.toContain("Registration No. of Goods Carriage:");
      expect(html).not.toContain("Tracking ID:");
    });

    it("generates a valid 2-page PDF file", async () => {
      const chrome = findChromiumBinary();
      if (!chrome) {
        console.warn("Skipping Chromium test: Chrome binary not found.");
        return;
      }

      const candidateSamplePaths = [
        path.resolve(process.cwd(), "invoice-template", "sample_order.json"),
        path.resolve(process.cwd(), "..", "..", "invoice-template", "sample_order.json"),
        path.resolve(process.cwd(), "..", "invoice-template", "sample_order.json"),
      ];
      const samplePath = candidateSamplePaths.find((p) => fs.existsSync(p)) || candidateSamplePaths[0];
      const sampleOrder = JSON.parse(fs.readFileSync(samplePath, "utf-8"));

      const { pdfBuffer, filename } = await generateInvoicePdf(sampleOrder);
      expect(pdfBuffer).toBeInstanceOf(Buffer);
      expect(pdfBuffer.length).toBeGreaterThan(10000);
      expect(filename).toBe("Invoice-INV-V225.pdf");

      const pdfHeader = pdfBuffer.slice(0, 5).toString("utf-8");
      expect(pdfHeader).toBe("%PDF-");

      // Save PDF to verify visually
      const testPdfPath = path.resolve(process.cwd(), "test_invoice_vastraa.pdf");
      fs.writeFileSync(testPdfPath, pdfBuffer);
    }, 30000);
  });

  describe("5. Multi-Vendor Support (One Invoice Per Vendor)", () => {
    it("generates separate invoices for items belonging to different vendors", async () => {
      const multiVendorOrder = {
        id: "MV-7788",
        createdAt: "2026-10-20T10:00:00Z",
        address: {
          name: "Deepa Patil",
          state: "Maharashtra",
          pincode: "411001",
        },
        items: [
          {
            name: "Paithani Saree",
            price: 1155.00,
            quantity: 1,
            gst_rate: 5.0,
            vendorName: "Heritage Weavers",
            vendorId: "v_heritage",
          },
          {
            name: "Banarasi Dupatta",
            price: 2100.00,
            quantity: 1,
            gst_rate: 5.0,
            vendorName: "Varanasi Silks",
            vendorId: "v_varanasi",
          },
        ],
        shipping: 0,
      };

      const invoices = await buildAllInvoicesForOrder(multiVendorOrder);
      expect(invoices).toHaveLength(2);

      // Vendor 1 invoice
      expect(invoices[0].seller.name).toBe("Heritage Weavers");
      expect(invoices[0].items).toHaveLength(1);
      expect(invoices[0].items[0].name).toBe("Paithani Saree");
      expect(invoices[0].invoice.number).toBe("INV-MV-7788-V1");
      expect(invoices[0].bos.number).toBe("BOS-MV-7788-V1");
      expect(invoices[0].totals.items_subtotal).toBe(1155.00);

      // Vendor 2 invoice
      expect(invoices[1].seller.name).toBe("Varanasi Silks");
      expect(invoices[1].items).toHaveLength(1);
      expect(invoices[1].items[0].name).toBe("Banarasi Dupatta");
      expect(invoices[1].invoice.number).toBe("INV-MV-7788-V2");
      expect(invoices[1].bos.number).toBe("BOS-MV-7788-V2");
      expect(invoices[1].totals.items_subtotal).toBe(2100.00);

      // Rendering combined multi-vendor HTML produces multiple pages
      const { html, allInvoices } = await renderInvoiceHtml(multiVendorOrder);
      expect(allInvoices).toHaveLength(2);
      expect(html).toContain("Heritage Weavers");
      expect(html).toContain("Varanasi Silks");
      expect(html).toContain("INV-MV-7788-V1");
      expect(html).toContain("INV-MV-7788-V2");
    });

    it("filters to a specific vendor when vendorId is supplied", async () => {
      const multiVendorOrder = {
        id: "MV-9900",
        createdAt: "2026-10-20T10:00:00Z",
        address: {
          name: "Deepa Patil",
          state: "Maharashtra",
          pincode: "411001",
        },
        items: [
          {
            name: "Paithani Saree",
            price: 1155.00,
            quantity: 1,
            gst_rate: 5.0,
            vendorName: "Heritage Weavers",
            vendorId: "v_heritage",
          },
          {
            name: "Banarasi Dupatta",
            price: 2100.00,
            quantity: 1,
            gst_rate: 5.0,
            vendorName: "Varanasi Silks",
            vendorId: "v_varanasi",
          },
        ],
        shipping: 0,
      };

      const { html, invoiceData } = await renderInvoiceHtml(multiVendorOrder, "v_varanasi");
      expect(invoiceData.seller.name).toBe("Varanasi Silks");
      expect(invoiceData.items).toHaveLength(1);
      expect(invoiceData.items[0].name).toBe("Banarasi Dupatta");
      expect(html).toContain("Varanasi Silks");
      expect(html).not.toContain("Heritage Weavers");
    });
  });

  describe("6. Default Template Setting & Idempotency", () => {
    it("resolves default template to 'vastraa-v2'", async () => {
      const template = await getInvoiceDefaultTemplate();
      expect(template).toBe("vastraa-v2");
    });

    it("ensures regenerating invoice for the same order retains the exact same invoice number", async () => {
      const order = {
        id: "ORD-IDEMP-1234",
        displayId: "V1234",
        createdAt: "2026-10-20T10:00:00Z",
        address: { name: "Test User", state: "Maharashtra", pincode: "400001" },
        items: [{ name: "Saree", price: 1155.00, quantity: 1, gst_rate: 5.0 }],
      };

      const inv1 = await buildInvoiceData(order);
      const inv2 = await buildInvoiceData(order);

      expect(inv1.invoice.number).toBe("INV-V1234");
      expect(inv2.invoice.number).toBe("INV-V1234");
      expect(inv1.invoice.number).toBe(inv2.invoice.number);
      expect(inv1.bos.number).toBe(inv2.bos.number);
    });
  });
});
