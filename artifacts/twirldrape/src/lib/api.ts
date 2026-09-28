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
  const baseUrl = (typeof import.meta !== "undefined" && (import.meta.env?.VITE_API_URL || import.meta.env?.VITE_SERVER_URL)) || "";
  if (baseUrl) {
    const cleanBase = baseUrl.replace(/\/$/, "");
    const cleanPath = path.startsWith("/") ? path : `/${path}`;
    return `${cleanBase}${cleanPath}`;
  }
  return path;
}

export function getStoredToken(): string | null {
  const token = localStorage.getItem("vastraa_auth_token");
  if (token) return token;
  const sellerEmail = localStorage.getItem("vastraa_seller_email");
  if (sellerEmail) return sellerEmail;
  const clerkUserId = localStorage.getItem("clerk_user_id");
  if (clerkUserId) return clerkUserId;
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

export async function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const token = getStoredToken();
  const headers = new Headers(init?.headers);
  if (token && !headers.has("Authorization") && !headers.has("authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  return fetch(input, {
    credentials: "include",
    ...init,
    headers,
  });
}
