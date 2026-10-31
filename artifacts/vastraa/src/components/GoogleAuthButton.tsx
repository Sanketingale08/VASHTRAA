import React, { useState, useEffect, useRef } from "react";
import { Loader2 } from "lucide-react";
import { apiFetch } from "@/lib/api";

interface GoogleAuthButtonProps {
  targetRole: "customer" | "seller";
  mode: "login" | "signup";
  onSuccess?: (data: {
    token: string;
    user: any;
    redirectUrl: string;
    isNewUser?: boolean;
  }) => void;
  onSuccessChallenge?: (data: {
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
  onSuccess,
  onSuccessChallenge,
  onError,
  className = "",
  disabled = false,
}: GoogleAuthButtonProps) {
  const [isLoading, setIsLoading] = useState(false);
  const cleanupRef = useRef<(() => void) | null>(null);

  // Clean up any active listeners if component unmounts
  useEffect(() => {
    return () => {
      if (cleanupRef.current) {
        cleanupRef.current();
      }
    };
  }, []);

  const handleGoogleClick = async () => {
    if (isLoading || disabled) return;
    setIsLoading(true);
    onError("");

    try {
      // Step 1: Fetch production/dev Google OAuth URL from server
      const searchParams = new URLSearchParams(window.location.search);
      const returnTo = searchParams.get("redirect") || searchParams.get("from") || "";
      const redirectUri = `${window.location.origin}${import.meta.env.BASE_URL.replace(/\/$/, "")}/google-callback`;

      const urlQuery = new URLSearchParams({
        role: targetRole,
        mode,
        redirectUri,
        ...(returnTo ? { returnTo } : {}),
      });

      const urlRes = await apiFetch(`/api/auth/google/url?${urlQuery.toString()}`);

      if (!urlRes.ok) {
        const errorJson = await urlRes.json().catch(() => ({}));
        throw new Error(errorJson.error || "Failed to initialize Google login.");
      }

      const urlData = await urlRes.json();
      if (!urlData.success || !urlData.url) {
        throw new Error(urlData.error || "Google login service unavailable.");
      }

      // Step 2: Direct redirect on mobile devices for seamless mobile browser UX
      const isMobile =
        window.innerWidth < 640 ||
        /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

      if (isMobile) {
        window.location.href = urlData.url;
        return;
      }

      // Step 3: Open popup on desktop
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

      let isHandled = false;
      const popupOpenedAt = Date.now();

      // Multi-channel response listener: supports BroadcastChannel, localStorage events, and postMessage
      const channel =
        typeof BroadcastChannel !== "undefined"
          ? new BroadcastChannel("vastraa_google_oauth")
          : null;

      const cleanup = () => {
        if (channel) {
          channel.close();
        }
        window.removeEventListener("message", handleMessage);
        window.removeEventListener("storage", handleStorage);
        if (checkClosed) {
          clearInterval(checkClosed);
        }
        cleanupRef.current = null;
      };
      cleanupRef.current = cleanup;

      const processResponse = async (payload: {
        code?: string;
        token?: string;
        error?: string;
        state?: string;
      }) => {
        if (isHandled) return;
        isHandled = true;
        cleanup();

        if (popup && !popup.closed) {
          try {
            popup.close();
          } catch {
            /* ignore popup close errors */
          }
        }

        if (payload.error) {
          onError(payload.error || "Google authentication was cancelled.");
          setIsLoading(false);
          return;
        }

        if (payload.code || payload.token) {
          try {
            const callbackRes = await apiFetch("/api/auth/google/callback", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                code: payload.code,
                token: payload.token,
                role: targetRole,
                mode,
                state: payload.state,
                redirectUri,
              }),
            });

            const callbackData = await callbackRes.json().catch(() => ({}));
            if (!callbackRes.ok || !callbackData.success) {
              onError(callbackData.error || "Google authentication failed.");
            } else if (callbackData.token) {
              // Direct Google SSO success! Save token & redirect to Dashboard
              localStorage.setItem("vastraa_auth_token", callbackData.token);
              if (callbackData.user?.role === "seller") {
                localStorage.setItem("vastraa_seller_authenticated", "true");
                localStorage.setItem("vastraa_seller_email", callbackData.user?.email || "");
              } else {
                localStorage.removeItem("vastraa_seller_authenticated");
                localStorage.removeItem("vastraa_seller_email");
              }

              if (onSuccess) {
                onSuccess(callbackData);
              } else {
                window.location.href =
                  callbackData.redirectUrl ||
                  (callbackData.user?.role === "seller" ? "/seller/dashboard" : "/account/overview");
              }
            } else if (callbackData.requiresOtp && onSuccessChallenge) {
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
        } else {
          setIsLoading(false);
        }
      };

      // 1. BroadcastChannel listener
      if (channel) {
        channel.onmessage = (event) => {
          if (event.data?.type === "GOOGLE_OAUTH_RESPONSE") {
            processResponse(event.data);
          }
        };
      }

      // 2. Cross-window postMessage listener
      const handleMessage = (event: MessageEvent) => {
        if (event.origin !== window.location.origin) return;
        if (event.data?.type === "GOOGLE_OAUTH_RESPONSE") {
          processResponse(event.data);
        }
      };
      window.addEventListener("message", handleMessage);

      // 3. Storage event fallback for cross-origin or detached window openers
      const handleStorage = (event: StorageEvent) => {
        if (event.key === "vastraa_google_oauth_response" && event.newValue) {
          try {
            const parsed = JSON.parse(event.newValue);
            if (parsed && (parsed.code || parsed.token || parsed.error)) {
              localStorage.removeItem("vastraa_google_oauth_response");
              processResponse(parsed);
            }
          } catch {
            /* ignore JSON parse errors */
          }
        }
      };
      window.addEventListener("storage", handleStorage);

      // Check if popup was closed manually by user without completing login
      const checkClosed = setInterval(() => {
        if (popup.closed) {
          clearInterval(checkClosed);
          // Only stop loading if it wasn't already handled and at least 2.5s passed
          setTimeout(() => {
            if (!isHandled) {
              cleanup();
              if (Date.now() - popupOpenedAt >= 2500) {
                setIsLoading(false);
              }
            }
          }, 600);
        }
      }, 800);
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
