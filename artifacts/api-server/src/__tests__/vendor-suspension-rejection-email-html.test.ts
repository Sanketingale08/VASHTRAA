/**
 * vendor-suspension-rejection-email-html.test.ts
 *
 * Unit tests for the HTML output of sendVendorSuspensionEmailForVendor and
 * sendVendorRejectionEmailForVendor.
 *
 * Asserts:
 *   - The reason text appears in the generated HTML when reason is provided.
 *   - No reason paragraph is present when reason is omitted.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Capture the HTML that Resend would send
// ---------------------------------------------------------------------------

const sentEmails: { to: string[]; subject: string; html: string }[] = [];

const resendSendMock = vi.fn(async (payload: { to: string[]; subject: string; html: string }) => {
  sentEmails.push(payload);
  return { id: "mock-id" };
});

vi.mock("resend", () => {
  function ResendMock(_apiKey: string) {
    return { emails: { send: resendSendMock } };
  }
  return { Resend: ResendMock };
});

// ---------------------------------------------------------------------------
// @workspace/db mock — minimal outbox insert + update
// The insert mock echoes back whatever values were passed so that
// attemptSend uses the real subject/html (not a hardcoded stub).
// ---------------------------------------------------------------------------

vi.mock("@workspace/db", () => {
  const tag = (t: string, cols: string[]) =>
    Object.fromEntries([["_t", t], ...cols.map((c) => [c, c])]);

  const dbMock: any = {
    insert: vi.fn(() => ({
      values: vi.fn((vals: Record<string, unknown>) => ({
        returning: vi.fn(() =>
          Promise.resolve([
            {
              id: "outbox-1",
              attempts: 0,
              orderId: null,
              vendorId: "vendor-1",
              userId: "owner-1",
              // Echo back whatever the caller provided so attemptSend
              // uses the real subject and html
              ...vals,
            },
          ])
        ),
      })),
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => Promise.resolve()),
      })),
    })),
  };

  return {
    db: dbMock,
    emailOutboxTable: tag("emailOutbox", [
      "id",
      "userId",
      "orderId",
      "vendorId",
      "type",
      "toEmail",
      "subject",
      "html",
      "status",
      "attempts",
      "nextRetryAt",
    ]),
  };
});

// ---------------------------------------------------------------------------
// @clerk/express mock — not needed for these tests (contactEmail is provided)
// ---------------------------------------------------------------------------

vi.mock("@clerk/express", () => ({
  clerkClient: {
    users: { getUser: vi.fn() },
  },
}));

// ---------------------------------------------------------------------------
// adminNotifications mock — fire-and-forget helper imported transitively
// ---------------------------------------------------------------------------

vi.mock("../lib/adminNotifications", () => ({
  insertAdminNotification: vi.fn().mockResolvedValue(undefined),
}));

// ---------------------------------------------------------------------------
// Shared test opts
// ---------------------------------------------------------------------------

const BASE_OPTS = {
  vendorId: "vendor-1",
  vendorName: "Silk Emporium",
  contactEmail: "seller@example.com",
  ownerId: "owner-1",
} as const;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("sendVendorSuspensionEmailForVendor — HTML content", () => {
  beforeEach(() => {
    sentEmails.length = 0;
    resendSendMock.mockClear();
    // Ensure RESEND_API_KEY is set so the function doesn't bail early
    process.env.RESEND_API_KEY = "re_test_key";
  });

  it("includes the reason text in the HTML when reason is provided", async () => {
    const { sendVendorSuspensionEmailForVendor } = await import(
      "../lib/transactionalEmail"
    );

    const reason = "Violated marketplace policy regarding counterfeit goods";

    await sendVendorSuspensionEmailForVendor({ ...BASE_OPTS, reason });

    expect(resendSendMock).toHaveBeenCalledOnce();
    const { html } = resendSendMock.mock.calls[0][0];
    expect(html).toContain(reason);
  });

  it("does NOT include a reason paragraph when reason is omitted", async () => {
    const { sendVendorSuspensionEmailForVendor } = await import(
      "../lib/transactionalEmail"
    );

    await sendVendorSuspensionEmailForVendor({ ...BASE_OPTS });

    expect(resendSendMock).toHaveBeenCalledOnce();
    const { html } = resendSendMock.mock.calls[0][0];
    // The conditional block uses <strong>Reason:</strong> label
    expect(html).not.toContain("Reason:");
  });

  it("does NOT include a reason paragraph when reason is an empty string", async () => {
    const { sendVendorSuspensionEmailForVendor } = await import(
      "../lib/transactionalEmail"
    );

    // Empty string is falsy — the template should omit the paragraph
    await sendVendorSuspensionEmailForVendor({ ...BASE_OPTS, reason: "" });

    expect(resendSendMock).toHaveBeenCalledOnce();
    const { html } = resendSendMock.mock.calls[0][0];
    expect(html).not.toContain("Reason:");
  });

  it("HTML mentions the vendor name and the suspension subject", async () => {
    const { sendVendorSuspensionEmailForVendor } = await import(
      "../lib/transactionalEmail"
    );

    await sendVendorSuspensionEmailForVendor({ ...BASE_OPTS, reason: "Test reason" });

    const { html, subject } = resendSendMock.mock.calls[0][0];
    expect(subject).toContain("suspended");
    expect(html).toContain(BASE_OPTS.vendorName);
  });
});

describe("sendVendorRejectionEmailForVendor — HTML content", () => {
  beforeEach(() => {
    sentEmails.length = 0;
    resendSendMock.mockClear();
    process.env.RESEND_API_KEY = "re_test_key";
  });

  it("includes the reason text in the HTML when reason is provided", async () => {
    const { sendVendorRejectionEmailForVendor } = await import(
      "../lib/transactionalEmail"
    );

    const reason = "Incomplete KYC documentation — GST certificate missing";

    await sendVendorRejectionEmailForVendor({ ...BASE_OPTS, reason });

    expect(resendSendMock).toHaveBeenCalledOnce();
    const { html } = resendSendMock.mock.calls[0][0];
    expect(html).toContain(reason);
  });

  it("does NOT include a reason paragraph when reason is omitted", async () => {
    const { sendVendorRejectionEmailForVendor } = await import(
      "../lib/transactionalEmail"
    );

    await sendVendorRejectionEmailForVendor({ ...BASE_OPTS });

    expect(resendSendMock).toHaveBeenCalledOnce();
    const { html } = resendSendMock.mock.calls[0][0];
    expect(html).not.toContain("Reason:");
  });

  it("does NOT include a reason paragraph when reason is an empty string", async () => {
    const { sendVendorRejectionEmailForVendor } = await import(
      "../lib/transactionalEmail"
    );

    await sendVendorRejectionEmailForVendor({ ...BASE_OPTS, reason: "" });

    expect(resendSendMock).toHaveBeenCalledOnce();
    const { html } = resendSendMock.mock.calls[0][0];
    expect(html).not.toContain("Reason:");
  });

  it("HTML mentions the vendor name and the rejection subject", async () => {
    const { sendVendorRejectionEmailForVendor } = await import(
      "../lib/transactionalEmail"
    );

    await sendVendorRejectionEmailForVendor({ ...BASE_OPTS, reason: "Test reason" });

    const { html, subject } = resendSendMock.mock.calls[0][0];
    expect(subject).toContain("seller application");
    expect(html).toContain(BASE_OPTS.vendorName);
  });
});
