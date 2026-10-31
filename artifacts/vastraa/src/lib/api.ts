/**
 * Returns the absolute API path for use in fetch() calls.
 *
 * API calls must NOT be prefixed with BASE_URL (the web app's base path).
 * In production, the API server is registered at /api/* independently of the
 * web app's path prefix. Prepending BASE_URL routes the request to the web
 * app's static file server instead of the API server.
 *
 * BASE_URL (import.meta.env.BASE_URL) is only for client-side navigation
 * and static asset URLs — never for fetch() calls.
 */
export function getApiUrl(path: string): string {
  if (path.startsWith("http://") || path.startsWith("https://")) {
    return path;
  }
  const baseUrl = (typeof import.meta !== "undefined" && (import.meta.env?.VITE_API_URL || import.meta.env?.VITE_SERVER_URL)) || "";
  if (baseUrl) {
    const cleanBase = baseUrl.replace(/\/$/, "");
    const cleanPath = path.startsWith("/") ? path : `/${path}`;
    return `${cleanBase}${cleanPath}`;
  }
  return path;
}

export function getStoredToken(): string | null {
  const token = localStorage.getItem("vastraa_auth_token") || localStorage.getItem("clerk_user_id");
  if (token && typeof token === "string") {
    const clean = token.replace(/^["']|["']$/g, "").trim();
    if (clean) return clean;
  }
  return null;
}

export function getAuthHeaders(extraHeaders?: Record<string, string>): Record<string, string> {
  const headers: Record<string, string> = { ...extraHeaders };
  const token = getStoredToken();
  if (token && !headers["Authorization"] && !headers["authorization"]) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  return headers;
}

let isRefreshingSellerToken: Promise<string | null> | null = null;
let isRefreshingCustomerToken: Promise<string | null> | null = null;

async function refreshSellerToken(): Promise<string | null> {
  if (isRefreshingSellerToken) {
    return isRefreshingSellerToken;
  }

  isRefreshingSellerToken = (async () => {
    try {
      const res = await fetch(getApiUrl("/api/seller/refresh"), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        if (data.success && data.token) {
          localStorage.setItem("vastraa_auth_token", data.token);
          return data.token as string;
        }
      }
    } catch {
      // Ignore network errors during refresh attempt
    } finally {
      isRefreshingSellerToken = null;
    }
    return null;
  })();

  return isRefreshingSellerToken;
}

async function refreshCustomerToken(): Promise<string | null> {
  if (isRefreshingCustomerToken) {
    return isRefreshingCustomerToken;
  }

  isRefreshingCustomerToken = (async () => {
    try {
      const res = await fetch(getApiUrl("/api/auth/refresh"), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        if (data.success && data.token) {
          localStorage.setItem("vastraa_auth_token", data.token);
          return data.token as string;
        }
      }
    } catch {
      // Ignore network errors during refresh attempt
    } finally {
      isRefreshingCustomerToken = null;
    }
    return null;
  })();

  return isRefreshingCustomerToken;
}

export async function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = typeof input === "string" ? getApiUrl(input) : input;
  const token = getStoredToken();
  const headers = new Headers(init?.headers);
  if (token && !headers.has("Authorization") && !headers.has("authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  let res = await fetch(url, {
    credentials: "include",
    ...init,
    headers,
  });

  const urlString = String(url);
  const isRefreshOrAuthRequest =
    urlString.includes("/refresh") ||
    urlString.includes("/login") ||
    urlString.includes("/sign-in") ||
    urlString.includes("/sign-up");

  if (res.status === 401 && !isRefreshOrAuthRequest) {
    const isSellerEndpoint = urlString.includes("/seller/") || urlString.includes("/vendors/");
    const refreshFn = isSellerEndpoint ? refreshSellerToken : refreshCustomerToken;
    const newToken = await refreshFn();
    if (newToken) {
      headers.set("Authorization", `Bearer ${newToken}`);
      res = await fetch(url, {
        credentials: "include",
        ...init,
        headers,
      });
    }
  }

  return res;
}
