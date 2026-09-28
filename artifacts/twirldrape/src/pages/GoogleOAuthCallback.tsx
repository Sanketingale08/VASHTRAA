import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Loader2, AlertCircle } from "lucide-react";
import { Layout } from "@/components/Layout";

export default function GoogleOAuthCallback() {
  const [, setLocation] = useLocation();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const code = searchParams.get("code");
    const error = searchParams.get("error");
    const state = searchParams.get("state");

    if (error) {
      const errText = searchParams.get("error_description") || "Google authentication failed or was cancelled.";
      if (window.opener) {
        window.opener.postMessage({ type: "GOOGLE_OAUTH_RESPONSE", error: errText }, window.location.origin);
        window.close();
      } else {
        setErrorMessage(errText);
      }
      return;
    }

    if (code) {
      if (window.opener) {
        window.opener.postMessage(
          {
            type: "GOOGLE_OAUTH_RESPONSE",
            code,
            state,
          },
          window.location.origin
        );
        window.close();
        return;
      }

      // If top-level window redirect (not popup window)
      let targetRole = "customer";
      let mode = "login";
      if (state) {
        try {
          const parsed = JSON.parse(Buffer.from(state, "base64url").toString("utf-8"));
          if (parsed.role) targetRole = parsed.role;
          if (parsed.mode) mode = parsed.mode;
        } catch { /* ignore */ }
      }

      // Post authorization code to server callback for verification
      fetch("/api/auth/google/callback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code,
          role: targetRole,
          mode,
          redirectUri: window.location.href.split("?")[0],
        }),
      })
        .then((res) => res.json())
        .then((data) => {
          if (data.success && data.challengeId) {
            sessionStorage.setItem(
              "td_google_challenge",
              JSON.stringify({
                challengeId: data.challengeId,
                email: data.email,
                targetRole: data.targetRole,
              })
            );
            const redirectPath = targetRole === "seller" ? "/seller/login" : "/sign-in";
            setLocation(`${redirectPath}?otp_prompt=true`);
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
                className="py-2.5 px-6 bg-[#0A1F44] text-white text-xs font-bold uppercase rounded-lg shadow"
              >
                Return to Sign In
              </button>
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
