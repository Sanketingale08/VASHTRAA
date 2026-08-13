/**
 * pdfFonts.ts — shared helper for registering Unicode-capable fonts with pdfkit.
 *
 * pdfkit's built-in fonts (Helvetica, Times-Roman, Courier) are Latin-only and
 * cannot render the Indian Rupee sign (₹, U+20B9).  Embedding Noto Sans gives us
 * full Unicode coverage including the rupee symbol while keeping the file size
 * reasonable (~300 KB total for regular + bold).
 *
 * Usage:
 *   import { registerFonts, FONT_REGULAR, FONT_BOLD } from "../lib/pdfFonts.js";
 *   const doc = new PDFDocument({ ... });
 *   registerFonts(doc);
 *   doc.font(FONT_REGULAR).fontSize(10).text("Total: ₹1,234.00");
 *   doc.font(FONT_BOLD).fontSize(10).text("Header");
 */

import path from "node:path";
import { fileURLToPath } from "node:url";

// The api-server dev script always compiles to dist/ before running (see package.json).
// At runtime __dirname is always the dist/ directory, so ../assets resolves to
// artifacts/api-server/assets/ where the font files live.
const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Font alias constants — use these instead of string literals in PDF routes. */
export const FONT_REGULAR = "NotoSans-Regular";
export const FONT_BOLD    = "NotoSans-Bold";

/**
 * Registers Noto Sans (Regular + Bold) with a PDFDocument instance.
 * Safe to call multiple times on the same document — pdfkit ignores duplicates.
 */
export function registerFonts(doc: PDFKit.PDFDocument): void {
  // Resolves to artifacts/api-server/assets/fonts/ at runtime (from dist/)
  const fontsDir = path.resolve(__dirname, "../assets/fonts");
  doc.registerFont(FONT_REGULAR, path.join(fontsDir, "NotoSans-Regular.ttf"));
  doc.registerFont(FONT_BOLD,    path.join(fontsDir, "NotoSans-Bold.ttf"));
}
