import fs from "fs";
import path from "path";
import { generateInvoicePdf, clearInvoiceCaches } from "../artifacts/api-server/src/lib/invoiceRenderer.js";

clearInvoiceCaches();

const sampleOrderPath = path.resolve(process.cwd(), "invoice-template", "sample_order.json");
const sampleOrder = JSON.parse(fs.readFileSync(sampleOrderPath, "utf-8"));

console.log("Generating PDF for sample order V225...");
const { pdfBuffer, filename } = await generateInvoicePdf(sampleOrder);

const outPdf = path.resolve(process.cwd(), "sample_v225_rendered.pdf");
fs.writeFileSync(outPdf, pdfBuffer);
console.log(`Saved PDF to ${outPdf} (${pdfBuffer.length} bytes)`);
