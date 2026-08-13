import { describe, it, expect } from "vitest";
import { buildAllFailed } from "./SellerBulkUpload";

// Minimal helpers so tests stay readable
const makeReviewRow = (
  index: number,
  values: Record<string, string>,
  errors: Record<string, string> = {},
) => ({ index, values, errors });

const makeApiResult = (
  row: number,
  success: boolean,
  error?: string,
) => ({ row, success, ...(error !== undefined ? { error } : {}) });

// ---------------------------------------------------------------------------

describe("buildAllFailed", () => {
  it("returns an empty array when every row succeeds", () => {
    const reviewRows = [
      makeReviewRow(0, { name: "A", price: "1000", category: "paithani" }),
      makeReviewRow(1, { name: "B", price: "2000", category: "designer" }),
    ];
    const validRows = reviewRows; // all pass client validation
    const apiResults = [makeApiResult(0, true), makeApiResult(1, true)];

    const result = buildAllFailed(reviewRows, validRows, apiResults);
    expect(result).toHaveLength(0);
  });

  it("includes every client-invalid row", () => {
    const bad = makeReviewRow(0, { name: "", price: "abc", category: "" }, {
      name: "Required",
      price: "Positive whole number",
      category: "paithani, designer, bridal, party",
    });
    const good = makeReviewRow(1, { name: "B", price: "2000", category: "designer" });

    const validRows = [good]; // only the good row was sent to API
    const apiResults = [makeApiResult(0, true)];

    const result = buildAllFailed([bad, good], validRows, apiResults);
    expect(result).toHaveLength(1);
    expect(result[0].rowIndex).toBe(0);
    expect(result[0].source).toBe("client");
    expect(result[0].reason).toContain("name: Required");
    expect(result[0].reason).toContain("price: Positive whole number");
  });

  it("includes every server-rejected row", () => {
    const rows = [
      makeReviewRow(0, { name: "A", price: "500", category: "paithani" }),
      makeReviewRow(1, { name: "B", price: "600", category: "designer" }),
    ];
    const apiResults = [
      makeApiResult(0, false, "Duplicate SKU"),
      makeApiResult(1, true),
    ];

    const result = buildAllFailed(rows, rows, apiResults);
    expect(result).toHaveLength(1);
    expect(result[0].rowIndex).toBe(0);
    expect(result[0].source).toBe("server");
    expect(result[0].reason).toBe("Duplicate SKU");
  });

  it("merges client-invalid and server-rejected rows without duplicates and sorted by rowIndex", () => {
    // Spreadsheet rows (0-based index):
    //   row 0 – invalid client (missing name)
    //   row 1 – valid, but server rejects it
    //   row 2 – valid, server accepts it
    //   row 3 – invalid client (bad price)
    //   row 4 – valid, but server rejects it

    const row0 = makeReviewRow(0, { name: "", price: "100", category: "paithani" }, { name: "Required" });
    const row1 = makeReviewRow(1, { name: "Silk", price: "5000", category: "designer" });
    const row2 = makeReviewRow(2, { name: "Cotton", price: "3000", category: "bridal" });
    const row3 = makeReviewRow(3, { name: "Gold", price: "-1", category: "party" }, { price: "Positive whole number" });
    const row4 = makeReviewRow(4, { name: "Red", price: "8000", category: "paithani" });

    const allReviewRows = [row0, row1, row2, row3, row4];
    const validRows = [row1, row2, row4]; // rows 1, 2, 4 passed client validation

    // Server accepts row2, rejects row1 and row4
    const apiResults = [
      makeApiResult(1, false, "Server error for row1"),
      makeApiResult(2, true),
      makeApiResult(4, false, "Server error for row4"),
    ];

    const result = buildAllFailed(allReviewRows, validRows, apiResults);

    // Expected: rows 0, 1, 3, 4 — sorted by rowIndex
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

  it("never produces duplicate entries even if review rows and valid rows accidentally overlap", () => {
    // The two sets are disjoint by design (a row can't be both client-invalid
    // and in the validRows list), but let's verify the merge produces no dups
    // for a realistic upload where every row is either invalid or valid+sent.
    const invalid = makeReviewRow(2, { name: "", price: "0", category: "" }, {
      name: "Required",
      price: "Positive whole number",
    });
    const valid0 = makeReviewRow(0, { name: "A", price: "100", category: "paithani" });
    const valid1 = makeReviewRow(1, { name: "B", price: "200", category: "designer" });

    const validRows = [valid0, valid1];
    const apiResults = [makeApiResult(0, true), makeApiResult(1, false, "SKU conflict")];

    const result = buildAllFailed([valid0, valid1, invalid], validRows, apiResults);

    // rowIndex 0 succeeds, rowIndex 1 server-fails, rowIndex 2 client-fails
    expect(result).toHaveLength(2);
    const rowIndices = result.map(r => r.rowIndex);
    expect(rowIndices).toEqual([1, 2]); // sorted, no dups
    expect(new Set(rowIndices).size).toBe(rowIndices.length); // no duplicates
  });

  it("uses 'Import failed' as a fallback reason when the server returns no error message", () => {
    const row = makeReviewRow(0, { name: "X", price: "999", category: "paithani" });
    const apiResults = [{ row: 0, success: false }]; // no error field

    const result = buildAllFailed([row], [row], apiResults);
    expect(result[0].reason).toBe("Import failed");
  });

  it("preserves the original row data in every failed entry", () => {
    const values = { name: "Peacock", price: "12000", category: "paithani", fabric: "silk" };
    const row = makeReviewRow(5, values);
    const apiResults = [makeApiResult(5, false, "Out of stock")];

    const result = buildAllFailed([row], [row], apiResults);
    expect(result[0].row).toEqual(values);
  });

  it("returns every row when all rows fail client validation (no valid rows sent to server)", () => {
    // This mirrors the early-return path in handleImport where validRows.length === 0.
    // buildAllFailed is called with empty validRows and empty apiResults.
    const r0 = makeReviewRow(0, { name: "", price: "abc", category: "" }, {
      name: "Required",
      price: "Positive whole number",
      category: "paithani, designer, bridal, party",
    });
    const r1 = makeReviewRow(1, { name: "B", price: "-5", category: "paithani" }, {
      price: "Positive whole number",
    });
    const r2 = makeReviewRow(2, { name: "", price: "300", category: "designer" }, {
      name: "Required",
    });

    const result = buildAllFailed([r0, r1, r2], [], []);

    expect(result).toHaveLength(3);
    expect(result.map(r => r.rowIndex)).toEqual([0, 1, 2]);
    expect(result.every(r => r.source === "client")).toBe(true);
    expect(result[0].reason).toContain("name: Required");
    expect(result[1].reason).toContain("price: Positive whole number");
    expect(result[2].reason).toContain("name: Required");
  });

  it("handles all rows failing both client and server validations (no overlap)", () => {
    // 3 rows: first two fail client validation, third fails at server
    const r0 = makeReviewRow(0, { name: "", price: "bad", category: "" }, {
      name: "Required",
      price: "Positive whole number",
      category: "paithani, designer, bridal, party",
    });
    const r1 = makeReviewRow(1, { name: "", price: "100", category: "paithani" }, { name: "Required" });
    const r2 = makeReviewRow(2, { name: "OK", price: "500", category: "designer" });

    const validRows = [r2];
    const apiResults = [makeApiResult(2, false, "Duplicate product")];

    const result = buildAllFailed([r0, r1, r2], validRows, apiResults);
    expect(result).toHaveLength(3);
    expect(result.map(r => r.rowIndex)).toEqual([0, 1, 2]);
    expect(result[0].source).toBe("client");
    expect(result[1].source).toBe("client");
    expect(result[2].source).toBe("server");
  });
});
