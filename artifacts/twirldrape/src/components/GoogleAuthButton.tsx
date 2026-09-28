import React, { useState } from "react";
import { Loader2 } from "lucide-react";

interface GoogleAuthButtonProps {
  targetRole: "customer" | "seller";
  mode: "login" | "signup";
  onSuccessChallenge: (data: {
    challengeId: string;
    email: string;
    targetRole: "customer" | "seller";
  }) => void;
  onError: (error: string) => void;
  className?: string;
  disabled?: boolean;
}

export function GoogleAuthButton({
  targetRole,
  mode,
  onSuccessChallenge,
  onError,
  className = "",
  disabled = false,
}: GoogleAuthButtonProps) {
  const [isLoading, setIsLoading] = useState(false);

  const handleGoogleClick = async () => {
    if (isLoading || disabled) return;
    setIsLoading(true);
    onError("");

    try {
      // Step 1: Fetch real production Google OAuth URL from server
      const redirectUri = `${window.location.origin}${import.meta.env.BASE_URL.replace(/\/$/, "")}/google-callback`;
      const urlRes = await fetch(
        `/api/auth/google/url?role=${encodeURIComponent(targetRole)}&mode=${encodeURIComponent(mode)}&redirectUri=${encodeURIComponent(redirectUri)}`
      );

      if (!urlRes.ok) {
        const errorJson = await urlRes.json().catch(() => ({}));
        throw new Error(errorJson.error || "Failed to initialize Google login.");
      }

      const urlData = await urlRes.json();
      if (!urlData.success || !urlData.url) {
        throw new Error(urlData.error || "Google login service unavailable.");
      }

      // Step 2: Open Google's Official OAuth Consent Page in a popup window
      const width = 500;
      const height = 650;
      const left = window.screenX + (window.innerWidth - width) / 2;
      const top = window.screenY + (window.innerHeight - height) / 2;

      const popup = window.open(
        urlData.url,
        "GoogleOAuthWindow",
        `width=${width},height=${height},top=${top},left=${left},status=no,resizable=yes,scrollbars=yes`
      );

      if (!popup) {
        // Fallback: redirect top window if popup blocker prevented window opening
        window.location.href = urlData.url;
        return;
      }

      // Step 3: Listen for real OAuth authorization response from callback page
      const handleMessage = async (event: MessageEvent) => {
        if (event.origin !== window.location.origin) return;
        if (event.data?.type === "GOOGLE_OAUTH_RESPONSE") {
          window.removeEventListener("message", handleMessage);
          if (popup && !popup.closed) popup.close();

          if (event.data.error) {
            onError(event.data.error || "Google authentication cancelled.");
            setIsLoading(false);
            return;
          }

          if (event.data.code || event.data.token) {
            try {
              const callbackRes = await fetch("/api/auth/google/callback", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  code: event.data.code,
                  token: event.data.token,
                  role: targetRole,
                  mode,
                  redirectUri,
                }),
              });

              const callbackData = await callbackRes.json();
              if (!callbackRes.ok || !callbackData.success) {
                onError(callbackData.error || "Google authentication failed.");
              } else {
                onSuccessChallenge({
                  challengeId: callbackData.challengeId,
                  email: callbackData.email,
                  targetRole: callbackData.targetRole,
                });
              }
            } catch {
              onError("Server error processing Google Login response.");
            } finally {
              setIsLoading(false);
            }
          }
        }
      };

      window.addEventListener("message", handleMessage);

      // Check if popup was closed manually by user
      const checkClosed = setInterval(() => {
        if (popup.closed) {
          clearInterval(checkClosed);
          window.removeEventListener("message", handleMessage);
          setIsLoading(false);
        }
      }, 1000);
    } catch (err: any) {
      onError(err?.message || "Google authentication failed. Please try again.");
      setIsLoading(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleGoogleClick}
      disabled={isLoading || disabled}
      className={`w-full py-3.5 px-4 bg-white hover:bg-gray-50 border border-[#C7CCD1] rounded-xl font-sans font-semibold text-xs md:text-sm text-[#0A1F44] transition-all flex items-center justify-center gap-3 shadow-sm hover:shadow cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed ${className}`}
      aria-label="Continue with Google"
    >
      {isLoading ? (
        <>
          <Loader2 className="w-4 h-4 animate-spin text-[#0A1F44]" />
          <span>Connecting to Google...</span>
        </>
      ) : (
        <>
          {/* Official Google Brand Icon */}
          <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
            <path
              fill="#4285F4"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
              fill="#34A853"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="#FBBC05"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
            />
            <path
              fill="#EA4335"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
            />
          </svg>
          <span>Continue with Google</span>
        </>
      )}
    </button>
  );
}
