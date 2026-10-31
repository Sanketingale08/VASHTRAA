/**
 * Shared admin API utility.
 * Always sends both x-admin-key and x-admin-session-token (when present)
 * so all admin pages work correctly when 2FA is enabled.
 */

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

/**
 * Install a one-time global fetch interceptor that redirects to the 2FA
 * verify screen whenever any /api/admin/* response comes back with
 * status 403 and code "2FA_REQUIRED".
 *
 * Safe to call multiple times — patches window.fetch at most once.
 */
let _interceptorInstalled = false;
export function initAdmin2FAInterceptor(): void {
  if (typeof window === "undefined" || _interceptorInstalled) return;
  _interceptorInstalled = true;

  const _origFetch = window.fetch.bind(window);
  window.fetch = async function patchedFetch(
    input: RequestInfo | URL,
    init?: RequestInit
  ): Promise<Response> {
    const res = await _origFetch(input, init);

    // Only inspect admin API responses
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : (input as Request).url;
    if (res.status === 403 && url.includes("/api/admin/")) {
      // Clone so the caller can still read the body if needed
      const clone = res.clone();
      try {
        const body = await clone.json();
        if (body?.code === "2FA_REQUIRED") {
          const returnTo = encodeURIComponent(window.location.pathname + window.location.search);
          window.location.href = `${BASE}/admin/2fa-verify?returnTo=${returnTo}`;
          // Block callers from processing a partial result
          return new Promise<Response>(() => {});
        }
      } catch {
        // Not JSON — fall through and return the original response
      }
    }

    return res;
  };
}

export function adminKey(): string {
  if (typeof window === "undefined") return "Admin@123";
  const key = sessionStorage.getItem("td_admin_key") || localStorage.getItem("td_admin_key");
  return key && key.trim() ? key.trim() : "Admin@123";
}

export function adminSessionToken(): string {
  if (typeof window === "undefined") return "";
  return sessionStorage.getItem("td_admin_session_token") || localStorage.getItem("td_admin_session_token") || "";
}

/**
 * Returns authentication headers only (x-admin-key and session token),
 * without setting Content-Type so browsers can correctly set multipart boundaries on FormData.
 */
export function adminAuthHeaders(extra?: Record<string, string>): Record<string, string> {
  const h: Record<string, string> = {
    "x-admin-key": adminKey(),
    ...(extra ?? {}),
  };
  const token = adminSessionToken();
  if (token) h["x-admin-session-token"] = token;
  return h;
}

/** Returns the headers object to pass to fetch() for admin requests. */
export function adminHeaders(extra?: Record<string, string | undefined>): Record<string, string> {
  const h: Record<string, string> = {
    "x-admin-key": adminKey(),
    "Content-Type": "application/json",
  };
  const token = adminSessionToken();
  if (token) h["x-admin-session-token"] = token;
  if (extra) {
    for (const [k, v] of Object.entries(extra)) {
      if (v === undefined || v === null) {
        delete h[k];
      } else {
        h[k] = v;
      }
    }
  }
  return h;
}

/** Fetch wrapper that always includes admin credentials. Throws on non-OK.
 *  Automatically redirects to /admin/2fa-verify when the server returns 2FA_REQUIRED.
 */
export async function adminFetch(path: string, opts: RequestInit = {}): Promise<any> {
  const headers = adminHeaders(opts.headers as Record<string, string> | undefined ?? undefined);
  const r = await fetch(path, { ...opts, credentials: "include", headers });
  if (!r.ok) {
    const body = await r.json().catch(() => ({}));
    // Intercept 2FA_REQUIRED globally — redirect to verify screen with returnTo
    if (r.status === 403 && body.code === "2FA_REQUIRED" && typeof window !== "undefined") {
      const returnTo = encodeURIComponent(window.location.pathname + window.location.search);
      window.location.href = `${import.meta.env.BASE_URL.replace(/\/$/, "")}/admin/2fa-verify?returnTo=${returnTo}`;
      // Return a never-resolving promise so callers don't process a partial result
      return new Promise(() => {});
    }
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
