import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Loader2, AlertCircle, CheckCircle2 } from "lucide-react";
import { Layout } from "@/components/Layout";
import { apiFetch } from "@/lib/api";

function safeDecodeBase64Url(str: string): any {
  try {
    const base64 = str.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
    const jsonStr = decodeURIComponent(
      atob(padded)
        .split("")
        .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
        .join("")
    );
    return JSON.parse(jsonStr);
  } catch {
    return null;
  }
}

export default function GoogleOAuthCallback() {
  const [, setLocation] = useLocation();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPopupClosedNotice, setIsPopupClosedNotice] = useState(false);

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const hashStr = window.location.hash.startsWith("#") ? window.location.hash.slice(1) : window.location.hash;
    const hashParams = new URLSearchParams(hashStr);

    const code = searchParams.get("code") || hashParams.get("code");
    const token =
      searchParams.get("id_token") ||
      searchParams.get("access_token") ||
      hashParams.get("id_token") ||
      hashParams.get("access_token");
    const error = searchParams.get("error") || hashParams.get("error");
    const errorDesc = searchParams.get("error_description") || hashParams.get("error_description");
    const state = searchParams.get("state") || hashParams.get("state");

    const isPopup =
      window.opener != null ||
      window.name === "GoogleOAuthWindow" ||
      (typeof window !== "undefined" && window.innerWidth <= 640 && window.innerHeight <= 750);

    // 1. Handle error returned by Google
    if (error) {
      const errText = errorDesc || error || "Google authentication failed or was cancelled.";

      if (typeof BroadcastChannel !== "undefined") {
        try {
          const ch = new BroadcastChannel("vastraa_google_oauth");
          ch.postMessage({ type: "GOOGLE_OAUTH_RESPONSE", error: errText });
          ch.close();
        } catch {
          /* ignore */
        }
      }

      try {
        localStorage.setItem(
          "vastraa_google_oauth_response",
          JSON.stringify({ error: errText, timestamp: Date.now() })
        );
      } catch {
        /* ignore */
      }

      if (window.opener) {
        try {
          window.opener.postMessage({ type: "GOOGLE_OAUTH_RESPONSE", error: errText }, window.location.origin);
        } catch {
          /* ignore */
        }
      }

      if (isPopup) {
        setIsPopupClosedNotice(true);
        setTimeout(() => {
          try {
            window.close();
          } catch {
            /* ignore */
          }
        }, 400);
      } else {
        setErrorMessage(errText);
      }
      return;
    }

    // 2. Handle successful authorization code or token from Google
    if (code || token) {
      const payload = {
        type: "GOOGLE_OAUTH_RESPONSE",
        code: code || undefined,
        token: token || undefined,
        state: state || undefined,
      };

      // Broadcast across all available browser channels
      if (typeof BroadcastChannel !== "undefined") {
        try {
          const ch = new BroadcastChannel("vastraa_google_oauth");
          ch.postMessage(payload);
          ch.close();
        } catch {
          /* ignore */
        }
      }

      try {
        localStorage.setItem(
          "vastraa_google_oauth_response",
          JSON.stringify({ ...payload, timestamp: Date.now() })
        );
      } catch {
        /* ignore */
      }

      if (window.opener) {
        try {
          window.opener.postMessage(payload, window.location.origin);
        } catch {
          /* ignore */
        }
      }

      // If running inside the desktop popup window, close smoothly after broadcasting
      if (isPopup) {
        setIsPopupClosedNotice(true);
        setTimeout(() => {
          try {
            window.close();
          } catch {
            /* ignore */
          }
        }, 400);
        return;
      }

      // 3. Fallback for full-screen / mobile redirects (where this window is the main window)
      let targetRole = "customer";
      let mode = "login";
      let returnTo: string | undefined = undefined;
      let callbackRedirectUri = `${window.location.origin}${import.meta.env.BASE_URL.replace(/\/$/, "")}/google-callback`;

      if (state) {
        const parsed = safeDecodeBase64Url(state);
        if (parsed) {
          if (parsed.role) targetRole = parsed.role;
          if (parsed.mode) mode = parsed.mode;
          if (parsed.returnTo) returnTo = parsed.returnTo;
          if (parsed.redirectUri) callbackRedirectUri = parsed.redirectUri;
        }
      }

      apiFetch("/api/auth/google/callback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code,
          token,
          role: targetRole,
          mode,
          state,
          redirectUri: callbackRedirectUri,
        }),
      })
        .then((res) => res.json())
        .then((data) => {
          if (data.success) {
            if (data.token) {
              localStorage.setItem("vastraa_auth_token", data.token);
              if (data.user?.role === "seller") {
                localStorage.setItem("vastraa_seller_authenticated", "true");
                localStorage.setItem("vastraa_seller_email", data.user?.email || "");
              } else {
                localStorage.removeItem("vastraa_seller_authenticated");
                localStorage.removeItem("vastraa_seller_email");
              }
              const target =
                data.redirectUrl || returnTo || (data.user?.role === "seller" ? "/seller/dashboard" : "/account/overview");
              window.location.href = target;
            } else if (data.challengeId) {
              sessionStorage.setItem(
                "td_google_challenge",
                JSON.stringify({
                  challengeId: data.challengeId,
                  email: data.email,
                  targetRole: data.targetRole,
                })
              );
              const redirectPath =
                targetRole === "seller"
                  ? mode === "signup"
                    ? "/seller/register"
                    : "/seller/login"
                  : mode === "signup"
                  ? "/sign-up"
                  : "/sign-in";
              setLocation(`${redirectPath}?otp_prompt=true`);
            }
          } else {
            setErrorMessage(data.error || "Google authentication failed.");
          }
        })
        .catch(() => {
          setErrorMessage("Server error during Google OAuth verification.");
        });
    } else {
      setErrorMessage("No Google authorization code detected.");
    }
  }, [setLocation]);

  return (
    <Layout>
      <div className="flex min-h-[60vh] items-center justify-center px-4 py-12 bg-[#F4F5F7]">
        <div className="w-full max-w-md bg-white rounded-2xl p-8 shadow-xl border border-[#C7CCD1] text-center">
          {errorMessage ? (
            <div className="space-y-4">
              <div className="w-12 h-12 rounded-full bg-red-100 text-red-600 mx-auto flex items-center justify-center">
                <AlertCircle size={24} />
              </div>
              <h2 className="text-xl font-serif font-bold text-[#0A1F44]">Authentication Failed</h2>
              <p className="text-sm text-red-700">{errorMessage}</p>
              <button
                type="button"
                onClick={() => setLocation("/sign-in")}
                className="py-2.5 px-6 bg-[#0A1F44] text-white text-xs font-bold uppercase rounded-lg shadow hover:bg-[#2C3E6B] transition-colors cursor-pointer"
              >
                Return to Sign In
              </button>
            </div>
          ) : isPopupClosedNotice ? (
            <div className="space-y-4 py-4">
              <div className="w-12 h-12 rounded-full bg-green-100 text-green-600 mx-auto flex items-center justify-center">
                <CheckCircle2 size={24} />
              </div>
              <h2 className="text-lg font-serif font-bold text-[#0A1F44]">Google Sign-In Successful!</h2>
              <p className="text-xs text-gray-500">Closing window and returning to VASTRAA...</p>
            </div>
          ) : (
            <div className="space-y-4 py-4">
              <Loader2 className="w-10 h-10 animate-spin text-[#0A1F44] mx-auto" />
              <h2 className="text-lg font-serif font-bold text-[#0A1F44]">Verifying Google Authentication</h2>
              <p className="text-xs text-gray-500">Please wait while we verify your Google identity with the server...</p>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
