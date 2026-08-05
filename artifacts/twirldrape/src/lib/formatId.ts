/**
 * Format an order or product ID for display.
 *
 * New IDs (TD / PS / DS prefix) are returned as-is — they are already short
 * and human-readable (e.g. TD100001, PS100002).
 * Legacy UUID IDs are shown as their first 8 hex chars (previous behaviour).
 */
export function fmtId(id: string | undefined | null): string {
  if (!id) return "";
  if (/^(TD|PS|DS)\d+$/.test(id)) return id;
  return id.replace(/-/g, "").slice(0, 8).toUpperCase();
}
