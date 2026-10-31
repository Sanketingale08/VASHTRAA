import { describe, it, expect, vi, beforeEach } from "vitest";
import { globalCache, CacheEngine, safeClearCache, safeInvalidatePattern } from "../lib/cacheEngine";

describe("Seller Product Edit & Cache Engine Unit Tests", () => {
  beforeEach(() => {
    globalCache.clear();
  });

  it("globalCache has clear, reset, and invalidatePattern functions", () => {
    expect(typeof globalCache.clear).toBe("function");
    expect(typeof globalCache.reset).toBe("function");
    expect(typeof globalCache.invalidatePattern).toBe("function");
    expect(typeof globalCache.getOrFetch).toBe("function");
    expect(typeof globalCache.get).toBe("function");
    expect(typeof globalCache.set).toBe("function");
    expect(typeof globalCache.del).toBe("function");

    // Execute clear without throwing any errors
    expect(() => globalCache.clear()).not.toThrow();
  });

  it("globalCache caches data and clears properly", async () => {
    const fetchFn = vi.fn(async () => ({ id: "prod-123", name: "Original Saree", price: 5000 }));
    
    // First read -> fetches from fetchFn
    const p1 = await globalCache.getOrFetch("product:prod-123", fetchFn);
    expect(p1.name).toBe("Original Saree");
    expect(fetchFn).toHaveBeenCalledTimes(1);

    // Second read -> hits cache
    const p2 = await globalCache.getOrFetch("product:prod-123", fetchFn);
    expect(p2.name).toBe("Original Saree");
    expect(fetchFn).toHaveBeenCalledTimes(1);

    // Call globalCache.clear() (e.g. after Save Changes)
    globalCache.clear();

    // Third read after clear -> fetches again
    const p3 = await globalCache.getOrFetch("product:prod-123", fetchFn);
    expect(p3.name).toBe("Original Saree");
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it("globalCache invalidates matching patterns", async () => {
    globalCache.set("products:catalog:all", [{ id: "1" }]);
    globalCache.set("product:1", { id: "1", name: "Saree" });
    globalCache.set("vendor:profile:v1", { id: "v1" });

    expect(globalCache.get("product:1")).toBeDefined();
    expect(globalCache.get("products:catalog:all")).toBeDefined();
    expect(globalCache.get("vendor:profile:v1")).toBeDefined();

    const clearedCount = globalCache.invalidatePattern(/product/);
    expect(clearedCount).toBe(2);

    expect(globalCache.get("product:1")).toBeUndefined();
    expect(globalCache.get("products:catalog:all")).toBeUndefined();
    expect(globalCache.get("vendor:profile:v1")).toBeDefined();
  });

  it("safeClearCache and safeInvalidatePattern execute safely without throwing errors", () => {
    expect(() => safeClearCache()).not.toThrow();
    expect(() => safeInvalidatePattern(/product/)).not.toThrow();
  });
});
