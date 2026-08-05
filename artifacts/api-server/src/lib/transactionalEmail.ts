import { clerkClient } from "@clerk/express";
import { Resend } from "resend";
import { db, emailOutboxTable } from "@workspace/db";
import { eq, and, lte, lt, inArray } from "drizzle-orm";
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
  entry: { id: string; toEmail: string; subject: string; html: string; attempts: number; orderId: string; userId: string }
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
}): Promise<void> {
  const resend = getResendClient();
  if (!resend) {
    logger.warn("[transactionalEmail] RESEND_API_KEY not set — skipping vendor suspension email");
    return;
  }

  const { toEmail, vendorName } = opts;
  const subject = `Your TwirlDrape store has been suspended`;
  const body = `
    <p>We regret to inform you that your store <strong>${vendorName}</strong> has been <strong>suspended</strong> by the TwirlDrape team.</p>
    <p>Your store listings are no longer visible to shoppers while the suspension is in effect.</p>
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
}): Promise<void> {
  const resend = getResendClient();
  if (!resend) {
    logger.warn("[transactionalEmail] RESEND_API_KEY not set — skipping vendor rejection email");
    return;
  }

  const { toEmail, vendorName } = opts;
  const subject = `Update on your TwirlDrape seller application`;
  const body = `
    <p>Thank you for your interest in selling on TwirlDrape.</p>
    <p>After reviewing your application for <strong>${vendorName}</strong>, we are unable to approve your store at this time.</p>
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
