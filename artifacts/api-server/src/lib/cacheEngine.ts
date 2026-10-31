interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

/**
 * High-performance Cache Engine with Single-Flight Stampede Protection,
 * deterministic key generation, and pattern-based cache invalidation.
 */
export class CacheEngine {
  private cache = new Map<string, CacheEntry<any>>();
  private inFlight = new Map<string, Promise<any>>();
  private hits = 0;
  private misses = 0;
  private defaultTtlMs: number;

  constructor(defaultTtlMs = 60_000) {
    this.defaultTtlMs = defaultTtlMs;
    // Periodic cleanup every 60 seconds
    setInterval(() => this.cleanupExpired(), 60_000).unref();
  }

  /**
   * Generates a deterministic, normalized cache key from a prefix and parameter object.
   * Sorting key names ensures same parameters in any order produce the EXACT same cache key.
   */
  public generateKey = (prefix: string, params: Record<string, any> = {}): string => {
    const keys = Object.keys(params)
      .filter((k) => params[k] !== undefined && params[k] !== null && params[k] !== "")
      .sort();

    if (keys.length === 0) return prefix;

    const serialized = keys.map((k) => `${k}=${String(params[k])}`).join(":");
    return `${prefix}:${serialized}`;
  };

  public get = <T>(key: string): T | undefined => {
    const entry = this.cache.get(key);
    if (!entry) {
      this.misses++;
      return undefined;
    }
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      this.misses++;
      return undefined;
    }
    this.hits++;
    return entry.value as T;
  };

  public set = <T>(key: string, value: T, ttlMs?: number): void => {
    const ttl = ttlMs ?? this.defaultTtlMs;
    this.cache.set(key, {
      value,
      expiresAt: Date.now() + ttl,
    });
  };

  public del = (key: string): boolean => {
    return this.cache.delete(key);
  };

  public clear = (): void => {
    this.cache.clear();
    this.inFlight.clear();
    this.hits = 0;
    this.misses = 0;
  };

  public reset = (): void => {
    this.clear();
  };

  public invalidatePattern = (pattern: string | RegExp): number => {
    let deletedCount = 0;
    const regex = typeof pattern === "string" ? new RegExp(pattern) : pattern;
    for (const key of this.cache.keys()) {
      if (regex.test(key)) {
        this.cache.delete(key);
        deletedCount++;
      }
    }
    return deletedCount;
  };

  /**
   * Cache-First Read Strategy with Request Deduplication (Single-Flight).
   * Prevents cache stampedes when multiple requests fetch the same uncached key simultaneously.
   */
  public getOrFetch = async <T>(
    key: string,
    fetchFn: () => Promise<T>,
    ttlMs?: number
  ): Promise<T> => {
    const cached = this.get<T>(key);
    if (cached !== undefined) {
      return cached;
    }

    // Check if another request is ALREADY executing fetchFn for this exact key
    if (this.inFlight.has(key)) {
      return (await this.inFlight.get(key)) as T;
    }

    // Single-Flight: Create the promise and store in inFlight Map
    const promise = fetchFn()
      .then((data) => {
        if (data !== undefined && data !== null) {
          this.set(key, data, ttlMs);
        }
        return data;
      })
      .finally(() => {
        this.inFlight.delete(key);
      });

    this.inFlight.set(key, promise);
    return promise;
  };

  private cleanupExpired = (): void => {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
      }
    }
  };

  public getMetrics = () => {
    const total = this.hits + this.misses;
    const hitRatio = total > 0 ? ((this.hits / total) * 100).toFixed(2) + "%" : "0%";
    return {
      hits: this.hits,
      misses: this.misses,
      size: this.cache.size,
      inFlightCount: this.inFlight.size,
      hitRatio,
    };
  };
}

export const globalCache = new CacheEngine(60_000);

export function safeClearCache(): void {
  try {
    if (typeof globalCache?.clear === "function") {
      globalCache.clear();
    } else if (typeof globalCache?.reset === "function") {
      globalCache.reset();
    }
  } catch (err) {
    console.warn("[CacheEngine] Non-critical cache clear warning:", err);
  }
}

export function safeInvalidatePattern(pattern: string | RegExp): number {
  try {
    if (typeof globalCache?.invalidatePattern === "function") {
      return globalCache.invalidatePattern(pattern);
    }
  } catch (err) {
    console.warn("[CacheEngine] Non-critical cache invalidation warning:", err);
  }
  return 0;
}

