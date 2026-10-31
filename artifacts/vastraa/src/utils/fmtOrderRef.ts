/**
 * Returns the best human-readable order reference for display.
 * - If displayId is available (new orders and backfilled legacy orders), use it directly.
 * - Otherwise fall back to a short TD-prefixed hex snippet derived from the UUID PK
 *   (only relevant for related-table orderId fields like settlements, rewards, coupons
 *   which store the raw PK and don't carry a separate displayId).
 */
export function fmtOrderRef(id: string | null | undefined, displayId?: string | null): string {
  if (displayId) return displayId;
  if (!id) return "—";
  if (id.startsWith("V") || id.startsWith("TD")) return id;
  // Fallback UUID: render as V-XXXXXXXX for consistency
  return `V-${id.replace(/-/g, "").slice(0, 8).toUpperCase()}`;
}
