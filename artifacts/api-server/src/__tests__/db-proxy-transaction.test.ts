import { describe, it, expect } from "vitest";
import { db } from "@workspace/db";

describe("db Proxy transaction handling", () => {
  it("executes transaction callbacks and returns the result", async () => {
    let executed = false;
    const result = await db.transaction(async (tx: any) => {
      executed = true;
      expect(tx).toBeDefined();
      return { success: true, count: 42 };
    });

    expect(executed).toBe(true);
    expect(result).toEqual({ success: true, count: 42 });
  });

  it("handles empty or non-function transaction calls gracefully", async () => {
    const result = await db.transaction(null);
    expect(result).toEqual([]);
  });

  it("supports standard query methods without crashing", async () => {
    const rows = await db.select().from({}).where({}).limit(10);
    expect(Array.isArray(rows)).toBe(true);
  });
});
