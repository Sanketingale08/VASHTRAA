import fs from "fs";
import path from "path";
import os from "os";
import { execFile } from "child_process";
import { promisify } from "util";
import nunjucks from "nunjucks";
import QRCode from "qrcode";
import {
  formatNum,
  formatMoney,
  buildInvoiceData,
  buildAllInvoicesForOrder,
  getInvoiceDefaultTemplate,
  type InvoiceCalculatedResult,
  INVOICE_CONFIG,
} from "./invoiceData";
import { logger } from "./logger";

const execFileAsync = promisify(execFile);

// Cached template & logo
let cachedTemplateContent: string | null = null;
let cachedLogoDataUri: string | null = null;

/**
 * Clears in-memory cached template and logo.
 */
export function clearInvoiceCaches(): void {
  cachedTemplateContent = null;
  cachedLogoDataUri = null;
}

/**
 * Combines multiple 2-page rendered invoice HTML strings into a single multi-page HTML document.
 */
export function combineInvoiceHtml(renderedInvoices: string[]): string {
  if (renderedInvoices.length <= 1) return renderedInvoices[0] || "";
  const first = renderedInvoices[0];
  const headMatch = first.match(/<head[\s\S]*?<\/head>/i);
  const headContent = headMatch ? headMatch[0] : "<head></head>";
  const bodyContents = renderedInvoices.map((html, idx) => {
    const m = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    let body = m ? m[1] : html;
    if (idx > 0) {
      body = body.replace(/<div class="screen-toolbar"[\s\S]*?<\/div>\s*<\/div>/i, "");
    }
    return body;
  });
  return `<!DOCTYPE html><html lang="en">${headContent}<body>${bodyContents.join("\n")}</body></html>`;
}

/**
 * Resolves the path to the invoice template HTML.
 */
export function getInvoiceTemplatePath(): string {
  const candidatePaths = [
    path.resolve(process.cwd(), "invoice-template", "invoice_template.html"),
    path.resolve(process.cwd(), "..", "..", "invoice-template", "invoice_template.html"),
    path.resolve(process.cwd(), "templates", "invoice_template.html"),
  ];
  for (const p of candidatePaths) {
    if (fs.existsSync(p)) return p;
  }
  return candidatePaths[0];
}

/**
 * Resolves the path to the Vastraa logo PNG.
 */
export function getLogoPngPath(): string {
  const candidatePaths = [
    path.resolve(process.cwd(), "invoice-template", "logo.png"),
    path.resolve(process.cwd(), "..", "..", "invoice-template", "logo.png"),
    path.resolve(process.cwd(), "public", "images", "logo.png"),
    path.resolve(process.cwd(), "..", "vastraa", "public", "images", "logo.png"),
    path.resolve(process.cwd(), "..", "..", "artifacts", "vastraa", "public", "images", "logo.png"),
  ];
  for (const p of candidatePaths) {
    if (fs.existsSync(p)) return p;
  }
  return candidatePaths[0];
}

/**
 * Returns the Vastraa logo as base64 data URI.
 */
export function getLogoDataUri(): string {
  if (cachedLogoDataUri) return cachedLogoDataUri;
  const logoPath = getLogoPngPath();
  if (fs.existsSync(logoPath)) {
    const buf = fs.readFileSync(logoPath);
    cachedLogoDataUri = `data:image/png;base64,${buf.toString("base64")}`;
    return cachedLogoDataUri;
  }
  return "";
}

/**
 * Returns the template HTML string.
 */
export function getTemplateContent(): string {
  if (cachedTemplateContent) return cachedTemplateContent;
  const tplPath = getInvoiceTemplatePath();
  if (fs.existsSync(tplPath)) {
    cachedTemplateContent = fs.readFileSync(tplPath, "utf-8");
    return cachedTemplateContent;
  }
  throw new Error(`Invoice template not found at ${tplPath}`);
}

/**
 * Generates QR Code data URI encoding `invoiceNo|orderId|grandTotal|date`.
 */
export async function generateInvoiceQrCode(
  invoiceNo: string,
  orderId: string,
  grandTotal: number,
  date: string
): Promise<string> {
  const payload = `${invoiceNo}|${orderId}|${grandTotal.toFixed(2)}|${date}`;
  try {
    return await QRCode.toDataURL(payload, {
      margin: 1,
      width: 250,
      color: {
        dark: "#000000",
        light: "#FFFFFF",
      },
    });
  } catch (err) {
    logger.error({ err }, "Failed to generate QR code for invoice");
    return "";
  }
}

/**
 * Configured Nunjucks Environment
 */
const nunjucksEnv = new nunjucks.Environment(null, { autoescape: true });
nunjucksEnv.addFilter("money", (val: number) => formatMoney(val));
nunjucksEnv.addFilter("num", (val: number) => formatNum(val));
nunjucksEnv.addGlobal("money", (val: number) => formatMoney(val));
nunjucksEnv.addGlobal("num", (val: number) => formatNum(val));

/**
 * Renders complete HTML invoice for an order.
 * If vendorId is supplied, generates invoice for that vendor only.
 * If order has multiple vendors and no vendorId is supplied, generates one invoice per vendor
 * and combines them into a multi-page document.
 */
export async function renderInvoiceHtml(
  order: any,
  vendorId?: string,
  documentType?: "tax_invoice" | "master_order_summary" | "credit_note"
): Promise<{
  html: string;
  invoiceData: InvoiceCalculatedResult;
  allInvoices: InvoiceCalculatedResult[];
}> {
  const logoUri = getLogoDataUri();
  const tpl = getTemplateContent();

  if (documentType === "master_order_summary") {
    const { buildMasterOrderSummary } = await import("./invoiceData");
    const data = await buildMasterOrderSummary(order, logoUri);
    data.qr = await generateInvoiceQrCode(
      data.invoice.number,
      data.order.id,
      data.totals.grand,
      data.invoice.date
    );
    const html = nunjucksEnv.renderString(tpl, data);
    return { html, invoiceData: data, allInvoices: [data] };
  }

  if (vendorId) {
    const data = await buildInvoiceData(order, vendorId, logoUri, documentType || "tax_invoice");
    data.qr = await generateInvoiceQrCode(
      data.invoice.number,
      data.order.id,
      data.totals.grand,
      data.invoice.date
    );
    const html = nunjucksEnv.renderString(tpl, data);
    return { html, invoiceData: data, allInvoices: [data] };
  }

  const allInvoices = await buildAllInvoicesForOrder(order, logoUri);
  for (const inv of allInvoices) {
    inv.qr = await generateInvoiceQrCode(
      inv.invoice.number,
      inv.order.id,
      inv.totals.grand,
      inv.invoice.date
    );
  }

  if (allInvoices.length === 1) {
    const html = nunjucksEnv.renderString(tpl, allInvoices[0]);
    return { html, invoiceData: allInvoices[0], allInvoices };
  }

  const renderedPages = allInvoices.map((inv) => nunjucksEnv.renderString(tpl, inv));
  const combinedHtml = combineInvoiceHtml(renderedPages);
  return { html: combinedHtml, invoiceData: allInvoices[0], allInvoices };
}

/**
 * Finds the Chrome / Edge / Chromium binary for headless printing.
 */
export function findChromiumBinary(): string | null {
  const envBin = process.env.CHROME_BIN || process.env.PUPPETEER_EXECUTABLE_PATH;
  if (envBin && fs.existsSync(envBin)) return envBin;

  const candidates = [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ];

  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return null;
}

/**
 * Converts an HTML invoice into an A4, 2-page PDF Buffer.
 */
export async function renderInvoicePdfFromHtml(html: string): Promise<Buffer> {
  const chromePath = findChromiumBinary();
  if (!chromePath) {
    throw new Error(
      "Chromium/Chrome binary not found on host. Set CHROME_BIN environment variable or install Chrome/Edge."
    );
  }

  const tmpId = `inv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const tmpDir = os.tmpdir();
  const tempHtmlPath = path.join(tmpDir, `${tmpId}.html`);
  const tempPdfPath = path.join(tmpDir, `${tmpId}.pdf`);

  await fs.promises.writeFile(tempHtmlPath, html, "utf-8");

  const fileUrl = `file:///${tempHtmlPath.replace(/\\/g, "/")}`;

  try {
    await execFileAsync(
      chromePath,
      [
        "--headless=new",
        "--disable-gpu",
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--no-pdf-header-footer",
        `--print-to-pdf=${tempPdfPath}`,
        fileUrl,
      ],
      { timeout: 30000 }
    );

    if (!fs.existsSync(tempPdfPath)) {
      throw new Error("Chromium completed without generating output PDF file.");
    }

    const pdfBuffer = await fs.promises.readFile(tempPdfPath);
    return pdfBuffer;
  } finally {
    // Cleanup temporary files
    try {
      if (fs.existsSync(tempHtmlPath)) await fs.promises.unlink(tempHtmlPath);
      if (fs.existsSync(tempPdfPath)) await fs.promises.unlink(tempPdfPath);
    } catch {}
  }
}

/**
 * High-level function: builds invoice data and renders the final PDF buffer.
 */
export async function generateInvoicePdf(
  order: any,
  vendorId?: string,
  documentType?: "tax_invoice" | "master_order_summary" | "credit_note"
): Promise<{ pdfBuffer: Buffer; invoiceData: InvoiceCalculatedResult; filename: string }> {
  const { html, invoiceData } = await renderInvoiceHtml(order, vendorId, documentType);
  const pdfBuffer = await renderInvoicePdfFromHtml(html);
  const prefix = documentType === "master_order_summary" ? "Summary" : documentType === "credit_note" ? "CreditNote" : "Invoice";
  const filename = `${prefix}-${invoiceData.invoice.number}.pdf`;
  return { pdfBuffer, invoiceData, filename };
}

/**
 * Renders HTML directly from a persisted immutable invoice snapshot.
 */
export function renderHtmlFromSnapshot(snapshot: any): string {
  const tpl = getTemplateContent();
  return nunjucksEnv.renderString(tpl, snapshot.invoiceData);
}

/**
 * Generates PDF directly from a persisted immutable invoice snapshot.
 */
export async function renderPdfFromSnapshot(snapshot: any): Promise<{ pdfBuffer: Buffer; filename: string }> {
  const html = renderHtmlFromSnapshot(snapshot);
  const pdfBuffer = await renderInvoicePdfFromHtml(html);
  const filename = snapshot.pdfFilename || `Invoice-${snapshot.invoiceNumber}.pdf`;
  return { pdfBuffer, filename };
}

