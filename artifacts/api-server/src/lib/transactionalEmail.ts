import { clerkClient } from "@clerk/express";
import { Resend } from "resend";

const APP_NAME = "TwirlDrape";
const FROM_ADDRESS = "orders@twirldrape.com";

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
  | "order_cancelled"
  | "order_packed"
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

export async function sendTransactionalEmail(payload: EmailPayload): Promise<void> {
  const resend = getResendClient();
  if (!resend) {
    console.warn("[transactionalEmail] RESEND_API_KEY not set — skipping email for", payload.type);
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

  const toEmail = await getUserEmail(payload.userId);
  if (!toEmail) {
    console.warn("[transactionalEmail] Could not resolve email for userId", payload.userId);
    return;
  }

  try {
    await resend.emails.send({
      from: `${APP_NAME} <${FROM_ADDRESS}>`,
      to: [toEmail],
      subject,
      html: wrapInTemplate(subject, body),
    });
  } catch (err) {
    console.error("[transactionalEmail] Failed to send email:", err);
  }
}
