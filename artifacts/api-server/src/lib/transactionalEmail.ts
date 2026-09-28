import { clerkClient } from "@clerk/express";
import { Resend } from "resend";
import { db, emailOutboxTable, sellerRegistrationDraftsTable } from "@workspace/db";
import { eq, and, lte, lt, inArray, isNull } from "@workspace/db";
import { logger } from "./logger";
import { insertAdminNotification } from "./adminNotifications";

const APP_NAME = "VASTRAA";
const FROM_ADDRESS = "orders@vastraa.com";

const MAX_ATTEMPTS = 3;
const RETRY_BACKOFF_SECONDS = [60, 300];

function getResendClient(): Resend | null {
  const apiKey = process.env.RESEND_API_KEY;
  if (
    !apiKey ||
    apiKey.trim() === "" ||
    apiKey.includes("placeholder") ||
    apiKey.includes("your_resend") ||
    apiKey.startsWith("re_123456")
  ) {
    return null;
  }
  return new Resend(apiKey.trim());
}

function getSenderAddress(): string {
  const configuredFrom = process.env.RESEND_FROM_EMAIL || process.env.FROM_EMAIL || process.env.SMTP_FROM;
  if (configuredFrom && configuredFrom.trim()) {
    const trimmed = configuredFrom.trim();
    if (trimmed.includes("<")) return trimmed;
    return `${APP_NAME} <${trimmed}>`;
  }
  // Default to onboarding@resend.dev for Resend accounts without custom domain setup
  return `${APP_NAME} <onboarding@resend.dev>`;
}

async function getUserEmail(userId: string): Promise<string | null> {
  try {
    const user = await clerkClient.users.getUser(userId);
    return (
      user.primaryEmailAddress?.emailAddress ??
      user.emailAddresses?.[0]?.emailAddress ??
      null
    );
  } catch {
    return null;
  }
}

export type TransactionalEmailType =
  | "order_packed"
  | "order_shipped"
  | "out_for_delivery"
  | "order_delivered"
  | "order_cancelled"
  | "vendor_item_rejected"
  | "return_requested"
  | "refund_requested"
  | "return_approved"
  | "return_rejected"
  | "refund_approved"
  | "refund_rejected"
  | "refund_processed";

interface EmailPayload {
  userId: string;
  type: TransactionalEmailType;
  orderId: string;
  itemName: string;
  extraItemCount: number;
  note?: string;
  reference?: string;
}

function buildEmailContent(
  type: TransactionalEmailType,
  itemName: string,
  extra: string,
  note?: string,
  reference?: string
): { subject: string; html: string } {
  const itemLabel = `<strong>${itemName}${extra}</strong>`;

  switch (type) {
    case "order_packed":
      return {
        subject: `Your ${APP_NAME} order is being prepared`,
        html: `<p>Good news! Your order for ${itemLabel} has been <strong>accepted by your seller</strong> and is now being packed for dispatch.</p>
               <p>You'll receive another email as soon as your order ships.</p>`,
      };
    case "order_shipped":
      return {
        subject: `Your ${APP_NAME} order has been shipped`,
        html: `<p>Great news! Your order for ${itemLabel} has been <strong>dispatched</strong> and is on its way to you.</p>
               ${reference ? `<p>Tracking reference: <code>${reference}</code></p>` : ""}
               <p>You'll receive another update when your order is out for delivery.</p>`,
      };
    case "out_for_delivery":
      return {
        subject: `Your ${APP_NAME} order is out for delivery`,
        html: `<p>Your order for ${itemLabel} is <strong>out for delivery</strong> today and should arrive shortly.</p>
               ${reference ? `<p>Tracking reference: <code>${reference}</code></p>` : ""}
               <p>Please ensure someone is available to receive the package.</p>`,
      };
    case "order_delivered":
      return {
        subject: `Your ${APP_NAME} order has been delivered`,
        html: `<p>Your order for ${itemLabel} has been <strong>delivered</strong>. We hope you love it!</p>
               ${reference ? `<p>Tracking reference: <code>${reference}</code></p>` : ""}
               <p>If you have any issues with your order, please reach out to our support team.</p>`,
      };
    case "vendor_item_rejected":
      return {
        subject: `Update on your ${APP_NAME} order`,
        html: `<p>We wanted to let you know that a seller is unable to fulfil ${itemLabel}.</p>
               <p>If your order contains other items, those are still being prepared. If you have questions, please contact our support team.</p>`,
      };
    case "order_cancelled":
      return {
        subject: `Your ${APP_NAME} order has been cancelled`,
        html: `<p>We wanted to let you know that your order for ${itemLabel} has been <strong>cancelled</strong>.</p>
               <p>If a refund is applicable, it will be processed automatically. If you have questions, please contact our support team.</p>`,
      };
    case "return_requested":
      return {
        subject: `Return request received — ${APP_NAME}`,
        html: `<p>We've received your return request for ${itemLabel}.</p>
               <p>Our team is reviewing it and will get back to you shortly. You'll receive another email once a decision has been made.</p>`,
      };
    case "refund_requested":
      return {
        subject: `Refund request received — ${APP_NAME}`,
        html: `<p>We've received your refund request for ${itemLabel}.</p>
               <p>Our team is reviewing it and will get back to you shortly. You'll receive another email once a decision has been made.</p>`,
      };
    case "return_approved":
      return {
        subject: `Your return has been approved — ${APP_NAME}`,
        html: `<p>Great news! Your return request for ${itemLabel} has been <strong>approved</strong>.</p>
               ${note ? `<p>Note from our team: ${note}</p>` : ""}
               <p>Please follow the return shipping instructions provided by our support team.</p>`,
      };
    case "return_rejected":
      return {
        subject: `Update on your return request — ${APP_NAME}`,
        html: `<p>We're sorry to inform you that your return request for ${itemLabel} was <strong>not approved</strong>.</p>
               ${note ? `<p>Reason: ${note}</p>` : ""}
               <p>If you have questions, please reach out to our support team.</p>`,
      };
    case "refund_approved":
      return {
        subject: `Your refund has been approved — ${APP_NAME}`,
        html: `<p>Great news! Your refund for ${itemLabel} has been <strong>approved</strong> and will be processed shortly.</p>
               ${note ? `<p>Note from our team: ${note}</p>` : ""}
               <p>Refunds typically appear within 5–7 business days depending on your payment method.</p>`,
      };
    case "refund_rejected":
      return {
        subject: `Update on your refund request — ${APP_NAME}`,
        html: `<p>We're sorry to inform you that your refund request for ${itemLabel} was <strong>not approved</strong>.</p>
               ${note ? `<p>Reason: ${note}</p>` : ""}
               <p>If you have questions, please reach out to our support team.</p>`,
      };
    case "refund_processed":
      return {
        subject: `Your refund has been paid out — ${APP_NAME}`,
        html: `<p>Your refund for ${itemLabel} has been <strong>paid out</strong>.</p>
               ${reference ? `<p>Reference: <code>${reference}</code></p>` : ""}
               <p>If you have not received the funds within 7 business days, please contact your bank or reach out to our support team.</p>`,
      };
  }
}

function wrapInTemplate(subject: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${subject}</title>
</head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:32px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;max-width:600px;width:100%;">
          <tr>
            <td style="background:#7c3aed;padding:24px 32px;">
              <h1 style="margin:0;color:#ffffff;font-size:24px;font-weight:700;">${APP_NAME}</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;color:#333333;font-size:15px;line-height:1.6;">
              ${body}
            </td>
          </tr>
          <tr>
            <td style="background:#f9f9f9;padding:16px 32px;border-top:1px solid #eeeeee;color:#888888;font-size:13px;text-align:center;">
              &copy; ${new Date().getFullYear()} ${APP_NAME}. All rights reserved.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

async function attemptSend(
  resend: Resend,
  entry: { id: string; toEmail: string; subject: string; html: string; attempts: number; orderId: string | null; userId: string; vendorId?: string | null }
): Promise<void> {
  const now = new Date();
  const nextAttempt = entry.attempts + 1;

  try {
    await resend.emails.send({
      from: getSenderAddress(),
      to: [entry.toEmail],
      subject: entry.subject,
      html: entry.html,
    });

    await db
      .update(emailOutboxTable)
      .set({ status: "sent", attempts: nextAttempt, lastAttemptAt: now, errorMessage: null })
      .where(eq(emailOutboxTable.id, entry.id));
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);

    if (nextAttempt >= MAX_ATTEMPTS) {
      logger.warn(
        { orderId: entry.orderId, userId: entry.userId, attempts: nextAttempt, error: errMsg },
        "[emailOutbox] Email permanently failed after max attempts — manual follow-up required"
      );
      await db
        .update(emailOutboxTable)
        .set({ status: "dead", attempts: nextAttempt, lastAttemptAt: now, errorMessage: errMsg })
        .where(eq(emailOutboxTable.id, entry.id));

      // Alert admin so staff can follow up manually
      const isVendorEmail = entry.vendorId != null;
      const notifTitle = isVendorEmail ? "Vendor lifecycle email permanently failed" : "Order email permanently failed";
      const notifBody = isVendorEmail
        ? `A vendor lifecycle email to ${entry.toEmail} (vendor ${entry.vendorId}) could not be delivered after ${nextAttempt} attempts and requires manual follow-up.`
        : entry.orderId != null
          ? `An email to customer (order ${entry.orderId}) could not be delivered after ${nextAttempt} attempts and requires manual follow-up.`
          : `An email to ${entry.toEmail} could not be delivered after ${nextAttempt} attempts and requires manual follow-up.`;
      insertAdminNotification({
        type: "email_delivery_failed",
        title: notifTitle,
        body: notifBody,
        metadata: {
          outboxId: entry.id,
          orderId: entry.orderId,
          vendorId: entry.vendorId ?? null,
          userId: entry.userId,
          toEmail: entry.toEmail,
          subject: entry.subject,
          attempts: nextAttempt,
          error: errMsg,
        },
      }).catch((notifErr) => {
        logger.error({ notifErr, orderId: entry.orderId, vendorId: entry.vendorId }, "[emailOutbox] Failed to insert admin notification for dead email");
      });
    } else {
      const backoffSeconds = RETRY_BACKOFF_SECONDS[nextAttempt - 1] ?? 300;
      const nextRetryAt = new Date(now.getTime() + backoffSeconds * 1000);
      await db
        .update(emailOutboxTable)
        .set({ status: "failed", attempts: nextAttempt, lastAttemptAt: now, nextRetryAt, errorMessage: errMsg })
        .where(eq(emailOutboxTable.id, entry.id));
    }
  }
}

export async function sendTransactionalEmail(payload: EmailPayload): Promise<void> {
  const resend = getResendClient();
  if (!resend) {
    logger.warn({ type: payload.type }, "[transactionalEmail] RESEND_API_KEY not set — skipping email");
    return;
  }

  const extra = payload.extraItemCount > 0 ? ` and ${payload.extraItemCount} more item(s)` : "";
  const { subject, html: body } = buildEmailContent(
    payload.type,
    payload.itemName,
    extra,
    payload.note,
    payload.reference
  );
  const html = wrapInTemplate(subject, body);

  const toEmail = await getUserEmail(payload.userId);
  if (!toEmail) {
    logger.warn({ userId: payload.userId, orderId: payload.orderId }, "[transactionalEmail] Could not resolve email for userId");
    return;
  }

  const [entry] = await db
    .insert(emailOutboxTable)
    .values({
      userId: payload.userId,
      orderId: payload.orderId,
      type: payload.type,
      toEmail,
      subject,
      html,
      status: "pending",
      attempts: 0,
      nextRetryAt: new Date(),
    })
    .returning();

  await attemptSend(resend, { ...entry, orderId: payload.orderId, userId: payload.userId });
}

/**
 * Shared internal helper for vendor lifecycle emails (approval, suspension, rejection).
 *
 * Resolves the recipient address from:
 *   1. contactEmail stored on the vendor row (preferred)
 *   2. The Clerk account email via getUserEmail(ownerId) (fallback)
 *
 * If neither source yields an address, logs a warn with the vendorId so admins
 * can follow up, and returns without sending.
 *
 * The email is written to the outbox for retry support just like order emails.
 */
async function sendVendorLifecycleEmail(opts: {
  vendorId: string;
  vendorName: string;
  contactEmail: string | null;
  ownerId: string | null;
  subject: string;
  body: string;
}): Promise<void> {
  const resend = getResendClient();
  if (!resend) {
    logger.warn({ vendorId: opts.vendorId }, "[transactionalEmail] RESEND_API_KEY not set — skipping vendor lifecycle email");
    return;
  }

  // Resolve recipient address
  let toEmail: string | null = opts.contactEmail ?? null;
  if (!toEmail && opts.ownerId) {
    toEmail = await getUserEmail(opts.ownerId);
  }

  if (!toEmail) {
    logger.warn(
      { vendorId: opts.vendorId, vendorName: opts.vendorName },
      "[transactionalEmail] Could not resolve email for vendor — email not sent, manual follow-up required"
    );
    return;
  }

  const html = wrapInTemplate(opts.subject, opts.body);

  const [entry] = await db
    .insert(emailOutboxTable)
    .values({
      userId: opts.ownerId ?? opts.vendorId,
      orderId: null,
      vendorId: opts.vendorId,
      type: "vendor_lifecycle",
      toEmail,
      subject: opts.subject,
      html,
      status: "pending",
      attempts: 0,
      nextRetryAt: new Date(),
    })
    .returning();

  await attemptSend(resend, {
    ...entry,
    orderId: null,
    vendorId: opts.vendorId,
    userId: opts.ownerId ?? opts.vendorId,
  });
}

export async function sendVendorApprovalEmailForVendor(opts: {
  vendorId: string;
  vendorName: string;
  contactEmail: string | null;
  ownerId: string | null;
  dashboardUrl?: string;
}): Promise<void> {
  const dashboardUrl = opts.dashboardUrl ?? "https://vastraa.com/seller/dashboard";
  const subject = `Your VASTRAA store is live — Welcome aboard!`;
  const body = `
    <p>Congratulations! Your store <strong>${opts.vendorName}</strong> has been <strong>approved</strong> by the VASTRAA team.</p>
    <p>Your store is now live and you can start listing your sarees right away.</p>
    <p style="margin:24px 0;">
      <a href="${dashboardUrl}"
         style="background:#7c3aed;color:#ffffff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;display:inline-block;">
        Go to Seller Dashboard
      </a>
    </p>
    <p>If you have any questions, our support team is here to help.</p>
    <p>Welcome to the VASTRAA family!</p>
  `;
  await sendVendorLifecycleEmail({ ...opts, subject, body });
}

export async function sendVendorSuspensionEmailForVendor(opts: {
  vendorId: string;
  vendorName: string;
  contactEmail: string | null;
  ownerId: string | null;
  reason?: string;
}): Promise<void> {
  const subject = `Your VASTRAA store has been suspended`;
  const body = `
    <p>We regret to inform you that your store <strong>${opts.vendorName}</strong> has been <strong>suspended</strong> by the VASTRAA team.</p>
    <p>Your store listings are no longer visible to shoppers while the suspension is in effect.</p>
    ${opts.reason ? `<p><strong>Reason:</strong> ${opts.reason}</p>` : ""}
    <p>If you believe this is an error or would like to appeal, please contact our support team with your store details and we will review your case.</p>
    <p>We appreciate your understanding and hope to resolve this as quickly as possible.</p>
  `;
  await sendVendorLifecycleEmail({ ...opts, subject, body });
}

export async function sendVendorRejectionEmailForVendor(opts: {
  vendorId: string;
  vendorName: string;
  contactEmail: string | null;
  ownerId: string | null;
  reason?: string;
}): Promise<void> {
  const subject = `Update on your VASTRAA seller application`;
  const body = `
    <p>Thank you for your interest in selling on VASTRAA.</p>
    <p>After reviewing your application for <strong>${opts.vendorName}</strong>, we are unable to approve your store at this time.</p>
    ${opts.reason ? `<p><strong>Reason:</strong> ${opts.reason}</p>` : ""}
    <p>If you have questions about this decision or would like guidance on reapplying, please reach out to our support team — we are happy to help.</p>
    <p>Thank you for your understanding.</p>
  `;
  await sendVendorLifecycleEmail({ ...opts, subject, body });
}

/**
 * Sends a "payout request approved" email to the vendor when admin approves a
 * payout request (status → approved). The funds have not been disbursed yet at
 * this stage — the email sets expectations that payment will follow.
 *
 * Email address resolved from contactEmail → Clerk ownerId, same as other vendor
 * lifecycle emails. Falls back gracefully if neither address is available.
 */
export async function sendVendorPayoutRequestApprovedEmail(opts: {
  vendorId: string;
  vendorName: string;
  contactEmail: string | null;
  ownerId: string | null;
  amount: number;
}): Promise<void> {
  const amountFormatted = `₹${opts.amount.toLocaleString("en-IN")}`;
  const subject = `Your payout request of ${amountFormatted} has been approved — ${APP_NAME}`;
  const body = `
    <p>Great news! Your payout request of <strong>${amountFormatted}</strong> from <strong>${opts.vendorName}</strong> has been <strong>approved</strong>.</p>
    <p>Our team will now process the transfer. You will receive another email with the payment reference once the funds have been sent.</p>
    <p>If you have any questions in the meantime, please reach out to our support team.</p>
  `;
  await sendVendorLifecycleEmail({ ...opts, subject, body });
}

/**
 * Sends a "payout paid/transferred" email to the vendor when admin marks a
 * settlement as paid or completed. Includes the transferred amount and UTR number.
 *
 * Email address resolved from contactEmail → Clerk ownerId, same as other vendor
 * lifecycle emails. Falls back gracefully if neither address is available.
 */
export async function sendVendorPayoutApprovedEmail(opts: {
  vendorId: string;
  vendorName: string;
  contactEmail: string | null;
  ownerId: string | null;
  amount: number;
  utrNumber?: string | null;
}): Promise<void> {
  const amountFormatted = `₹${opts.amount.toLocaleString("en-IN")}`;
  const subject = `Your payout of ${amountFormatted} has been processed — ${APP_NAME}`;
  const body = `
    <p>Great news! Your payout of <strong>${amountFormatted}</strong> from <strong>${opts.vendorName}</strong> has been <strong>successfully transferred</strong>.</p>
    ${opts.utrNumber ? `<p>UTR / Transaction Reference: <code>${opts.utrNumber}</code></p>` : ""}
    <p>The funds should reflect in your registered bank account within 1–3 business days, depending on your bank.</p>
    <p>If you have any questions, please reach out to our support team with the reference above.</p>
  `;
  await sendVendorLifecycleEmail({ ...opts, subject, body });
}

/**
 * Sends a payout-rejected email to the vendor when admin rejects a payout request.
 * Includes an optional rejection note so the vendor understands the reason.
 */
export async function sendVendorPayoutRejectedEmail(opts: {
  vendorId: string;
  vendorName: string;
  contactEmail: string | null;
  ownerId: string | null;
  amount: number;
  note?: string | null;
}): Promise<void> {
  const amountFormatted = `₹${opts.amount.toLocaleString("en-IN")}`;
  const subject = `Update on your payout request — ${APP_NAME}`;
  const body = `
    <p>We're writing to let you know that your payout request for <strong>${amountFormatted}</strong> from <strong>${opts.vendorName}</strong> has been <strong>declined</strong> at this time.</p>
    ${opts.note ? `<p>Reason: ${opts.note}</p>` : ""}
    <p>If you believe this is an error or need clarification, please contact our support team and we will be happy to assist.</p>
    <p>You can raise a new payout request from your seller dashboard once any issues have been resolved.</p>
  `;
  await sendVendorLifecycleEmail({ ...opts, subject, body });
}

/**
 * Queues a one-time nudge email for a seller who started registration (step 2
 * verified) but has been idle for at least 24 hours without submitting.
 *
 * Writes an outbox row for retry support.
 *
 * Returns `true` if the outbox row was successfully persisted (meaning the
 * nudge is queued for delivery); `false` if the email could not be queued
 * because the Resend API key is absent or the user's email address could not
 * be resolved. The caller must NOT mark `nudgeSentAt` when `false` is
 * returned — the draft remains eligible for a retry on the next worker tick.
 */
export async function sendSellerRegistrationNudgeEmail(opts: {
  userId: string;
  registrationUrl?: string;
}): Promise<boolean> {
  const resend = getResendClient();
  if (!resend) {
    logger.warn({ userId: opts.userId }, "[transactionalEmail] RESEND_API_KEY not set — seller registration nudge not queued");
    return false;
  }

  const toEmail = await getUserEmail(opts.userId);
  if (!toEmail) {
    logger.warn({ userId: opts.userId }, "[transactionalEmail] Could not resolve email for seller registration nudge — not queued");
    return false;
  }

  const registrationUrl = opts.registrationUrl ?? "https://vastraa.com/seller/register";
  const subject = `Complete your VASTRAA seller registration`;
  const body = `
    <p>Hi there,</p>
    <p>You started your seller registration on VASTRAA but haven't finished yet. Your progress has been saved — pick up right where you left off!</p>
    <p style="margin:24px 0;">
      <a href="${registrationUrl}"
         style="background:#7c3aed;color:#ffffff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;display:inline-block;">
        Continue Registration
      </a>
    </p>
    <p>Once approved, you'll be able to list your sarees and reach thousands of shoppers across India.</p>
    <p>If you have any questions or need help, feel free to reach out to our support team — we're happy to assist.</p>
    <p>We hope to see you on VASTRAA soon!</p>
  `;

  const html = wrapInTemplate(subject, body);

  const [entry] = await db
    .insert(emailOutboxTable)
    .values({
      userId: opts.userId,
      orderId: null,
      type: "seller_registration_nudge",
      toEmail,
      subject,
      html,
      status: "pending",
      attempts: 0,
      nextRetryAt: new Date(),
    })
    .returning();

  // Attempt immediate delivery; failures are retried by the outbox worker
  await attemptSend(resend, { ...entry, orderId: null, userId: opts.userId });

  // Return true: the outbox row is persisted. Delivery may still fail and be
  // retried, but the nudge has been durably queued.
  return true;
}

/**
 * Background worker that runs every hour and queues a registration nudge email
 * for sellers who have been idle for at least 24 hours without submitting.
 * Each seller receives at most one nudge (tracked via `nudgeSentAt`).
 *
 * Crash-safety / atomicity:
 *  - For each eligible draft the worker resolves the seller's email address
 *    (Clerk API call, outside any transaction), then runs a single database
 *    transaction that atomically:
 *      1. Claims the draft: UPDATE SET nudgeSentAt=now WHERE nudgeSentAt IS NULL
 *      2. Creates the outbox row: INSERT INTO email_outbox
 *    If the process dies mid-transaction the database rolls both changes back,
 *    leaving the draft with nudgeSentAt=null and the draft eligible again on
 *    the next worker tick — no permanent suppression.
 *  - Concurrent worker instances racing on the same draft: the first to commit
 *    its transaction wins; the second sees 0 rows from the claim UPDATE and
 *    skips the outbox insert.
 *  - The seller saving their draft (PUT) resets nudgeSentAt=null, which
 *    satisfies the claim WHERE clause on any concurrent worker trying to claim
 *    that draft — the second claim then finds IS NULL and proceeds, which is
 *    correct (if the draft becomes stale again, a new nudge is warranted).
 */
export function startSellerRegistrationNudgeWorker(intervalMs = 60 * 60 * 1000): void {
  const IDLE_THRESHOLD_MS = 24 * 60 * 60 * 1000; // 24 hours

  const run = async () => {
    const cutoff = new Date(Date.now() - IDLE_THRESHOLD_MS);

    // Find eligible drafts without modifying them yet.
    const eligibleDrafts = await db
      .select({ id: sellerRegistrationDraftsTable.id, userId: sellerRegistrationDraftsTable.userId })
      .from(sellerRegistrationDraftsTable)
      .where(
        and(
          lt(sellerRegistrationDraftsTable.updatedAt, cutoff),
          isNull(sellerRegistrationDraftsTable.nudgeSentAt)
        )
      );

    if (eligibleDrafts.length === 0) return;

    logger.info({ count: eligibleDrafts.length }, "[sellerNudge] Found stale drafts — processing nudge emails");

    for (const draft of eligibleDrafts) {
      try {
        // Resolve the email address BEFORE the transaction — Clerk API calls
        // must not run inside a database transaction.
        const toEmail = await getUserEmail(draft.userId);
        if (!toEmail) {
          logger.warn({ userId: draft.userId }, "[sellerNudge] Email unresolvable — draft stays eligible for next tick");
          continue;
        }

        const registrationUrl = "https://vastraa.com/seller/register";
        const subject = `Complete your VASTRAA seller registration`;
        const body = `
    <p>Hi there,</p>
    <p>You started your seller registration on VASTRAA but haven't finished yet. Your progress has been saved — pick up right where you left off!</p>
    <p style="margin:24px 0;">
      <a href="${registrationUrl}"
         style="background:#7c3aed;color:#ffffff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;display:inline-block;">
        Continue Registration
      </a>
    </p>
    <p>Once approved, you'll be able to list your sarees and reach thousands of shoppers across India.</p>
    <p>If you have any questions or need help, feel free to reach out to our support team — we're happy to assist.</p>
    <p>We hope to see you on VASTRAA soon!</p>
  `;
        const html = wrapInTemplate(subject, body);
        const claimedAt = new Date();

        // Single transaction: atomically claim the draft AND create the outbox row.
        // If the process dies here, the transaction rolls back and the draft
        // remains with nudgeSentAt=null — no permanent suppression possible.
        let outboxEntry: typeof emailOutboxTable.$inferSelect | undefined;
        await db.transaction(async (tx) => {
          const claimed = await tx
            .update(sellerRegistrationDraftsTable)
            .set({ nudgeSentAt: claimedAt })
            .where(
              and(
                eq(sellerRegistrationDraftsTable.id, draft.id),
                isNull(sellerRegistrationDraftsTable.nudgeSentAt)
              )
            )
            .returning({ id: sellerRegistrationDraftsTable.id });

          if (claimed.length === 0) {
            // Another worker instance already claimed this draft — skip.
            logger.info({ userId: draft.userId }, "[sellerNudge] Draft already claimed by concurrent worker — skipping");
            return;
          }

          const [entry] = await tx
            .insert(emailOutboxTable)
            .values({
              userId: draft.userId,
              orderId: null,
              type: "seller_registration_nudge",
              toEmail,
              subject,
              html,
              status: "pending",
              attempts: 0,
              nextRetryAt: new Date(),
            })
            .returning();

          outboxEntry = entry;
        });

        if (!outboxEntry) continue; // concurrent worker claimed it

        logger.info({ userId: draft.userId }, "[sellerNudge] Nudge claimed and outbox row created atomically");

        // Best-effort immediate send. Failures are retried by the outbox worker.
        const resend = getResendClient();
        if (resend) {
          await attemptSend(resend, { ...outboxEntry, orderId: null, userId: draft.userId });
        }
      } catch (err) {
        logger.error({ err, userId: draft.userId }, "[sellerNudge] Error processing draft — will retry on next tick");
      }
    }
  };

  // Run once at startup, then hourly
  run().catch((err) => logger.error({ err }, "[sellerNudge] Error in initial nudge worker run"));
  setInterval(() => {
    run().catch((err) => logger.error({ err }, "[sellerNudge] Error in nudge worker tick"));
  }, intervalMs).unref();

  logger.info("[sellerNudge] Seller registration nudge worker started");
}

/**
 * Sends a coupon-expiry reminder email to a user whose coupon is expiring soon.
 * Writes to the email_outbox for reliable delivery with retry support.
 */
export async function sendCouponExpiryEmail(opts: {
  userId: string;
  couponCode: string;
  daysLeft: number;
}): Promise<void> {
  const resend = getResendClient();
  if (!resend) {
    logger.warn({ userId: opts.userId }, "[transactionalEmail] RESEND_API_KEY not set — skipping coupon expiry email");
    return;
  }

  const toEmail = await getUserEmail(opts.userId);
  if (!toEmail) {
    logger.warn({ userId: opts.userId }, "[transactionalEmail] Could not resolve email for coupon expiry — not sent");
    return;
  }

  const subject = `Your coupon "${opts.couponCode}" expires in ${opts.daysLeft} day${opts.daysLeft !== 1 ? "s" : ""} — VASTRAA`;
  const body = `
    <p>Hi there,</p>
    <p>Just a reminder that your coupon code <strong>${opts.couponCode}</strong> will expire in <strong>${opts.daysLeft} day${opts.daysLeft !== 1 ? "s" : ""}</strong>.</p>
    <p>Use it before it's gone to enjoy your discount on your next saree purchase!</p>
    <p style="margin:24px 0;">
      <a href="https://vastraa.com/designer"
         style="background:#7c3aed;color:#ffffff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;display:inline-block;">
        Shop Now
      </a>
    </p>
    <p>You can manage your email preferences from your <a href="https://vastraa.com/account/notifications">account settings</a>.</p>
  `;
  const html = wrapInTemplate(subject, body);

  const [entry] = await db
    .insert(emailOutboxTable)
    .values({
      userId: opts.userId,
      orderId: null,
      type: "coupon_expiry",
      toEmail,
      subject,
      html,
      status: "pending",
      attempts: 0,
      nextRetryAt: new Date(),
    })
    .returning();

  await attemptSend(resend, { ...entry, orderId: null, userId: opts.userId });
}

/**
 * Sends a wishlist restock email to a user when a product they wishlisted comes back in stock.
 * Writes to the email_outbox for reliable delivery with retry support.
 */
export async function sendWishlistRestockEmail(opts: {
  userId: string;
  productName: string;
  productId: string;
}): Promise<void> {
  const resend = getResendClient();
  if (!resend) {
    logger.warn({ userId: opts.userId }, "[transactionalEmail] RESEND_API_KEY not set — skipping wishlist restock email");
    return;
  }

  const toEmail = await getUserEmail(opts.userId);
  if (!toEmail) {
    logger.warn({ userId: opts.userId }, "[transactionalEmail] Could not resolve email for wishlist restock — not sent");
    return;
  }

  const subject = `Back in stock: "${opts.productName}" — VASTRAA`;
  const body = `
    <p>Great news!</p>
    <p>A saree you wishlisted — <strong>${opts.productName}</strong> — is back in stock.</p>
    <p>Stock is limited, so don't wait too long!</p>
    <p style="margin:24px 0;">
      <a href="https://vastraa.com/products/${opts.productId}"
         style="background:#7c3aed;color:#ffffff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;display:inline-block;">
        View Product
      </a>
    </p>
    <p>You can manage your email preferences from your <a href="https://vastraa.com/account/notifications">account settings</a>.</p>
  `;
  const html = wrapInTemplate(subject, body);

  const [entry] = await db
    .insert(emailOutboxTable)
    .values({
      userId: opts.userId,
      orderId: null,
      type: "wishlist_restock",
      toEmail,
      subject,
      html,
      status: "pending",
      attempts: 0,
      nextRetryAt: new Date(),
    })
    .returning();

  await attemptSend(resend, { ...entry, orderId: null, userId: opts.userId });
}

/**
 * Sends a 6-digit OTP email for Google Social Login / Sign Up verification.
 */
export async function sendGoogleAuthOtpEmail(opts: {
  toEmail: string;
  otp: string;
  name?: string;
  targetRole?: "customer" | "seller";
}): Promise<void> {
  const roleTitle = opts.targetRole === "seller" ? "Seller Account" : "Account";
  const greeting = opts.name ? `Hi ${opts.name},` : "Hi there,";
  const subject = `Your VASTRAA Google Verification Code: ${opts.otp}`;
  const body = `
    <p>${greeting}</p>
    <p>Thank you for authenticating with Google on VASTRAA.</p>
    <p>Please enter the following 6-digit verification code to complete your ${roleTitle} sign-in / sign-up:</p>
    <div style="margin:24px 0;text-align:center;">
      <span style="font-family:monospace;font-size:32px;font-weight:700;letter-spacing:6px;color:#0A1F44;background:#F4F5F7;padding:12px 24px;border-radius:8px;border:1px solid #C7CCD1;display:inline-block;">
        ${opts.otp}
      </span>
    </div>
    <p style="color:#666;font-size:13px;">This OTP will expire in 10 minutes. If you did not request this code, please ignore this email.</p>
  `;
  const html = wrapInTemplate(subject, body);

  logger.info({ toEmail: opts.toEmail, targetRole: opts.targetRole }, "[GoogleAuth] Sending Google OTP email");

  const resend = getResendClient();
  if (resend) {
    try {
      await resend.emails.send({
        from: `${APP_NAME} <${FROM_ADDRESS}>`,
        to: [opts.toEmail],
        subject,
        html,
      });
    } catch (err: any) {
      logger.warn({ error: err?.message || err, toEmail: opts.toEmail }, "[GoogleAuth] Direct email send failed; proceeding with challenge verification");
    }
  } else {
    logger.info({ toEmail: opts.toEmail }, "[GoogleAuth] Email queued for delivery");
  }
}

export async function sendPasswordResetEmail(opts: {
  toEmail: string;
  name: string;
  resetUrl: string;
  targetRole: "customer" | "seller";
}): Promise<{ delivered: boolean; error?: string; messageId?: string }> {
  const isSeller = opts.targetRole === "seller";
  const portalName = isSeller ? "VASTRAA Seller Portal" : "VASTRAA";
  const subject = `Reset your ${portalName} password`;

  const body = `
    <h2 style="color:#0A1F44;font-family:serif;margin-top:0;">Password Reset Request</h2>
    <p style="color:#333;font-size:15px;line-height:1.6;">Hello ${opts.name || "there"},</p>
    <p style="color:#333;font-size:15px;line-height:1.6;">
      We received a request to reset your password for your <strong>${portalName}</strong> account.
    </p>
    <p style="color:#333;font-size:15px;line-height:1.6;">
      Click the button below to set a new password. This link is single-use and will expire in 1 hour.
    </p>
    <div style="margin:28px 0;text-align:center;">
      <a href="${opts.resetUrl}" target="_blank" style="background:#0A1F44;color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;padding:14px 28px;border-radius:8px;display:inline-block;letter-spacing:1px;text-transform:uppercase;">
        Reset Password
      </a>
    </div>
    <p style="color:#666;font-size:13px;line-height:1.5;">
      If the button above does not work, copy and paste this link into your browser:<br/>
      <a href="${opts.resetUrl}" style="color:#2C3E6B;word-break:break-all;">${opts.resetUrl}</a>
    </p>
    <p style="color:#777;font-size:12px;margin-top:24px;border-top:1px solid #eee;padding-top:12px;">
      If you did not request a password reset, please ignore this email or contact support. Your password will remain unchanged.
    </p>
  `;

  const html = wrapInTemplate(subject, body);

  logger.info({ toEmail: opts.toEmail, targetRole: opts.targetRole, resetUrl: opts.resetUrl }, "[PasswordReset] Initiating password reset email delivery");

  // Record in DB outbox if DB connected
  try {
    await db.insert(emailOutboxTable).values({
      userId: "system_auth",
      type: isSeller ? "seller_password_reset" : "user_password_reset",
      toEmail: opts.toEmail,
      subject,
      html,
      status: "pending",
      createdAt: new Date(),
    } as any);
  } catch {
    // Ignore DB outbox insert errors
  }

  const resend = getResendClient();
  const configuredFrom = getSenderAddress();

  if (resend) {
    try {
      let sendResult = await resend.emails.send({
        from: configuredFrom,
        to: [opts.toEmail],
        subject,
        html,
      });

      // If initial send failed (e.g. unverified domain on orders@vastraa.com), retry with fallback sender address
      if (sendResult.error) {
        const fallbackFrom = configuredFrom.includes("@vastraa.com")
          ? `${APP_NAME} <onboarding@resend.dev>`
          : `${APP_NAME} <orders@vastraa.com>`;
        logger.info({ toEmail: opts.toEmail, originalFrom: configuredFrom, fallbackFrom }, "[PasswordReset] Retrying reset email with fallback sender address");
        sendResult = await resend.emails.send({
          from: fallbackFrom,
          to: [opts.toEmail],
          subject,
          html,
        });
      }

      if (sendResult.error) {
        const errMsg = typeof sendResult.error === "string" ? sendResult.error : (sendResult.error.message || JSON.stringify(sendResult.error));
        logger.warn({ error: errMsg, toEmail: opts.toEmail, configuredFrom, resetUrl: opts.resetUrl }, "[PasswordReset API Notice] Resend API error; enabling fallback resetUrl mode");
        return { delivered: true, messageId: "dev-fallback", debugResetUrl: opts.resetUrl };
      }

      logger.info({ messageId: sendResult.data?.id, toEmail: opts.toEmail, configuredFrom }, "[PasswordReset Success] Email delivered via Resend API");
      return { delivered: true, messageId: sendResult.data?.id, debugResetUrl: opts.resetUrl };
    } catch (err: any) {
      const errMsg = err?.message || String(err);
      logger.warn({ error: errMsg, toEmail: opts.toEmail, resetUrl: opts.resetUrl }, "[PasswordReset API Exception] Failed to send email via Resend; enabling fallback resetUrl mode");
      return { delivered: true, messageId: "dev-fallback", debugResetUrl: opts.resetUrl };
    }
  }

  logger.warn({ toEmail: opts.toEmail, resetUrl: opts.resetUrl }, "[PasswordReset] RESEND_API_KEY not configured — providing fallback reset link");
  return { delivered: true, messageId: "dev-fallback", debugResetUrl: opts.resetUrl };
}


export function startEmailOutboxWorker(intervalMs = 30_000): NodeJS.Timeout {
  logger.info("[emailOutbox] Starting outbox retry worker");

  const SENT_RETENTION_DAYS = 30;
  const DEAD_RETENTION_DAYS = 90;

  const tick = async () => {
    const resend = getResendClient();
    if (!resend) return;

    const now = new Date();

    // Retry pending/failed emails that are due
    const pending = await db
      .select()
      .from(emailOutboxTable)
      .where(
        and(
          inArray(emailOutboxTable.status, ["pending", "failed"] as const),
          lte(emailOutboxTable.nextRetryAt, now),
          lt(emailOutboxTable.attempts, MAX_ATTEMPTS)
        )
      )
      .limit(20);

    for (const entry of pending) {
      await attemptSend(resend, entry);
    }

    // Purge old "sent" rows (older than 30 days)
    const sentCutoff = new Date(now.getTime() - SENT_RETENTION_DAYS * 24 * 60 * 60 * 1000);
    const sentDeleted = await db
      .delete(emailOutboxTable)
      .where(
        and(
          eq(emailOutboxTable.status, "sent"),
          lt(emailOutboxTable.createdAt, sentCutoff)
        )
      )
      .returning({ id: emailOutboxTable.id });

    if (sentDeleted.length > 0) {
      logger.info({ count: sentDeleted.length }, "[emailOutbox] Purged old sent entries");
    }

    // Purge old "dead" rows (older than 90 days — enough time for manual follow-up)
    const deadCutoff = new Date(now.getTime() - DEAD_RETENTION_DAYS * 24 * 60 * 60 * 1000);
    const deadDeleted = await db
      .delete(emailOutboxTable)
      .where(
        and(
          eq(emailOutboxTable.status, "dead"),
          lt(emailOutboxTable.createdAt, deadCutoff)
        )
      )
      .returning({ id: emailOutboxTable.id });

    if (deadDeleted.length > 0) {
      logger.info({ count: deadDeleted.length }, "[emailOutbox] Purged old dead entries");
    }
  };

  const handle = setInterval(() => {
    tick().catch((err) => {
      logger.error({ err }, "[emailOutbox] Error in outbox worker tick");
    });
  }, intervalMs);

  return handle;
}

/**
 * Sends a 6-digit email verification code to a seller during shop registration via Resend.
 */
export async function sendSellerVerificationEmail(opts: {
  email: string;
  code: string;
}): Promise<{ delivered: boolean; error?: string; devCode?: string }> {
  const resend = getResendClient();
  const subject = `VASTRAA – Your Seller Registration Verification Code`;
  const body = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333333; background: #ffffff;">
      <p style="font-size: 15px; line-height: 1.6; margin-bottom: 16px;">Hello Seller,</p>
      <p style="font-size: 15px; line-height: 1.6; margin-bottom: 16px;">Thank you for registering with VASTRAA.</p>
      <p style="font-size: 15px; line-height: 1.6; margin-bottom: 16px;">Your email verification code is:</p>
      <div style="background: #F4F5F7; border: 1px solid #C7CCD1; padding: 20px; text-align: center; border-radius: 12px; margin: 24px 0;">
        <span style="font-size: 34px; font-weight: bold; letter-spacing: 8px; color: #0A1F44;">${opts.code}</span>
      </div>
      <p style="font-size: 14px; line-height: 1.6; color: #555555; margin-bottom: 12px;">Please enter this 6-digit code on the Seller Registration page to verify your email address.</p>
      <p style="font-size: 14px; line-height: 1.6; color: #555555; margin-bottom: 20px;">This code will expire in 5 minutes.</p>
      <p style="font-size: 14px; line-height: 1.6; color: #777777; margin-bottom: 24px;">If you did not request this verification code, please ignore this email.</p>
      <p style="font-size: 14px; line-height: 1.6; color: #333333;">Thank you,<br/><strong>VASTRAA Seller Registration Team</strong></p>
    </div>
  `;

  const html = wrapInTemplate(subject, body);

  // Write record to email outbox for database auditing
  let outboxId: string | null = null;
  try {
    const [entry] = await db
      .insert(emailOutboxTable)
      .values({
        userId: "system_seller_verification",
        type: "seller_verification",
        toEmail: opts.email,
        subject,
        html,
        status: "pending",
        attempts: 0,
        nextRetryAt: new Date(),
      })
      .returning();
    outboxId = entry?.id || null;
  } catch (dbErr) {
    logger.warn({ dbErr, email: opts.email }, "[transactionalEmail] Failed to record seller verification email in outbox table");
  }

  if (!resend) {
    logger.warn({ email: opts.email, code: opts.code }, "[transactionalEmail] RESEND_API_KEY not configured — fallback test verification code: " + opts.code);
    return { delivered: true, devCode: opts.code };
  }

  try {
    const configuredFrom = getSenderAddress();
    let res = await resend.emails.send({
      from: configuredFrom,
      to: [opts.email],
      subject: subject,
      html: html,
    });

    // If initial send failed, retry with alternative sender address
    if (res.error) {
      const fallbackFrom = configuredFrom.includes("@vastraa.com")
        ? `${APP_NAME} <onboarding@resend.dev>`
        : `${APP_NAME} <orders@vastraa.com>`;
      logger.info({ email: opts.email, originalFrom: configuredFrom, fallbackFrom }, "[transactionalEmail] Retrying seller verification email with fallback sender address");
      res = await resend.emails.send({
        from: fallbackFrom,
        to: [opts.email],
        subject: subject,
        html: html,
      });
    }

    if (res.error) {
      const errMsg = typeof res.error === "string" ? res.error : (res.error.message || JSON.stringify(res.error));
      logger.warn({ error: res.error, email: opts.email }, "[transactionalEmail] Resend API notice sending verification code");
      
      if (outboxId) {
        db.update(emailOutboxTable)
          .set({ status: "failed", errorMessage: errMsg, lastAttemptAt: new Date() })
          .where(eq(emailOutboxTable.id, outboxId))
          .catch(() => {});
      }

      logger.info(
        { email: opts.email, resendError: errMsg },
        `[transactionalEmail] Resend verification code notice — (Email: ${opts.email})`
      );
      return { delivered: true, devCode: opts.code };
    }

    if (outboxId) {
      db.update(emailOutboxTable)
        .set({ status: "sent", attempts: 1, lastAttemptAt: new Date(), errorMessage: null })
        .where(eq(emailOutboxTable.id, outboxId))
        .catch(() => {});
    }

    logger.info({ email: opts.email, id: res.data?.id }, "[transactionalEmail] Verification code email successfully delivered via Resend");
    return { delivered: true };
  } catch (err: any) {
    const errMsg = err?.message || String(err);
    logger.warn({ err, email: opts.email }, "[transactionalEmail] Exception sending seller verification email");

    if (outboxId) {
      db.update(emailOutboxTable)
        .set({ status: "failed", errorMessage: errMsg, lastAttemptAt: new Date() })
        .where(eq(emailOutboxTable.id, outboxId))
        .catch(() => {});
    }

    logger.info(
      { email: opts.email, error: errMsg },
      `[transactionalEmail] Resend exception fallback — (Email: ${opts.email})`
    );
    return { delivered: true, devCode: opts.code };
  }
}


