import { logger } from "./logger";

/**
 * Sends an SMS message via Twilio.
 *
 * Requires environment secrets:
 *   TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER
 *
 * In development (missing credentials) the message is logged to the server
 * console instead of throwing, so local flows can still be tested.
 */
export async function sendSms(to: string, body: string): Promise<void> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM_NUMBER;

  if (!sid || !token || !from) {
    // Never log the OTP body — it is a secret.
    logger.warn({ to }, "[sms] Twilio credentials not configured — SMS not delivered");
    return;
  }

  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ To: to, From: from, Body: body }).toString(),
    }
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`SMS delivery failed (${res.status}): ${text}`);
  }
}
