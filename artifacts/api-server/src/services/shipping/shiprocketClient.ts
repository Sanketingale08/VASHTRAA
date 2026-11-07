import crypto from "crypto";
import { LoggerService } from "../loggerService";

export interface ShiprocketCredentials {
  email?: string;
  password?: string;
}

export interface ShiprocketApiResult<T = any> {
  success: boolean;
  data?: T;
  statusCode?: number;
  error?: string;
  isMock?: boolean;
}

// In-memory token cache
let cachedToken: string | null = null;
let tokenExpiresAt: number = 0;

export function getShiprocketCredentials(): ShiprocketCredentials {
  return {
    email: process.env.SHIPROCKET_EMAIL?.trim(),
    password: process.env.SHIPROCKET_PASSWORD?.trim(),
  };
}

export function isShiprocketConfigured(): boolean {
  const { email, password } = getShiprocketCredentials();
  return Boolean(email && password && email !== "placeholder" && password !== "placeholder");
}

export function clearTokenCache(): void {
  cachedToken = null;
  tokenExpiresAt = 0;
}

const SHIPROCKET_BASE_URL = "https://apiv2.shiprocket.in/v1/external";

/**
 * Authenticates with Shiprocket and obtains a Bearer token.
 * Tokens are valid for 10 days; we cache and refresh proactively.
 */
export async function getShiprocketAuthToken(): Promise<{ token: string | null; error?: string }> {
  const { email, password } = getShiprocketCredentials();

  if (!email || !password) {
    return { token: null, error: "Shiprocket credentials (SHIPROCKET_EMAIL, SHIPROCKET_PASSWORD) are not configured." };
  }

  const now = Date.now();
  if (cachedToken && tokenExpiresAt > now + 3600 * 1000) {
    return { token: cachedToken };
  }

  try {
    const res = await fetch(`${SHIPROCKET_BASE_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    const body = (await res.json()) as any;
    if (!res.ok || !body.token) {
      const errMsg = body?.message || `Shiprocket authentication failed with status ${res.status}`;
      return { token: null, error: errMsg };
    }

    cachedToken = body.token;
    // Set expiry to 9 days from now (tokens are valid for 10 days)
    tokenExpiresAt = now + 9 * 24 * 3600 * 1000;
    return { token: cachedToken };
  } catch (err: any) {
    return { token: null, error: `Shiprocket auth network error: ${err?.message || err}` };
  }
}

/**
 * Makes an authenticated request to Shiprocket API with retry on 401 token expiry.
 */
export async function shiprocketApiRequest<T = any>(
  endpoint: string,
  options: {
    method?: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
    body?: any;
    params?: Record<string, string | number | boolean | undefined>;
  } = {}
): Promise<ShiprocketApiResult<T>> {
  const { method = "GET", body, params } = options;

  let auth = await getShiprocketAuthToken();
  if (!auth.token) {
    return { success: false, error: auth.error || "Authentication failed" };
  }

  let url = endpoint.startsWith("http") ? endpoint : `${SHIPROCKET_BASE_URL}${endpoint.startsWith("/") ? "" : "/"}${endpoint}`;
  if (params) {
    const query = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null) {
        query.append(k, String(v));
      }
    }
    const qStr = query.toString();
    if (qStr) {
      url += (url.includes("?") ? "&" : "?") + qStr;
    }
  }

  const doRequest = async (token: string) => {
    return await fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  };

  const startTime = Date.now();
  try {
    let res: Response;
    try {
      res = await doRequest(auth.token);
    } catch (netErr: any) {
      // Retry once on transient network hiccup
      await new Promise((r) => setTimeout(r, 500));
      res = await doRequest(auth.token);
    }

    // If token expired, clear cache and retry once
    if (res.status === 401) {
      clearTokenCache();
      auth = await getShiprocketAuthToken();
      if (!auth.token) {
        LoggerService.logThirdParty({
          provider: "shiprocket",
          endpoint,
          method,
          statusCode: 401,
          durationMs: Date.now() - startTime,
          success: false,
          error: "Re-authentication failed after 401 response",
        }).catch(() => {});
        return { success: false, statusCode: 401, error: "Re-authentication failed after 401 response" };
      }
      res = await doRequest(auth.token);
    }

    const data = (await res.json().catch(() => null)) as any;
    const durationMs = Date.now() - startTime;

    if (!res.ok) {
      const errMsg =
        data?.message ||
        (Array.isArray(data?.errors) ? data.errors.join(", ") : null) ||
        (typeof data?.errors === "object" ? JSON.stringify(data.errors) : null) ||
        `Shiprocket request failed with status ${res.status}`;
      LoggerService.logThirdParty({
        provider: "shiprocket",
        endpoint,
        method,
        statusCode: res.status,
        durationMs,
        success: false,
        error: errMsg,
      }).catch(() => {});
      return { success: false, statusCode: res.status, error: errMsg, data };
    }

    LoggerService.logThirdParty({
      provider: "shiprocket",
      endpoint,
      method,
      statusCode: res.status,
      durationMs,
      success: true,
    }).catch(() => {});

    return { success: true, statusCode: res.status, data };
  } catch (err: any) {
    LoggerService.logThirdParty({
      provider: "shiprocket",
      endpoint,
      method,
      statusCode: 500,
      durationMs: Date.now() - startTime,
      success: false,
      error: `Shiprocket API network error: ${err?.message || err}`,
    }).catch(() => {});
    return { success: false, error: `Shiprocket API network error: ${err?.message || err}` };
  }
}
