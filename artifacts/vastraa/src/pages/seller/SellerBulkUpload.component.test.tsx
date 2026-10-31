/**
 * Component-level tests for SellerBulkUpload.
 *
 * These tests focus on:
 *   1. The exported buildAllFailed pure helper (all-client-invalid path)
 *   2. The downloadErrorReport column structure
 *   3. The template-detection parsing logic via exported helpers
 */
import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import * as XLSX from "xlsx";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// ─── Stub heavy Clerk hooks used transitively by other imports ────────────────
vi.mock("@clerk/react", () => ({
  useUser: () => ({ user: null, isLoaded: true }),
  useAuth: () => ({ getToken: async () => "tok" }),
  SignedIn: ({ children }: any) => children,
  SignedOut: ({ children }: any) => children,
}));
vi.mock("@clerk/react/legacy", () => ({
  useSignIn: () => ({ isLoaded: true, signIn: null, setActive: vi.fn() }),
  useSignUp: () => ({ isLoaded: true, signUp: null, setActive: vi.fn() }),
}));

// ─── Stub XLSX.writeFile so no real file-save happens in tests ────────────────
vi.mock("xlsx", async () => {
  const real = await vi.importActual<typeof import("xlsx")>("xlsx");
  return { ...real, writeFile: vi.fn() };
});

// ─── Import the component AFTER mocks are in place ───────────────────────────
import SellerBulkUpload, {
  PRODUCT_FIELDS,
  parseWorkbook,
  toExcelRowNumber,
} from "./SellerBulkUpload";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal ReviewRow already at the "results" step state. */
function makeInvalidRow(index: number, overrides: Record<string, string> = {}) {
  return {
    index,
    values: { name: "", price: "bad", category: "unknown", ...overrides },
    errors: { name: "Required", price: "Positive whole number", category: "paithani, designer, bridal, party" },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("SellerBulkUpload – buildAllFailed: all-client-invalid path", () => {
  const onClose = vi.fn();
  const onDone  = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders Upload step with template download button on mount", () => {
    render(<SellerBulkUpload onClose={onClose} onDone={onDone} />);
    expect(screen.getByText("Bulk Upload Products")).toBeDefined();
    expect(screen.getByText(/download template/i)).toBeDefined();
  });

  it("parses the supplied template layout from its friendly row-7 headers", () => {
    const rows = [
      ["", "", "", "", "PRODUCT CATALOG TEMPLATE"],
      [],
      [],
      ["", "", "", "", "Paithani & Designer Saree"],
      [],
      ["Add one product per row below."],
      [
        "Product Name *",
        "Price (₹) *",
        "Category *",
        "Description",
        "Fabric",
        "Color",
        "Occasion",
        "Stock",
        "Original Price (₹)",
        "Varients",
        "Subcategory",
        "Brand",
        "Design Pattern",
        "Images (URL)",
      ],
      [
        "Peacock Paithani",
        15000,
        "paithani",
        "Handwoven silk",
        "silk",
        "red",
        "festival",
        10,
        18000,
        "6 Var",
        "Festive",
        "TwirlDrape",
        "Peacock",
        "https://example.com/product.jpg",
      ],
    ];
    const sheet = XLSX.utils.aoa_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, "Product Catalog");

    const parsed = parseWorkbook(workbook);

    expect(parsed.headerRow).toBe(6);
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0].sheetRow).toBe(7);
    expect(parsed.rows[0].values).toMatchObject({
      name: "Peacock Paithani",
      price: "15000",
      category: "paithani",
      originalPrice: "18000",
      images: "https://example.com/product.jpg",
    });
    expect(parsed.rows[0].values).not.toHaveProperty("variants");
    expect(toExcelRowNumber(parsed.rows[0].sheetRow)).toBe(8);
  });

  it("does not import the unchanged example rows from the exact supplied workbook", () => {
    const templateBytes = readFileSync(
      resolve(process.cwd(), "public/twirldrape_product_template.xlsx"),
    );
    const workbook = XLSX.read(templateBytes, { type: "buffer" });

    const parsed = parseWorkbook(workbook);

    expect(parsed.headerRow).toBe(6);
    expect(parsed.rows).toEqual([]);
  });

  it("imports the same values from a compatible workbook that is not the canonical template", () => {
    const headers = [
      "Product Name *", "Price (₹) *", "Category *", "Description",
      "Fabric", "Color", "Occasion", "Stock", "Original Price (₹)",
      "Varients", "Subcategory", "Brand", "Design Pattern", "Images (URL)",
    ];
    const sample = [
      "Peacock Paithani ABC", 15000, "paithani",
      "Handwoven pure silk saree with peacock motifs", "silk", "red",
      "festival", 10, 1000, "6 Var", "paithan festivali", "ss",
      "Peacock", "https://in.pinterest.com/pin/1086352741404761172/",
    ];
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.aoa_to_sheet([headers, sample]),
      "Products",
    );

    const parsed = parseWorkbook(workbook);

    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0].values.name).toBe("Peacock Paithani ABC");
  });

  it("imports a canonical example row when its ignored Varients cell is edited", () => {
    const templateBytes = readFileSync(
      resolve(process.cwd(), "public/twirldrape_product_template.xlsx"),
    );
    const workbook = XLSX.read(templateBytes, { type: "buffer" });
    workbook.Sheets["Product Catalog"].J8.v = "7 Var";

    const parsed = parseWorkbook(workbook);

    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0].values.name).toBe("Peacock Paithani ABC");
    expect(parsed.rows[0].values).not.toHaveProperty("variants");
  });

  it("buildAllFailed returns all rows when every row fails client validation", async () => {
    const { buildAllFailed } = await import("./SellerBulkUpload");

    const allInvalidRows = [
      makeInvalidRow(0),
      makeInvalidRow(1, { name: "Something", price: "-1" }),
      makeInvalidRow(2, { name: "Other", price: "0" }),
    ];

    const allFailed = buildAllFailed(allInvalidRows, [], []);

    // Every row should appear exactly once
    expect(allFailed).toHaveLength(3);
    expect(allFailed.map(r => r.rowIndex)).toEqual([0, 1, 2]);
    expect(allFailed.every(r => r.source === "client")).toBe(true);

    // Reasons must be non-empty
    for (const row of allFailed) {
      expect(row.reason.length).toBeGreaterThan(0);
    }

    // Row data must be preserved
    expect(allFailed[0].row).toMatchObject(allInvalidRows[0].values);
    expect(allFailed[1].row).toMatchObject(allInvalidRows[1].values);
    expect(allFailed[2].row).toMatchObject(allInvalidRows[2].values);
  });

  it("downloadErrorReport column structure has Excel Row + all PRODUCT_FIELDS + Error Reasons", () => {
    const fieldKeys = PRODUCT_FIELDS.map(f => f.key);
    const expectedHeaders = ["Excel Row", ...fieldKeys, "Error Reasons"];
    expect(expectedHeaders).toContain("name");
    expect(expectedHeaders).toContain("price");
    expect(expectedHeaders).toContain("category");
    expect(expectedHeaders[0]).toBe("Excel Row");
    expect(expectedHeaders[expectedHeaders.length - 1]).toBe("Error Reasons");
    // "Excel Row" + all fields + "Error Reasons"
    expect(expectedHeaders).toHaveLength(PRODUCT_FIELDS.length + 2);
  });

  it("buildAllFailed merges client-invalid and server-rejected without duplicates, sorted by rowIndex", async () => {
    const { buildAllFailed: baf } = await import("./SellerBulkUpload");

    const row0 = makeInvalidRow(0);
    const row1 = { index: 1, values: { name: "Silk", price: "5000", category: "designer" }, errors: {} };
    const row2 = { index: 2, values: { name: "Cotton", price: "3000", category: "bridal" }, errors: {} };
    const row3 = makeInvalidRow(3);
    const row4 = { index: 4, values: { name: "Red", price: "8000", category: "paithani" }, errors: {} };

    const allReviewRows = [row0, row1, row2, row3, row4];
    const validRows = [row1, row2, row4];

    const apiResults = [
      { row: 1, success: false, error: "Server error for row1" },
      { row: 2, success: true },
      { row: 4, success: false, error: "Server error for row4" },
    ];

    const result = baf(allReviewRows, validRows, apiResults);

    expect(result).toHaveLength(4);
    expect(result[0].rowIndex).toBe(0);
    expect(result[0].source).toBe("client");
    expect(result[1].rowIndex).toBe(1);
    expect(result[1].source).toBe("server");
    expect(result[1].reason).toBe("Server error for row1");
    expect(result[2].rowIndex).toBe(3);
    expect(result[2].source).toBe("client");
    expect(result[3].rowIndex).toBe(4);
    expect(result[3].source).toBe("server");
    expect(result[3].reason).toBe("Server error for row4");
  });

  it("includes sku in PRODUCT_FIELDS definition", () => {
    const skuField = PRODUCT_FIELDS.find(f => f.key === "sku");
    expect(skuField).toBeDefined();
    expect(skuField?.required).toBe(false);
  });

  it("parses and maps SKU columns correctly from spreadsheet", () => {
    const headers = ["Product Name *", "SKU", "Price (₹) *", "Category *"];
    const rows = [["Paithani Saree", "SKU-9901", 12500, "paithani"]];
    const sheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, sheet, "Products");

    const parsed = parseWorkbook(wb);
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0].values.sku).toBe("SKU-9901");
    expect(parsed.rows[0].values.name).toBe("Paithani Saree");
    expect(parsed.rows[0].values.price).toBe("12500");
  });

  it("correctly converts zero-based indices to 1-based Excel row numbers", () => {
    expect(toExcelRowNumber(0)).toBe(1);
    expect(toExcelRowNumber(6)).toBe(7);
    expect(toExcelRowNumber(10)).toBe(11);
  });

  it("buildAllFailed provides meaningful fallback reason when server error is missing", async () => {
    const { buildAllFailed: baf } = await import("./SellerBulkUpload");
    const validRow = { index: 2, values: { name: "Silk", price: "5000", category: "designer" }, errors: {} };
    const apiResults = [{ row: 1, success: false }]; // no explicit error string

    const result = baf([validRow], [validRow], apiResults);
    expect(result).toHaveLength(1);
    expect(result[0].reason).toBe("Import failed");
  });
});

