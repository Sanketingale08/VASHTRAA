/**
 * Shared admin API utility.
 * Always sends both x-admin-key and x-admin-session-token (when present)
 * so all admin pages work correctly when 2FA is enabled.
 */

export function adminKey(): string {
  return typeof window !== "undefined"
    ? (sessionStorage.getItem("td_admin_key") ?? "")
    : "";
}

export function adminSessionToken(): string {
  return typeof window !== "undefined"
    ? (sessionStorage.getItem("td_admin_session_token") ?? "")
    : "";
}

/** Returns the headers object to pass to fetch() for admin requests. */
export function adminHeaders(extra?: Record<string, string>): Record<string, string> {
  const h: Record<string, string> = {
    "x-admin-key": adminKey(),
    "Content-Type": "application/json",
    ...(extra ?? {}),
  };
  const token = adminSessionToken();
  if (token) h["x-admin-session-token"] = token;
  return h;
}

/** Fetch wrapper that always includes admin credentials. Throws on non-OK. */
export async function adminFetch(path: string, opts: RequestInit = {}): Promise<any> {
  const headers = adminHeaders(opts.headers as Record<string, string> | undefined ?? undefined);
  const r = await fetch(path, { ...opts, credentials: "include", headers });
  if (!r.ok) {
    const body = await r.json().catch(() => ({}));
    const err: any = new Error(body.error ?? `HTTP ${r.status}`);
    err.code = body.code;
    err.status = r.status;
    throw err;
  }
  return r.json();
}

/** Store a verified session token + id returned by the 2FA login endpoint. */
export function storeAdminSession(tokenHash: string, sessionId: string): void {
  sessionStorage.setItem("td_admin_session_token", tokenHash);
  sessionStorage.setItem("td_admin_session_id", sessionId);
}

/** Clear all admin auth state from sessionStorage. */
export function clearAdminSession(): void {
  sessionStorage.removeItem("td_admin_key");
  sessionStorage.removeItem("td_admin_session_token");
  sessionStorage.removeItem("td_admin_session_id");
  sessionStorage.removeItem("td_admin_2fa_pending");
}
