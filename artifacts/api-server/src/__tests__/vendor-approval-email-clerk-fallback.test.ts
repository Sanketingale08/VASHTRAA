/**
 * vendor-approval-email-clerk-fallback.test.ts
 *
 * Unit tests for sendVendorApprovalEmailForVendor that verify the Clerk email
 * fallback path inside sendVendorLifecycleEmail:
 *   1. contactEmail present  → used directly, Clerk is NOT consulted
 *   2. contactEmail null     → getUserEmail(ownerId) is called as fallback
 *   3. both sources absent   → graceful no-op, Resend is NOT called
 *
 * Uses top-level vi.mock for all dependencies so the real transactionalEmail.ts
 * implementation is exercised.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const VENDOR_ID = "vendor-uuid-1";
const OWNER_ID = "owner-user-1";
const CONTACT_EMAIL = "seller@example.com";
const CLERK_EMAIL = "clerk-seller@example.com";
const VENDOR_NAME = "Silk Emporium";

// ---------------------------------------------------------------------------
// Hoisted mutable mock references — updated per-test via mockReset/mockReturnValue
// ---------------------------------------------------------------------------

const resendSendMock = vi.hoisted(() => vi.fn());
const getUserMock = vi.hoisted(() => vi.fn());
const outboxReturningMock = vi.hoisted(() => vi.fn());

// ---------------------------------------------------------------------------
// Top-level module mocks (applied before any import of transactionalEmail)
// ---------------------------------------------------------------------------

/**
 * Mock the Resend client as a proper class so `new Resend(apiKey)` works.
 */
vi.mock("resend", () => ({
  Resend: class MockResend {
    emails = { send: resendSendMock };
  },
}));

vi.mock("@clerk/express", () => ({
  clerkClient: { users: { getUser: getUserMock } },
  getAuth: vi.fn(() => ({ userId: OWNER_ID })),
  clerkMiddleware: vi.fn(() => (_: any, __: any, next: any) => next()),
}));

vi.mock("@workspace/db", () => ({
  db: {
    insert: vi.fn(() => ({
      values: vi.fn(() => ({ returning: outboxReturningMock })),
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({ where: vi.fn(() => Promise.resolve()) })),
    })),
  },
  emailOutboxTable: { _t: "emailOutbox" },
  sellerRegistrationDraftsTable: { _t: "sellerRegistrationDrafts" },
}));

// ---------------------------------------------------------------------------
// Shared default outbox row (sufficient for all tests that reach Resend)
// ---------------------------------------------------------------------------

function makeOutboxRow(toEmail: string) {
  return [
    {
      id: "outbox-row-1",
      toEmail,
      subject: "Test subject",
      html: "<p>body</p>",
      attempts: 0,
      orderId: null,
      userId: OWNER_ID,
      status: "pending",
      createdAt: new Date(),
    },
  ];
}

// ---------------------------------------------------------------------------
// sendVendorApprovalEmailForVendor — Clerk email fallback
// ---------------------------------------------------------------------------

describe("sendVendorApprovalEmailForVendor — Clerk email fallback", () => {
  beforeEach(() => {
    process.env.RESEND_API_KEY = "re_test_key";
    resendSendMock.mockReset();
    resendSendMock.mockResolvedValue({ data: { id: "email-id" }, error: null });
    getUserMock.mockReset();
    outboxReturningMock.mockReset();
  });

  afterEach(() => {
    delete process.env.RESEND_API_KEY;
  });

  it("uses contactEmail directly and does NOT call Clerk getUserEmail when contactEmail is set", async () => {
    outboxReturningMock.mockResolvedValue(makeOutboxRow(CONTACT_EMAIL));

    const { sendVendorApprovalEmailForVendor } = await import("../lib/transactionalEmail");
    await sendVendorApprovalEmailForVendor({
      vendorId: VENDOR_ID,
      vendorName: VENDOR_NAME,
      contactEmail: CONTACT_EMAIL,
      ownerId: OWNER_ID,
    });

    // Resend was called with the contactEmail
    expect(resendSendMock).toHaveBeenCalledOnce();
    const sendArg = resendSendMock.mock.calls[0][0];
    expect(sendArg.to).toContain(CONTACT_EMAIL);

    // Clerk was NOT consulted
    expect(getUserMock).not.toHaveBeenCalled();
  });

  it("falls back to Clerk getUserEmail when contactEmail is null and ownerId is set", async () => {
    // Clerk returns an email for the owner
    getUserMock.mockResolvedValue({
      primaryEmailAddress: { emailAddress: CLERK_EMAIL },
      emailAddresses: [{ emailAddress: CLERK_EMAIL }],
    });
    outboxReturningMock.mockResolvedValue(makeOutboxRow(CLERK_EMAIL));

    const { sendVendorApprovalEmailForVendor } = await import("../lib/transactionalEmail");
    await sendVendorApprovalEmailForVendor({
      vendorId: VENDOR_ID,
      vendorName: VENDOR_NAME,
      contactEmail: null,
      ownerId: OWNER_ID,
    });

    // Clerk WAS consulted
    expect(getUserMock).toHaveBeenCalledWith(OWNER_ID);

    // Resend was called with the Clerk-resolved address
    expect(resendSendMock).toHaveBeenCalledOnce();
    const sendArg = resendSendMock.mock.calls[0][0];
    expect(sendArg.to).toContain(CLERK_EMAIL);
  });

  it("does NOT send email and resolves gracefully when both contactEmail and ownerId are null", async () => {
    const { sendVendorApprovalEmailForVendor } = await import("../lib/transactionalEmail");

    await expect(
      sendVendorApprovalEmailForVendor({
        vendorId: VENDOR_ID,
        vendorName: VENDOR_NAME,
        contactEmail: null,
        ownerId: null,
      })
    ).resolves.toBeUndefined();

    expect(getUserMock).not.toHaveBeenCalled();
    expect(resendSendMock).not.toHaveBeenCalled();
  });

  it("does NOT send email and resolves gracefully when contactEmail is null and Clerk yields no address", async () => {
    // Simulate Clerk throwing (e.g. user deleted)
    getUserMock.mockRejectedValue(new Error("User not found"));

    const { sendVendorApprovalEmailForVendor } = await import("../lib/transactionalEmail");

    await expect(
      sendVendorApprovalEmailForVendor({
        vendorId: VENDOR_ID,
        vendorName: VENDOR_NAME,
        contactEmail: null,
        ownerId: OWNER_ID,
      })
    ).resolves.toBeUndefined();

    expect(getUserMock).toHaveBeenCalledWith(OWNER_ID);
    expect(resendSendMock).not.toHaveBeenCalled();
  });

  it("writes an outbox record whose subject references the store being live or approved", async () => {
    // Capture the values passed to db.insert so we can inspect the real subject
    // (Resend just replays entry.subject from the outbox row, so we check the insert.)
    let insertedValues: any = null;
    const { db } = await import("@workspace/db");
    (db.insert as any).mockImplementationOnce(() => ({
      values: vi.fn((vals: any) => {
        insertedValues = vals;
        return { returning: outboxReturningMock };
      }),
    }));
    outboxReturningMock.mockResolvedValue(makeOutboxRow(CONTACT_EMAIL));

    const { sendVendorApprovalEmailForVendor } = await import("../lib/transactionalEmail");
    await sendVendorApprovalEmailForVendor({
      vendorId: VENDOR_ID,
      vendorName: VENDOR_NAME,
      contactEmail: CONTACT_EMAIL,
      ownerId: OWNER_ID,
    });

    expect(insertedValues).not.toBeNull();
    expect(insertedValues.subject.toLowerCase()).toMatch(/approv|live/);
  });

  it("does NOT call Resend when RESEND_API_KEY is not set", async () => {
    delete process.env.RESEND_API_KEY;

    const { sendVendorApprovalEmailForVendor } = await import("../lib/transactionalEmail");

    await expect(
      sendVendorApprovalEmailForVendor({
        vendorId: VENDOR_ID,
        vendorName: VENDOR_NAME,
        contactEmail: CONTACT_EMAIL,
        ownerId: OWNER_ID,
      })
    ).resolves.toBeUndefined();

    expect(resendSendMock).not.toHaveBeenCalled();
  });
});
