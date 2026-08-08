/**
 * Focused unit tests for the four RBAC middleware functions:
 *   isAuthenticated, isAdmin, isSeller (requireVendorAuth), isCustomer
 *
 * Each middleware is tested against:
 *  - the "deny" path (unauthenticated / wrong role / missing key / bad status)
 *  - the "allow" path (correct identity)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Request, Response, NextFunction } from "express";

// ─── helpers ────────────────────────────────────────────────────────────────

function mockReq(overrides: Record<string, unknown> = {}): Request {
  return {
    headers: {},
    log: { error: vi.fn(), info: vi.fn() },
    ...overrides,
  } as unknown as Request;
}

function mockRes() {
  const res: any = {};
  res.status = vi.fn(() => res);
  res.json = vi.fn(() => res);
  return res as Response & {
    status: ReturnType<typeof vi.fn>;
    json: ReturnType<typeof vi.fn>;
  };
}

const next: NextFunction = vi.fn();

// ─── module mocks ────────────────────────────────────────────────────────────

const mockGetAuth = vi.fn();

vi.mock("@clerk/express", () => ({
  getAuth: (...args: unknown[]) => mockGetAuth(...args),
  clerkMiddleware: vi.fn(
    () => (_req: unknown, _res: unknown, n: () => void) => n(),
  ),
}));

// db.select() returns a chain; each test customises the leaf rows via chainReturning()
const mockDbSelect = vi.fn();
vi.mock("@workspace/db", () => ({
  db: { select: (...args: unknown[]) => mockDbSelect(...args) },
  vendorsTable: { id: "id", ownerId: "ownerId", status: "status" },
  commissionRulesTable: { active: "active" },
}));

// ─── imports (after mocks) ───────────────────────────────────────────────────

import { isAuthenticated } from "../middlewares/isAuthenticated";
import { isAdmin } from "../middlewares/isAdmin";
import { isSeller } from "../middlewares/isSeller";
import { isCustomer } from "../middlewares/isCustomer";

// ─── shared reset ────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── DB chain helper ─────────────────────────────────────────────────────────

function chainReturning(rows: unknown[]) {
  return {
    from: vi.fn(() => ({
      where: vi.fn(() => ({
        limit: vi.fn(() => Promise.resolve(rows)),
      })),
    })),
  };
}

// ─── isAuthenticated ─────────────────────────────────────────────────────────

describe("isAuthenticated", () => {
  it("returns 401 when no Clerk session", () => {
    mockGetAuth.mockReturnValue({ userId: null });
    isAuthenticated(mockReq(), mockRes(), next);

    expect(next).not.toHaveBeenCalled();
  });

  it("returns 401 when getAuth returns empty object", () => {
    mockGetAuth.mockReturnValue({});
    const res = mockRes();
    isAuthenticated(mockReq(), res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("sets req.userId and calls next() for an authenticated user", () => {
    mockGetAuth.mockReturnValue({ userId: "user-abc" });
    const req = mockReq();
    const res = mockRes();

    isAuthenticated(req, res, next);

    expect((req as any).userId).toBe("user-abc");
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("prefers sessionClaims.userId over top-level userId", () => {
    mockGetAuth.mockReturnValue({
      userId: "outer-id",
      sessionClaims: { userId: "claims-id" },
    });
    const req = mockReq();
    isAuthenticated(req, mockRes(), next);

    expect((req as any).userId).toBe("claims-id");
    expect(next).toHaveBeenCalled();
  });
});

// ─── isAdmin ─────────────────────────────────────────────────────────────────

describe("isAdmin", () => {
  const ORIGINAL_KEY = process.env.ADMIN_API_KEY;

  beforeEach(() => {
    process.env.ADMIN_API_KEY = "secret-admin-key";
  });

  afterEach(() => {
    process.env.ADMIN_API_KEY = ORIGINAL_KEY;
  });

  it("returns 403 when no x-admin-key header is present", () => {
    const res = mockRes();
    isAdmin(mockReq({ headers: {} }), res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 403 for a wrong admin key", () => {
    const res = mockRes();
    isAdmin(mockReq({ headers: { "x-admin-key": "wrong-key" } }), res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it("calls next() for the correct admin key", () => {
    const res = mockRes();
    isAdmin(
      mockReq({ headers: { "x-admin-key": "secret-admin-key" } }),
      res,
      next,
    );

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("returns 403 when ADMIN_API_KEY env var is not set", () => {
    delete process.env.ADMIN_API_KEY;
    const res = mockRes();
    isAdmin(mockReq({ headers: { "x-admin-key": "any-key" } }), res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });
});

// ─── isSeller ────────────────────────────────────────────────────────────────

describe("isSeller", () => {
  it("returns 401 when caller is unauthenticated", async () => {
    mockGetAuth.mockReturnValue({ userId: null });
    const res = mockRes();

    await isSeller(mockReq(), res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 403 when no vendor record exists for the user", async () => {
    mockGetAuth.mockReturnValue({ userId: "user-no-vendor" });
    mockDbSelect.mockReturnValue(chainReturning([]));
    const res = mockRes();

    await isSeller(mockReq(), res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 403 with VENDOR_PENDING code for a pending vendor", async () => {
    mockGetAuth.mockReturnValue({ userId: "vendor-pending" });
    mockDbSelect.mockReturnValue(
      chainReturning([{ id: "v1", status: "pending", ownerId: "vendor-pending" }]),
    );
    const res = mockRes();

    await isSeller(mockReq(), res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: "VENDOR_PENDING" }),
    );
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 403 with VENDOR_SUSPENDED code for a suspended vendor", async () => {
    mockGetAuth.mockReturnValue({ userId: "vendor-suspended" });
    mockDbSelect.mockReturnValue(
      chainReturning([{ id: "v2", status: "suspended", ownerId: "vendor-suspended" }]),
    );
    const res = mockRes();

    await isSeller(mockReq(), res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: "VENDOR_SUSPENDED" }),
    );
    expect(next).not.toHaveBeenCalled();
  });

  it("sets req.vendor and calls next() for an approved vendor", async () => {
    mockGetAuth.mockReturnValue({ userId: "vendor-ok" });
    const vendorRow = { id: "v3", status: "approved", ownerId: "vendor-ok" };
    mockDbSelect.mockReturnValue(chainReturning([vendorRow]));
    const req = mockReq();
    const res = mockRes();

    await isSeller(req, res, next);

    expect((req as any).vendor).toEqual(vendorRow);
    expect((req as any).vendorId).toBe("v3");
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });
});

// ─── isCustomer ──────────────────────────────────────────────────────────────

describe("isCustomer", () => {
  const ORIGINAL_KEY = process.env.ADMIN_API_KEY;

  beforeEach(() => {
    process.env.ADMIN_API_KEY = "secret-admin-key";
  });

  afterEach(() => {
    process.env.ADMIN_API_KEY = ORIGINAL_KEY;
  });

  it("returns 401 when not authenticated", async () => {
    mockGetAuth.mockReturnValue({ userId: null });
    const res = mockRes();

    await isCustomer(mockReq(), res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 403 when caller presents a valid admin key", async () => {
    mockGetAuth.mockReturnValue({ userId: "user-abc" });
    const res = mockRes();

    await isCustomer(
      mockReq({ headers: { "x-admin-key": "secret-admin-key" } }),
      res,
      next,
    );

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 403 when caller is a known vendor", async () => {
    mockGetAuth.mockReturnValue({ userId: "vendor-user" });
    mockDbSelect.mockReturnValue(chainReturning([{ id: "vendor-uuid" }]));
    const res = mockRes();

    await isCustomer(mockReq(), res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it("sets req.userId and calls next() for a regular customer", async () => {
    mockGetAuth.mockReturnValue({ userId: "customer-abc" });
    mockDbSelect.mockReturnValue(chainReturning([])); // no vendor record
    const req = mockReq();
    const res = mockRes();

    await isCustomer(req, res, next);

    expect((req as any).userId).toBe("customer-abc");
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });
});
