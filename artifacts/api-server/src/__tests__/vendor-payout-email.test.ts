/**
 * vendor-payout-email.test.ts
 *
 * Unit tests for the three payout email helpers:
 *   - sendVendorPayoutRequestApprovedEmail
 *   - sendVendorPayoutApprovedEmail
 *   - sendVendorPayoutRejectedEmail
 *
 * Each helper delegates to sendVendorLifecycleEmail, so the same address
 * resolution behaviour applies:
 *   1. contactEmail present  → used directly, Clerk is NOT consulted
 *   2. contactEmail null     → getUserEmail(ownerId) called as fallback
 *   3. both sources absent   → graceful no-op, Resend AND db.insert NOT called
 *
 * Uses top-level vi.mock so the real transactionalEmail.ts implementation is
 * exercised (same approach as vendor-email-clerk-fallback.test.ts).
 *
 * Key correctness guarantee: we assert on the `toEmail` argument passed to
 * db.insert().values(), not just on the address Resend receives. This confirms
 * address resolution happens correctly before the outbox row is written.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const VENDOR_ID = "vendor-payout-1";
const OWNER_ID = "owner-payout-1";
const CONTACT_EMAIL = "payoutseller@example.com";
const CLERK_EMAIL = "clerk-payout@example.com";
const VENDOR_NAME = "Payout Silks";
const AMOUNT = 15000;

// ---------------------------------------------------------------------------
// Hoisted mutable mock references
// ---------------------------------------------------------------------------

const resendSendMock = vi.hoisted(() => vi.fn());
const getUserMock = vi.hoisted(() => vi.fn());
const valuesMock = vi.hoisted(() => vi.fn());
const outboxReturningMock = vi.hoisted(() => vi.fn());

// ---------------------------------------------------------------------------
// Top-level module mocks
// ---------------------------------------------------------------------------

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
      values: valuesMock,
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({ where: vi.fn(() => Promise.resolve()) })),
    })),
  },
  emailOutboxTable: { _t: "emailOutbox" },
  sellerRegistrationDraftsTable: { _t: "sellerRegistrationDrafts" },
}));

// ---------------------------------------------------------------------------
// Helper: shared outbox row returned by .returning()
// ---------------------------------------------------------------------------

function makeOutboxRow(toEmail: string) {
  return [
    {
      id: "outbox-row-payout-1",
      toEmail,
      subject: "Test subject",
      html: "<p>body</p>",
      attempts: 0,
      orderId: null,
      userId: OWNER_ID,
      vendorId: VENDOR_ID,
      status: "pending",
      createdAt: new Date(),
    },
  ];
}

// ---------------------------------------------------------------------------
// Shared beforeEach / afterEach
// ---------------------------------------------------------------------------

function setupBeforeEach() {
  process.env.RESEND_API_KEY = "re_test_key";
  resendSendMock.mockReset();
  resendSendMock.mockResolvedValue({ data: { id: "email-id" }, error: null });
  getUserMock.mockReset();
  valuesMock.mockReset();
  outboxReturningMock.mockReset();
  // Wire valuesMock → returning → outboxReturningMock
  valuesMock.mockReturnValue({ returning: outboxReturningMock });
}

function teardownAfterEach() {
  delete process.env.RESEND_API_KEY;
}

// ===========================================================================
// sendVendorPayoutRequestApprovedEmail
// ===========================================================================

describe("sendVendorPayoutRequestApprovedEmail — Clerk email fallback", () => {
  beforeEach(setupBeforeEach);
  afterEach(teardownAfterEach);

  it("uses contactEmail directly and does NOT call Clerk when contactEmail is set", async () => {
    outboxReturningMock.mockResolvedValue(makeOutboxRow(CONTACT_EMAIL));

    const { sendVendorPayoutRequestApprovedEmail } = await import("../lib/transactionalEmail");
    await sendVendorPayoutRequestApprovedEmail({
      vendorId: VENDOR_ID,
      vendorName: VENDOR_NAME,
      contactEmail: CONTACT_EMAIL,
      ownerId: OWNER_ID,
      amount: AMOUNT,
    });

    // Address resolution: assert toEmail stored in outbox row
    expect(valuesMock).toHaveBeenCalledOnce();
    expect(valuesMock.mock.calls[0][0]).toMatchObject({ toEmail: CONTACT_EMAIL });

    // Resend was called with the contactEmail
    expect(resendSendMock).toHaveBeenCalledOnce();
    expect(resendSendMock.mock.calls[0][0].to).toContain(CONTACT_EMAIL);

    // Clerk was NOT consulted
    expect(getUserMock).not.toHaveBeenCalled();
  });

  it("falls back to Clerk getUserEmail when contactEmail is null and ownerId is set", async () => {
    getUserMock.mockResolvedValue({
      primaryEmailAddress: { emailAddress: CLERK_EMAIL },
      emailAddresses: [{ emailAddress: CLERK_EMAIL }],
    });
    outboxReturningMock.mockResolvedValue(makeOutboxRow(CLERK_EMAIL));

    const { sendVendorPayoutRequestApprovedEmail } = await import("../lib/transactionalEmail");
    await sendVendorPayoutRequestApprovedEmail({
      vendorId: VENDOR_ID,
      vendorName: VENDOR_NAME,
      contactEmail: null,
      ownerId: OWNER_ID,
      amount: AMOUNT,
    });

    // Clerk WAS consulted
    expect(getUserMock).toHaveBeenCalledWith(OWNER_ID);

    // Address resolution: Clerk address stored in outbox row
    expect(valuesMock).toHaveBeenCalledOnce();
    expect(valuesMock.mock.calls[0][0]).toMatchObject({ toEmail: CLERK_EMAIL });

    // Resend was called with the Clerk-resolved address
    expect(resendSendMock).toHaveBeenCalledOnce();
    expect(resendSendMock.mock.calls[0][0].to).toContain(CLERK_EMAIL);
  });

  it("does NOT insert into outbox and does NOT send email when both contactEmail and ownerId are null", async () => {
    const { sendVendorPayoutRequestApprovedEmail } = await import("../lib/transactionalEmail");

    await expect(
      sendVendorPayoutRequestApprovedEmail({
        vendorId: VENDOR_ID,
        vendorName: VENDOR_NAME,
        contactEmail: null,
        ownerId: null,
        amount: AMOUNT,
      })
    ).resolves.toBeUndefined();

    expect(getUserMock).not.toHaveBeenCalled();
    expect(valuesMock).not.toHaveBeenCalled();
    expect(resendSendMock).not.toHaveBeenCalled();
  });

  it("does NOT insert into outbox and does NOT send email when contactEmail is null and Clerk yields no address", async () => {
    getUserMock.mockRejectedValue(new Error("User not found"));

    const { sendVendorPayoutRequestApprovedEmail } = await import("../lib/transactionalEmail");

    await expect(
      sendVendorPayoutRequestApprovedEmail({
        vendorId: VENDOR_ID,
        vendorName: VENDOR_NAME,
        contactEmail: null,
        ownerId: OWNER_ID,
        amount: AMOUNT,
      })
    ).resolves.toBeUndefined();

    expect(getUserMock).toHaveBeenCalledWith(OWNER_ID);
    expect(valuesMock).not.toHaveBeenCalled();
    expect(resendSendMock).not.toHaveBeenCalled();
  });

  it("does NOT insert into outbox and does NOT send email when Clerk user has no email addresses", async () => {
    getUserMock.mockResolvedValue({
      primaryEmailAddress: null,
      emailAddresses: [],
    });

    const { sendVendorPayoutRequestApprovedEmail } = await import("../lib/transactionalEmail");

    await expect(
      sendVendorPayoutRequestApprovedEmail({
        vendorId: VENDOR_ID,
        vendorName: VENDOR_NAME,
        contactEmail: null,
        ownerId: OWNER_ID,
        amount: AMOUNT,
      })
    ).resolves.toBeUndefined();

    expect(getUserMock).toHaveBeenCalledWith(OWNER_ID);
    expect(valuesMock).not.toHaveBeenCalled();
    expect(resendSendMock).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// sendVendorPayoutApprovedEmail
// ===========================================================================

describe("sendVendorPayoutApprovedEmail — Clerk email fallback", () => {
  beforeEach(setupBeforeEach);
  afterEach(teardownAfterEach);

  it("uses contactEmail directly and does NOT call Clerk when contactEmail is set", async () => {
    outboxReturningMock.mockResolvedValue(makeOutboxRow(CONTACT_EMAIL));

    const { sendVendorPayoutApprovedEmail } = await import("../lib/transactionalEmail");
    await sendVendorPayoutApprovedEmail({
      vendorId: VENDOR_ID,
      vendorName: VENDOR_NAME,
      contactEmail: CONTACT_EMAIL,
      ownerId: OWNER_ID,
      amount: AMOUNT,
      utrNumber: "UTR123456789",
    });

    expect(valuesMock).toHaveBeenCalledOnce();
    expect(valuesMock.mock.calls[0][0]).toMatchObject({ toEmail: CONTACT_EMAIL });

    expect(resendSendMock).toHaveBeenCalledOnce();
    expect(resendSendMock.mock.calls[0][0].to).toContain(CONTACT_EMAIL);
    expect(getUserMock).not.toHaveBeenCalled();
  });

  it("falls back to Clerk getUserEmail when contactEmail is null and ownerId is set", async () => {
    getUserMock.mockResolvedValue({
      primaryEmailAddress: { emailAddress: CLERK_EMAIL },
      emailAddresses: [{ emailAddress: CLERK_EMAIL }],
    });
    outboxReturningMock.mockResolvedValue(makeOutboxRow(CLERK_EMAIL));

    const { sendVendorPayoutApprovedEmail } = await import("../lib/transactionalEmail");
    await sendVendorPayoutApprovedEmail({
      vendorId: VENDOR_ID,
      vendorName: VENDOR_NAME,
      contactEmail: null,
      ownerId: OWNER_ID,
      amount: AMOUNT,
    });

    expect(getUserMock).toHaveBeenCalledWith(OWNER_ID);

    expect(valuesMock).toHaveBeenCalledOnce();
    expect(valuesMock.mock.calls[0][0]).toMatchObject({ toEmail: CLERK_EMAIL });

    expect(resendSendMock).toHaveBeenCalledOnce();
    expect(resendSendMock.mock.calls[0][0].to).toContain(CLERK_EMAIL);
  });

  it("does NOT insert into outbox and does NOT send email when both contactEmail and ownerId are null", async () => {
    const { sendVendorPayoutApprovedEmail } = await import("../lib/transactionalEmail");

    await expect(
      sendVendorPayoutApprovedEmail({
        vendorId: VENDOR_ID,
        vendorName: VENDOR_NAME,
        contactEmail: null,
        ownerId: null,
        amount: AMOUNT,
      })
    ).resolves.toBeUndefined();

    expect(getUserMock).not.toHaveBeenCalled();
    expect(valuesMock).not.toHaveBeenCalled();
    expect(resendSendMock).not.toHaveBeenCalled();
  });

  it("does NOT insert into outbox and does NOT send email when contactEmail is null and Clerk yields no address", async () => {
    getUserMock.mockRejectedValue(new Error("User not found"));

    const { sendVendorPayoutApprovedEmail } = await import("../lib/transactionalEmail");

    await expect(
      sendVendorPayoutApprovedEmail({
        vendorId: VENDOR_ID,
        vendorName: VENDOR_NAME,
        contactEmail: null,
        ownerId: OWNER_ID,
        amount: AMOUNT,
      })
    ).resolves.toBeUndefined();

    expect(getUserMock).toHaveBeenCalledWith(OWNER_ID);
    expect(valuesMock).not.toHaveBeenCalled();
    expect(resendSendMock).not.toHaveBeenCalled();
  });

  it("does NOT insert into outbox and does NOT send email when Clerk user has no email addresses", async () => {
    getUserMock.mockResolvedValue({
      primaryEmailAddress: null,
      emailAddresses: [],
    });

    const { sendVendorPayoutApprovedEmail } = await import("../lib/transactionalEmail");

    await expect(
      sendVendorPayoutApprovedEmail({
        vendorId: VENDOR_ID,
        vendorName: VENDOR_NAME,
        contactEmail: null,
        ownerId: OWNER_ID,
        amount: AMOUNT,
      })
    ).resolves.toBeUndefined();

    expect(getUserMock).toHaveBeenCalledWith(OWNER_ID);
    expect(valuesMock).not.toHaveBeenCalled();
    expect(resendSendMock).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// sendVendorPayoutRejectedEmail
// ===========================================================================

describe("sendVendorPayoutRejectedEmail — Clerk email fallback", () => {
  beforeEach(setupBeforeEach);
  afterEach(teardownAfterEach);

  it("uses contactEmail directly and does NOT call Clerk when contactEmail is set", async () => {
    outboxReturningMock.mockResolvedValue(makeOutboxRow(CONTACT_EMAIL));

    const { sendVendorPayoutRejectedEmail } = await import("../lib/transactionalEmail");
    await sendVendorPayoutRejectedEmail({
      vendorId: VENDOR_ID,
      vendorName: VENDOR_NAME,
      contactEmail: CONTACT_EMAIL,
      ownerId: OWNER_ID,
      amount: AMOUNT,
      note: "Insufficient documentation",
    });

    expect(valuesMock).toHaveBeenCalledOnce();
    expect(valuesMock.mock.calls[0][0]).toMatchObject({ toEmail: CONTACT_EMAIL });

    expect(resendSendMock).toHaveBeenCalledOnce();
    expect(resendSendMock.mock.calls[0][0].to).toContain(CONTACT_EMAIL);
    expect(getUserMock).not.toHaveBeenCalled();
  });

  it("falls back to Clerk getUserEmail when contactEmail is null and ownerId is set", async () => {
    getUserMock.mockResolvedValue({
      primaryEmailAddress: { emailAddress: CLERK_EMAIL },
      emailAddresses: [{ emailAddress: CLERK_EMAIL }],
    });
    outboxReturningMock.mockResolvedValue(makeOutboxRow(CLERK_EMAIL));

    const { sendVendorPayoutRejectedEmail } = await import("../lib/transactionalEmail");
    await sendVendorPayoutRejectedEmail({
      vendorId: VENDOR_ID,
      vendorName: VENDOR_NAME,
      contactEmail: null,
      ownerId: OWNER_ID,
      amount: AMOUNT,
    });

    expect(getUserMock).toHaveBeenCalledWith(OWNER_ID);

    expect(valuesMock).toHaveBeenCalledOnce();
    expect(valuesMock.mock.calls[0][0]).toMatchObject({ toEmail: CLERK_EMAIL });

    expect(resendSendMock).toHaveBeenCalledOnce();
    expect(resendSendMock.mock.calls[0][0].to).toContain(CLERK_EMAIL);
  });

  it("does NOT insert into outbox and does NOT send email when both contactEmail and ownerId are null", async () => {
    const { sendVendorPayoutRejectedEmail } = await import("../lib/transactionalEmail");

    await expect(
      sendVendorPayoutRejectedEmail({
        vendorId: VENDOR_ID,
        vendorName: VENDOR_NAME,
        contactEmail: null,
        ownerId: null,
        amount: AMOUNT,
      })
    ).resolves.toBeUndefined();

    expect(getUserMock).not.toHaveBeenCalled();
    expect(valuesMock).not.toHaveBeenCalled();
    expect(resendSendMock).not.toHaveBeenCalled();
  });

  it("does NOT insert into outbox and does NOT send email when contactEmail is null and Clerk yields no address", async () => {
    getUserMock.mockRejectedValue(new Error("User not found"));

    const { sendVendorPayoutRejectedEmail } = await import("../lib/transactionalEmail");

    await expect(
      sendVendorPayoutRejectedEmail({
        vendorId: VENDOR_ID,
        vendorName: VENDOR_NAME,
        contactEmail: null,
        ownerId: OWNER_ID,
        amount: AMOUNT,
      })
    ).resolves.toBeUndefined();

    expect(getUserMock).toHaveBeenCalledWith(OWNER_ID);
    expect(valuesMock).not.toHaveBeenCalled();
    expect(resendSendMock).not.toHaveBeenCalled();
  });

  it("does NOT insert into outbox and does NOT send email when Clerk user has no email addresses", async () => {
    getUserMock.mockResolvedValue({
      primaryEmailAddress: null,
      emailAddresses: [],
    });

    const { sendVendorPayoutRejectedEmail } = await import("../lib/transactionalEmail");

    await expect(
      sendVendorPayoutRejectedEmail({
        vendorId: VENDOR_ID,
        vendorName: VENDOR_NAME,
        contactEmail: null,
        ownerId: OWNER_ID,
        amount: AMOUNT,
      })
    ).resolves.toBeUndefined();

    expect(getUserMock).toHaveBeenCalledWith(OWNER_ID);
    expect(valuesMock).not.toHaveBeenCalled();
    expect(resendSendMock).not.toHaveBeenCalled();
  });
});
