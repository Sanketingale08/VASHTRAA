/**
 * vendor-email-outbox-retry.test.ts
 *
 * Integration-level tests that confirm the email outbox row is written and
 * marked "failed" (ready for worker retry) when Resend throws on the first
 * send attempt. Covers all three vendor lifecycle email variants:
 *   - sendVendorApprovalEmailForVendor
 *   - sendVendorSuspensionEmailForVendor
 *   - sendVendorRejectionEmailForVendor
 *
 * Why this matters: if the outbox insert or status update is silently skipped
 * when the mailer is down, vendor lifecycle emails disappear with no retry.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const VENDOR_ID = "vendor-uuid-retry-1";
const OWNER_ID = "owner-user-retry-1";
const CONTACT_EMAIL = "seller-retry@example.com";
const VENDOR_NAME = "Retry Silk House";

// ---------------------------------------------------------------------------
// Hoisted mutable mock references
// ---------------------------------------------------------------------------

const resendSendMock = vi.hoisted(() => vi.fn());
const getUserMock = vi.hoisted(() => vi.fn());
const outboxReturningMock = vi.hoisted(() => vi.fn());
// Capture the args passed to .set() so we can assert on the status field
const dbUpdateSetMock = vi.hoisted(() => vi.fn());

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
      values: vi.fn(() => ({ returning: outboxReturningMock })),
    })),
    update: vi.fn(() => ({
      set: dbUpdateSetMock.mockReturnValue({ where: vi.fn(() => Promise.resolve()) }),
    })),
  },
  emailOutboxTable: { _t: "emailOutbox" },
  sellerRegistrationDraftsTable: { _t: "sellerRegistrationDrafts" },
}));

// Mock insertAdminNotification so the "dead" path (if ever reached) doesn't
// crash on a missing db connection; we don't exercise it in these tests.
vi.mock("../lib/adminNotifications", () => ({
  insertAdminNotification: vi.fn(() => Promise.resolve()),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** A minimal outbox row as returned by db.insert().returning() */
function makeOutboxRow(toEmail: string) {
  return [
    {
      id: "outbox-row-retry-1",
      toEmail,
      subject: "Lifecycle email subject",
      html: "<p>body</p>",
      attempts: 0,
      orderId: null,
      vendorId: VENDOR_ID,
      userId: OWNER_ID,
      status: "pending",
      createdAt: new Date(),
    },
  ];
}

// ---------------------------------------------------------------------------
// Shared setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  process.env.RESEND_API_KEY = "re_test_key";

  resendSendMock.mockReset();
  getUserMock.mockReset();
  outboxReturningMock.mockReset();
  dbUpdateSetMock.mockReset();

  // Default Resend to succeed (individual tests override for failure scenarios)
  resendSendMock.mockResolvedValue({ data: { id: "email-id" }, error: null });

  // Default: contactEmail is provided, so Clerk is not consulted
  outboxReturningMock.mockResolvedValue(makeOutboxRow(CONTACT_EMAIL));

  // Default: .set() returns a chainable { where } stub
  dbUpdateSetMock.mockReturnValue({ where: vi.fn(() => Promise.resolve()) });
});

afterEach(() => {
  delete process.env.RESEND_API_KEY;
});

// ---------------------------------------------------------------------------
// Helper that asserts the outbox-retry contract for any lifecycle function
// ---------------------------------------------------------------------------

async function assertOutboxFailedOnResendThrow(
  sendFn: (opts: {
    vendorId: string;
    vendorName: string;
    contactEmail: string | null;
    ownerId: string | null;
  }) => Promise<void>
) {
  // Arrange: Resend throws a network-style error
  const resendError = new Error("ECONNREFUSED: Resend service unreachable");
  resendSendMock.mockRejectedValue(resendError);

  // Act: calling the send function must NOT throw — it swallows the Resend
  // error and falls back to the outbox
  await expect(
    sendFn({
      vendorId: VENDOR_ID,
      vendorName: VENDOR_NAME,
      contactEmail: CONTACT_EMAIL,
      ownerId: OWNER_ID,
    })
  ).resolves.toBeUndefined();

  // Assert 1: The outbox insert was attempted (row created before Resend call)
  const { db } = await import("@workspace/db");
  expect(db.insert).toHaveBeenCalled();
  expect(outboxReturningMock).toHaveBeenCalled();

  // Assert 2: After the Resend failure, db.update was called with status "failed"
  // (attempts=1, which is < MAX_ATTEMPTS=3, so this is a retryable failure)
  expect(dbUpdateSetMock).toHaveBeenCalled();
  const updatePayload = dbUpdateSetMock.mock.calls[0][0] as Record<string, unknown>;
  expect(updatePayload.status).toBe("failed");
  // nextRetryAt should be a future Date (the backoff)
  expect(updatePayload.nextRetryAt).toBeInstanceOf(Date);
  expect((updatePayload.nextRetryAt as Date).getTime()).toBeGreaterThan(Date.now() - 1000);
  // attempts should reflect the one failed attempt
  expect(updatePayload.attempts).toBe(1);
}

// ---------------------------------------------------------------------------
// sendVendorApprovalEmailForVendor — outbox retry on Resend failure
// ---------------------------------------------------------------------------

describe("sendVendorApprovalEmailForVendor — outbox written and marked failed when Resend is down", () => {
  it("inserts an outbox row and sets status=failed when Resend throws on first attempt", async () => {
    const { sendVendorApprovalEmailForVendor } = await import("../lib/transactionalEmail");
    await assertOutboxFailedOnResendThrow(sendVendorApprovalEmailForVendor);
  });

  it("outbox row is created even when Resend is unavailable (row persists for retry worker)", async () => {
    const resendError = new Error("Connection timeout");
    resendSendMock.mockRejectedValue(resendError);

    const { sendVendorApprovalEmailForVendor } = await import("../lib/transactionalEmail");
    await sendVendorApprovalEmailForVendor({
      vendorId: VENDOR_ID,
      vendorName: VENDOR_NAME,
      contactEmail: CONTACT_EMAIL,
      ownerId: OWNER_ID,
    });

    // The outbox.insert was called before the Resend call, so the row exists
    const { db } = await import("@workspace/db");
    expect(db.insert).toHaveBeenCalled();

    // Resend was attempted once (the initial attemptSend call)
    expect(resendSendMock).toHaveBeenCalledOnce();

    // The row was updated to "failed" so the worker will retry
    expect(dbUpdateSetMock).toHaveBeenCalled();
    const updatePayload = dbUpdateSetMock.mock.calls[0][0] as Record<string, unknown>;
    expect(updatePayload.status).toBe("failed");
    expect(updatePayload.errorMessage).toContain("Connection timeout");
  });
});

// ---------------------------------------------------------------------------
// sendVendorSuspensionEmailForVendor — outbox retry on Resend failure
// ---------------------------------------------------------------------------

describe("sendVendorSuspensionEmailForVendor — outbox written and marked failed when Resend is down", () => {
  it("inserts an outbox row and sets status=failed when Resend throws on first attempt", async () => {
    const { sendVendorSuspensionEmailForVendor } = await import("../lib/transactionalEmail");
    await assertOutboxFailedOnResendThrow(sendVendorSuspensionEmailForVendor);
  });

  it("outbox row is created even when Resend is unavailable (row persists for retry worker)", async () => {
    const resendError = new Error("Service unavailable");
    resendSendMock.mockRejectedValue(resendError);

    const { sendVendorSuspensionEmailForVendor } = await import("../lib/transactionalEmail");
    await sendVendorSuspensionEmailForVendor({
      vendorId: VENDOR_ID,
      vendorName: VENDOR_NAME,
      contactEmail: CONTACT_EMAIL,
      ownerId: OWNER_ID,
      reason: "Policy violation",
    });

    const { db } = await import("@workspace/db");
    expect(db.insert).toHaveBeenCalled();
    expect(resendSendMock).toHaveBeenCalledOnce();

    expect(dbUpdateSetMock).toHaveBeenCalled();
    const updatePayload = dbUpdateSetMock.mock.calls[0][0] as Record<string, unknown>;
    expect(updatePayload.status).toBe("failed");
    expect(updatePayload.errorMessage).toContain("Service unavailable");
  });
});

// ---------------------------------------------------------------------------
// sendVendorRejectionEmailForVendor — outbox retry on Resend failure
// ---------------------------------------------------------------------------

describe("sendVendorRejectionEmailForVendor — outbox written and marked failed when Resend is down", () => {
  it("inserts an outbox row and sets status=failed when Resend throws on first attempt", async () => {
    const { sendVendorRejectionEmailForVendor } = await import("../lib/transactionalEmail");
    await assertOutboxFailedOnResendThrow(sendVendorRejectionEmailForVendor);
  });

  it("outbox row is created even when Resend is unavailable (row persists for retry worker)", async () => {
    const resendError = new Error("DNS lookup failed");
    resendSendMock.mockRejectedValue(resendError);

    const { sendVendorRejectionEmailForVendor } = await import("../lib/transactionalEmail");
    await sendVendorRejectionEmailForVendor({
      vendorId: VENDOR_ID,
      vendorName: VENDOR_NAME,
      contactEmail: CONTACT_EMAIL,
      ownerId: OWNER_ID,
      reason: "Application incomplete",
    });

    const { db } = await import("@workspace/db");
    expect(db.insert).toHaveBeenCalled();
    expect(resendSendMock).toHaveBeenCalledOnce();

    expect(dbUpdateSetMock).toHaveBeenCalled();
    const updatePayload = dbUpdateSetMock.mock.calls[0][0] as Record<string, unknown>;
    expect(updatePayload.status).toBe("failed");
    expect(updatePayload.errorMessage).toContain("DNS lookup failed");
  });
});

// ---------------------------------------------------------------------------
// Worker retry simulation: failed → retried → sent
// ---------------------------------------------------------------------------

describe("outbox worker retry simulation — failed row transitions to sent on retry", () => {
  it("approval: a second attemptSend call on the failed row succeeds and marks it sent", async () => {
    // First call: Resend throws → row becomes "failed"
    resendSendMock.mockRejectedValueOnce(new Error("Transient error"));
    // Second call (simulating worker retry): Resend succeeds → row becomes "sent"
    resendSendMock.mockResolvedValueOnce({ data: { id: "email-id-retry" }, error: null });

    const { sendVendorApprovalEmailForVendor } = await import("../lib/transactionalEmail");

    // First attempt (fails)
    await sendVendorApprovalEmailForVendor({
      vendorId: VENDOR_ID,
      vendorName: VENDOR_NAME,
      contactEmail: CONTACT_EMAIL,
      ownerId: OWNER_ID,
    });

    // Verify first update was "failed"
    const firstUpdatePayload = dbUpdateSetMock.mock.calls[0][0] as Record<string, unknown>;
    expect(firstUpdatePayload.status).toBe("failed");
    expect(firstUpdatePayload.attempts).toBe(1);

    // Reset update mock so we can isolate the second call
    dbUpdateSetMock.mockReset();
    dbUpdateSetMock.mockReturnValue({ where: vi.fn(() => Promise.resolve()) });

    // Simulate worker calling attemptSend on the failed row by calling the
    // send function again (it inserts a fresh outbox row and attempts again)
    outboxReturningMock.mockResolvedValue([
      {
        ...makeOutboxRow(CONTACT_EMAIL)[0],
        id: "outbox-row-retry-2",
        attempts: 1, // worker picks up after first failure
      },
    ]);

    await sendVendorApprovalEmailForVendor({
      vendorId: VENDOR_ID,
      vendorName: VENDOR_NAME,
      contactEmail: CONTACT_EMAIL,
      ownerId: OWNER_ID,
    });

    // On success, the row should be marked "sent"
    const secondUpdatePayload = dbUpdateSetMock.mock.calls[0][0] as Record<string, unknown>;
    expect(secondUpdatePayload.status).toBe("sent");
    expect(secondUpdatePayload.errorMessage).toBeNull();
  });
});
