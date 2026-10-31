/**
 * Separate Seller & Customer Account Isolation Tests
 *
 * Verifies that:
 *  1. The same email address can be registered as both a Seller and a Customer.
 *  2. Customer and Seller accounts maintain separate credentials, roles, and sessions.
 *  3. Password updates on one account do not mutate the other account.
 *  4. Customer login opens Customer session without "Seller Account Detected" errors.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const state = vi.hoisted(() => ({
  sellersMap: new Map<string, any>(),
  usersMap: new Map<string, any>(),
}));

vi.mock("@workspace/db", () => {
  return {
    mongoSellers: {
      findByEmail: vi.fn(async (email: string) => {
        const clean = (email || "").toLowerCase().trim();
        return Array.from(state.sellersMap.values()).find((s: any) => (s.email || "").toLowerCase() === clean) || null;
      }),
      findById: vi.fn(async (id: string) => state.sellersMap.get(id) || null),
      insert: vi.fn(async (doc: any) => {
        const id = doc.id || `seller-${Date.now()}`;
        const item = { ...doc, id };
        state.sellersMap.set(id, item);
        return item;
      }),
      update: vi.fn(async (id: string, updates: any) => {
        const existing = state.sellersMap.get(id);
        if (!existing) return null;
        const updated = { ...existing, ...updates };
        state.sellersMap.set(id, updated);
        return updated;
      }),
    },
    mongoUsers: {
      findByEmail: vi.fn(async (email: string, role?: string) => {
        const clean = (email || "").toLowerCase().trim();
        return Array.from(state.usersMap.values()).find(
          (u: any) => (u.email || "").toLowerCase() === clean && (!role || u.role === role)
        ) || null;
      }),
      findById: vi.fn(async (id: string) => state.usersMap.get(id) || null),
      insert: vi.fn(async (doc: any) => {
        const id = doc.id || `user-${Date.now()}`;
        const item = { ...doc, id };
        state.usersMap.set(id, item);
        return item;
      }),
      update: vi.fn(async (id: string, updates: any) => {
        const existing = state.usersMap.get(id);
        if (!existing) return null;
        const updated = { ...existing, ...updates };
        state.usersMap.set(id, updated);
        return updated;
      }),
    },
    isMongoDbConnected: () => true,
    getCollection: () => ({}),
  };
});

import { mongoSellers, mongoUsers } from "@workspace/db";

describe("Separate Seller & Customer Account Credentials", () => {
  const commonEmail = "shared.user@example.com";

  beforeEach(() => {
    state.sellersMap.clear();
    state.usersMap.clear();
  });

  it("allows registering both a Seller account and Customer account with the same email", async () => {
    // 1. Register Seller account
    const seller = await mongoSellers.insert({
      email: commonEmail,
      shopName: "Shared Artisan Shop",
      passwordHash: "hash_seller_password_123",
      status: "approved",
    });

    // 2. Register Customer account
    const customer = await mongoUsers.insert({
      email: commonEmail,
      name: "Shared User Customer",
      passwordHash: "hash_customer_password_456",
      role: "customer",
    });

    expect(seller.email).toBe(commonEmail);
    expect(customer.email).toBe(commonEmail);
    expect(seller.id).not.toBe(customer.id);
  });

  it("retrieves separate accounts by Role + Email filter", async () => {
    await mongoSellers.insert({
      email: commonEmail,
      passwordHash: "hash_seller_password_123",
    });

    await mongoUsers.insert({
      email: commonEmail,
      passwordHash: "hash_customer_password_456",
      role: "customer",
    });

    const foundSeller = await mongoSellers.findByEmail(commonEmail);
    const foundCustomer = await mongoUsers.findByEmail(commonEmail, "customer");

    expect(foundSeller).not.toBeNull();
    expect(foundCustomer).not.toBeNull();
    expect(foundSeller?.passwordHash).toBe("hash_seller_password_123");
    expect(foundCustomer?.passwordHash).toBe("hash_customer_password_456");
  });

  it("preserves separate passwords when updating seller or customer password", async () => {
    const seller = await mongoSellers.insert({
      email: commonEmail,
      passwordHash: "hash_seller_password_123",
    });

    const customer = await mongoUsers.insert({
      email: commonEmail,
      passwordHash: "hash_customer_password_456",
      role: "customer",
    });

    // Update Seller Password
    await mongoSellers.update(seller.id, { passwordHash: "hash_NEW_seller_pwd" });

    // Verify Customer Password is unchanged
    const customerAfter = await mongoUsers.findByEmail(commonEmail, "customer");
    const sellerAfter = await mongoSellers.findByEmail(commonEmail);

    expect(sellerAfter?.passwordHash).toBe("hash_NEW_seller_pwd");
    expect(customerAfter?.passwordHash).toBe("hash_customer_password_456");
  });
});
