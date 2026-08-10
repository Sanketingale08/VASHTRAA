import { clerkClient } from "@clerk/express";
import { Resend } from "resend";
import { db, emailOutboxTable, sellerRegistrationDraftsTable } from "@workspace/db";
import { eq, and, lte, lt, inArray, isNull } from "drizzle-orm";
import { logger } from "./logger";
import { insertAdminNotification } from "./adminNotifications";

const APP_NAME = "TwirlDrape";
const FROM_ADDRESS = "orders@twirldrape.com";

const MAX_ATTEMPTS = 3;
const RETRY_BACKOFF_SECONDS = [60, 300];

function getResendClient(): Resend | null {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return null;
  return new Resend(apiKey);
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
  entry: { id: string; toEmail: string; subject: string; html: string; attempts: number; orderId: string | null; userId: string }
): Promise<void> {
  const now = new Date();
  const nextAttempt = entry.attempts + 1;

  try {
    await resend.emails.send({
      from: `${APP_NAME} <${FROM_ADDRESS}>`,
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
      insertAdminNotification({
        type: "email_delivery_failed",
        title: "Order email permanently failed",
        body: `An email to customer (order ${entry.orderId}) could not be delivered after ${nextAttempt} attempts and requires manual follow-up.`,
        metadata: {
          outboxId: entry.id,
          orderId: entry.orderId,
          userId: entry.userId,
          toEmail: entry.toEmail,
          subject: entry.subject,
          attempts: nextAttempt,
          error: errMsg,
        },
      }).catch((notifErr) => {
        logger.error({ notifErr, orderId: entry.orderId }, "[emailOutbox] Failed to insert admin notification for dead email");
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

export async function sendVendorApprovalEmail(opts: {
  toEmail: string;
  vendorName: string;
  dashboardUrl?: string;
}): Promise<void> {
  const resend = getResendClient();
  if (!resend) {
    logger.warn("[transactionalEmail] RESEND_API_KEY not set — skipping vendor approval email");
    return;
  }

  const { toEmail, vendorName, dashboardUrl = "https://twirldrape.com/seller/dashboard" } = opts;
  const subject = `Your TwirlDrape store is live — Welcome aboard!`;
  const body = `
    <p>Congratulations! Your store <strong>${vendorName}</strong> has been <strong>approved</strong> by the TwirlDrape team.</p>
    <p>Your store is now live and you can start listing your sarees right away.</p>
    <p style="margin:24px 0;">
      <a href="${dashboardUrl}"
         style="background:#7c3aed;color:#ffffff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;display:inline-block;">
        Go to Seller Dashboard
      </a>
    </p>
    <p>If you have any questions, our support team is here to help.</p>
    <p>Welcome to the TwirlDrape family!</p>
  `;

  try {
    await resend.emails.send({
      from: `${APP_NAME} <${FROM_ADDRESS}>`,
      to: [toEmail],
      subject,
      html: wrapInTemplate(subject, body),
    });
    logger.info({ toEmail, vendorName }, "[transactionalEmail] Vendor approval email sent");
  } catch (err) {
    logger.error({ err, toEmail, vendorName }, "[transactionalEmail] Failed to send vendor approval email");
  }
}

export async function sendVendorSuspensionEmail(opts: {
  toEmail: string;
  vendorName: string;
  reason?: string;
}): Promise<void> {
  const resend = getResendClient();
  if (!resend) {
    logger.warn("[transactionalEmail] RESEND_API_KEY not set — skipping vendor suspension email");
    return;
  }

  const { toEmail, vendorName, reason } = opts;
  const subject = `Your TwirlDrape store has been suspended`;
  const body = `
    <p>We regret to inform you that your store <strong>${vendorName}</strong> has been <strong>suspended</strong> by the TwirlDrape team.</p>
    <p>Your store listings are no longer visible to shoppers while the suspension is in effect.</p>
    ${reason ? `<p><strong>Reason:</strong> ${reason}</p>` : ""}
    <p>If you believe this is an error or would like to appeal, please contact our support team with your store details and we will review your case.</p>
    <p>We appreciate your understanding and hope to resolve this as quickly as possible.</p>
  `;

  try {
    await resend.emails.send({
      from: `${APP_NAME} <${FROM_ADDRESS}>`,
      to: [toEmail],
      subject,
      html: wrapInTemplate(subject, body),
    });
    logger.info({ toEmail, vendorName }, "[transactionalEmail] Vendor suspension email sent");
  } catch (err) {
    logger.error({ err, toEmail, vendorName }, "[transactionalEmail] Failed to send vendor suspension email");
  }
}

export async function sendVendorRejectionEmail(opts: {
  toEmail: string;
  vendorName: string;
  reason?: string;
}): Promise<void> {
  const resend = getResendClient();
  if (!resend) {
    logger.warn("[transactionalEmail] RESEND_API_KEY not set — skipping vendor rejection email");
    return;
  }

  const { toEmail, vendorName, reason } = opts;
  const subject = `Update on your TwirlDrape seller application`;
  const body = `
    <p>Thank you for your interest in selling on TwirlDrape.</p>
    <p>After reviewing your application for <strong>${vendorName}</strong>, we are unable to approve your store at this time.</p>
    ${reason ? `<p><strong>Reason:</strong> ${reason}</p>` : ""}
    <p>If you have questions about this decision or would like guidance on reapplying, please reach out to our support team — we are happy to help.</p>
    <p>Thank you for your understanding.</p>
  `;

  try {
    await resend.emails.send({
      from: `${APP_NAME} <${FROM_ADDRESS}>`,
      to: [toEmail],
      subject,
      html: wrapInTemplate(subject, body),
    });
    logger.info({ toEmail, vendorName }, "[transactionalEmail] Vendor rejection email sent");
  } catch (err) {
    logger.error({ err, toEmail, vendorName }, "[transactionalEmail] Failed to send vendor rejection email");
  }
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
  const dashboardUrl = opts.dashboardUrl ?? "https://twirldrape.com/seller/dashboard";
  const subject = `Your TwirlDrape store is live — Welcome aboard!`;
  const body = `
    <p>Congratulations! Your store <strong>${opts.vendorName}</strong> has been <strong>approved</strong> by the TwirlDrape team.</p>
    <p>Your store is now live and you can start listing your sarees right away.</p>
    <p style="margin:24px 0;">
      <a href="${dashboardUrl}"
         style="background:#7c3aed;color:#ffffff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;display:inline-block;">
        Go to Seller Dashboard
      </a>
    </p>
    <p>If you have any questions, our support team is here to help.</p>
    <p>Welcome to the TwirlDrape family!</p>
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
  const subject = `Your TwirlDrape store has been suspended`;
  const body = `
    <p>We regret to inform you that your store <strong>${opts.vendorName}</strong> has been <strong>suspended</strong> by the TwirlDrape team.</p>
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
  const subject = `Update on your TwirlDrape seller application`;
  const body = `
    <p>Thank you for your interest in selling on TwirlDrape.</p>
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

  const registrationUrl = opts.registrationUrl ?? "https://twirldrape.com/seller/register";
  const subject = `Complete your TwirlDrape seller registration`;
  const body = `
    <p>Hi there,</p>
    <p>You started your seller registration on TwirlDrape but haven't finished yet. Your progress has been saved — pick up right where you left off!</p>
    <p style="margin:24px 0;">
      <a href="${registrationUrl}"
         style="background:#7c3aed;color:#ffffff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;display:inline-block;">
        Continue Registration
      </a>
    </p>
    <p>Once approved, you'll be able to list your sarees and reach thousands of shoppers across India.</p>
    <p>If you have any questions or need help, feel free to reach out to our support team — we're happy to assist.</p>
    <p>We hope to see you on TwirlDrape soon!</p>
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

        const registrationUrl = "https://twirldrape.com/seller/register";
        const subject = `Complete your TwirlDrape seller registration`;
        const body = `
    <p>Hi there,</p>
    <p>You started your seller registration on TwirlDrape but haven't finished yet. Your progress has been saved — pick up right where you left off!</p>
    <p style="margin:24px 0;">
      <a href="${registrationUrl}"
         style="background:#7c3aed;color:#ffffff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;display:inline-block;">
        Continue Registration
      </a>
    </p>
    <p>Once approved, you'll be able to list your sarees and reach thousands of shoppers across India.</p>
    <p>If you have any questions or need help, feel free to reach out to our support team — we're happy to assist.</p>
    <p>We hope to see you on TwirlDrape soon!</p>
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

  const subject = `Your coupon "${opts.couponCode}" expires in ${opts.daysLeft} day${opts.daysLeft !== 1 ? "s" : ""} — TwirlDrape`;
  const body = `
    <p>Hi there,</p>
    <p>Just a reminder that your coupon code <strong>${opts.couponCode}</strong> will expire in <strong>${opts.daysLeft} day${opts.daysLeft !== 1 ? "s" : ""}</strong>.</p>
    <p>Use it before it's gone to enjoy your discount on your next saree purchase!</p>
    <p style="margin:24px 0;">
      <a href="https://twirldrape.com/designer"
         style="background:#7c3aed;color:#ffffff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;display:inline-block;">
        Shop Now
      </a>
    </p>
    <p>You can manage your email preferences from your <a href="https://twirldrape.com/account/notifications">account settings</a>.</p>
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

  const subject = `Back in stock: "${opts.productName}" — TwirlDrape`;
  const body = `
    <p>Great news!</p>
    <p>A saree you wishlisted — <strong>${opts.productName}</strong> — is back in stock.</p>
    <p>Stock is limited, so don't wait too long!</p>
    <p style="margin:24px 0;">
      <a href="https://twirldrape.com/products/${opts.productId}"
         style="background:#7c3aed;color:#ffffff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;display:inline-block;">
        View Product
      </a>
    </p>
    <p>You can manage your email preferences from your <a href="https://twirldrape.com/account/notifications">account settings</a>.</p>
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
