import { db, notificationsTable, ADMIN_NOTIFICATION_USER_ID, siteSettingsTable } from "@workspace/db";
import type { AdminNotificationType } from "@workspace/db";
import { eq } from "drizzle-orm";

// ─── Map notification types → admin_notification_prefs category keys ──────────

const TYPE_TO_PREF_KEY: Partial<Record<AdminNotificationType, string>> = {
  new_seller_registration:  "new_vendor_registration",
  kyc_submitted:            "vendor_approval_required",
  product_pending_approval: "vendor_approval_required",
  high_value_order:         "new_order",
  customer_complaint:       "vendor_dispute",
  system_error_alert:       "system_error",
  email_delivery_failed:    "system_error",
  payout_failed:            "payment_failure",
  payment_gateway_issue:    "payment_failure",
  seller_support_request:   "support_ticket",
};

// ─── Preference cache (60s TTL) ───────────────────────────────────────────────

interface PrefRow { email: boolean; inApp: boolean; sms: boolean }
let _prefCache: { prefs: Record<string, PrefRow>; expiresAt: number } | null = null;

async function getAdminNotifPrefs(): Promise<Record<string, PrefRow>> {
  if (_prefCache && Date.now() < _prefCache.expiresAt) return _prefCache.prefs;
  try {
    const [row] = await db
      .select({ value: siteSettingsTable.value })
      .from(siteSettingsTable)
      .where(eq(siteSettingsTable.key, "admin_notification_prefs"));
    const prefs: Record<string, PrefRow> = row?.value ? JSON.parse(row.value) : {};
    _prefCache = { prefs, expiresAt: Date.now() + 60_000 };
    return prefs;
  } catch {
    return {};
  }
}

/** Call this whenever notification prefs are saved so the cache is refreshed. */
export function clearAdminNotifPrefCache(): void {
  _prefCache = null;
}

// ─── Exported for testing only ────────────────────────────────────────────────
export { TYPE_TO_PREF_KEY };

// ─── Main insert helper ───────────────────────────────────────────────────────

interface InsertAdminNotificationOpts {
  tx?: any;
  type: AdminNotificationType;
  title: string;
  body: string;
  metadata?: Record<string, unknown>;
}

export async function insertAdminNotification(opts: InsertAdminNotificationOpts): Promise<void> {
  const { type, title, body, metadata } = opts;

  // Check whether the in-app channel is enabled for this notification category.
  // If the admin has explicitly disabled in-app for this category, skip insertion.
  const prefKey = TYPE_TO_PREF_KEY[type];
  if (prefKey) {
    const prefs = await getAdminNotifPrefs();
    const pref = prefs[prefKey];
    if (pref && pref.inApp === false) return; // channel disabled
  }

  const client = opts.tx ?? db;
  await client.insert(notificationsTable).values({
    userId: ADMIN_NOTIFICATION_USER_ID,
    type,
    title,
    body,
    metadata: metadata ?? {},
  });
}
