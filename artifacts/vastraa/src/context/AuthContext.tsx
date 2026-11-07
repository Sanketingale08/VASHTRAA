import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { useUser as useClerkUser, useClerk } from "@clerk/react";
import { apiFetch } from "@/lib/api";

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: "customer" | "seller" | "super_admin";
  firstName?: string;
  lastName?: string;
  phone?: string;
  alternateMobile?: string;
  dateOfBirth?: string;
  gender?: string;
  language?: string;
  location?: string;
  imageUrl?: string;
  profilePicture?: string;
  avatar?: string;
  address?: string;
}

interface AuthContextType {
  user: AuthUser | null;
  isSignedIn: boolean;
  isLoading: boolean;
  isLoaded: boolean;
  signIn: (email: string, password: string) => Promise<{
    success: boolean;
    user?: AuthUser;
    error?: string;
    code?: string;
    isEmailVerified?: boolean;
    email?: string;
  }>;
  signUp: (name: string, email: string, password: string, confirmPassword: string, otp?: string) => Promise<{
    success: boolean;
    user?: AuthUser;
    error?: string;
    message?: string;
    requiresVerification?: boolean;
    email?: string;
  }>;
  signOut: () => Promise<void>;
  refreshUser: () => Promise<void>;
  updateUserLocally: (updated: Partial<AuthUser>) => void;
}

const AUTH_TOKEN_KEY = "vastraa_auth_token";

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const { user: clerkUser, isSignedIn: isClerkSignedIn } = useClerkUser();
  const { signOut: clerkSignOut } = useClerk();

  const updateUserLocally = useCallback((updated: Partial<AuthUser>) => {
    setUser((prev) => {
      if (!prev) return null;
      return { ...prev, ...updated };
    });
  }, []);

  // Load current user from API via token or session on startup & refresh
  const loadUser = useCallback(async () => {
    const token = localStorage.getItem(AUTH_TOKEN_KEY);

    if (!token) {
      if (isClerkSignedIn && clerkUser) {
        localStorage.setItem(AUTH_TOKEN_KEY, clerkUser.id);
        localStorage.setItem("clerk_user_id", clerkUser.id);
        const meta = (clerkUser.publicMetadata ?? {}) as Record<string, string>;
        setUser({
          id: clerkUser.id,
          name: clerkUser.fullName || clerkUser.firstName || "Customer",
          email: clerkUser.primaryEmailAddress?.emailAddress || "",
          role: "customer",
          firstName: clerkUser.firstName || "",
          lastName: clerkUser.lastName || "",
          phone: meta.phone || "",
          alternateMobile: meta.alternateMobile || "",
          dateOfBirth: meta.dateOfBirth || "",
          gender: meta.gender || "",
          location: meta.location || "",
          language: meta.language || "English",
          imageUrl: clerkUser.imageUrl,
        });
      } else {
        setUser(null);
      }
      setIsLoading(false);
      return;
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    };

    try {
      // 1. Try /api/auth/me with verified Bearer token
      const res = await apiFetch("/api/auth/me", { headers });
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        if (data?.user) {
          const nameParts = (data.user.name || "").split(" ");
          setUser({
            ...data.user,
            firstName: data.user.firstName || nameParts[0] || data.user.name || "Customer",
            lastName: data.user.lastName || nameParts.slice(1).join(" ") || "",
          });
          setIsLoading(false);
          return;
        }
      }

      // 2. Fallback try /api/account/profile with verified Bearer token
      const profileRes = await apiFetch("/api/account/profile", { headers });
      if (profileRes.ok) {
        const data = await profileRes.json().catch(() => ({}));
        if (data?.user) {
          const nameParts = (data.user.name || "").split(" ");
          setUser({
            ...data.user,
            firstName: data.user.firstName || nameParts[0] || data.user.name || "Customer",
            lastName: data.user.lastName || nameParts.slice(1).join(" ") || "",
          });
          setIsLoading(false);
          return;
        }
      }

      // If token is invalid or expired and cannot be refreshed, clear it
      localStorage.removeItem(AUTH_TOKEN_KEY);
      setUser(null);
    } catch {
      localStorage.removeItem(AUTH_TOKEN_KEY);
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, [clerkUser, isClerkSignedIn]);

  useEffect(() => {
    loadUser();
  }, [loadUser]);

  const signIn = async (email: string, password: string) => {
    setIsLoading(true);
    try {
      // Clean previous session keys to prevent any cross-account data bleed
      localStorage.removeItem(AUTH_TOKEN_KEY);
      localStorage.removeItem("vastraa_seller_email");
      localStorage.removeItem("vastraa_seller_authenticated");
      localStorage.removeItem("clerk_user_id");
      sessionStorage.clear();

      const res = await apiFetch("/api/auth/sign-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
      });

      let data: any = {};
      try {
        data = await res.json();
      } catch {
        // Fallback if response body is empty or non-JSON
      }

      if (!res.ok || !data.success) {
        setIsLoading(false);
        return {
          success: false,
          error: data.error || data.message || "Invalid email or password.",
          code: data.code,
          isEmailVerified: data.isEmailVerified,
          email: data.email || email.trim(),
        };
      }

      if (data.token) {
        localStorage.setItem(AUTH_TOKEN_KEY, data.token);
      }
      await loadUser();
      setIsLoading(false);
      return { success: true, user: data.user };
    } catch (err: any) {
      console.error("[AuthContext] Sign in error:", err);
      setIsLoading(false);
      return { success: false, error: "Unable to connect to server. Please try again." };
    }
  };

  const signUp = async (name: string, email: string, password: string, confirmPassword: string, otp?: string) => {
    setIsLoading(true);
    try {
      // Clean previous session keys to ensure fresh account isolation
      localStorage.removeItem(AUTH_TOKEN_KEY);
      localStorage.removeItem("vastraa_seller_email");
      localStorage.removeItem("vastraa_seller_authenticated");
      localStorage.removeItem("clerk_user_id");
      sessionStorage.clear();

      const res = await apiFetch("/api/auth/sign-up", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), email: email.trim(), password, confirmPassword, otp: otp?.trim() }),
      });

      let data: any = {};
      try {
        data = await res.json();
      } catch {
        // Fallback if response body is empty or non-JSON
      }

      if (!res.ok || !data.success) {
        setIsLoading(false);
        return { success: false, error: data.error || data.message || "Unable to create account. Please try again." };
      }

      if (data.token) {
        localStorage.setItem(AUTH_TOKEN_KEY, data.token);
        await loadUser();
      }
      setIsLoading(false);
      return {
        success: true,
        user: data.user,
        message: data.message,
        requiresVerification: Boolean(data.requiresVerification),
        email: data.email || email.trim(),
      };
    } catch (err: any) {
      console.error("[AuthContext] Sign up error:", err);
      setIsLoading(false);
      return { success: false, error: "Unable to connect to server. Please try again." };
    }
  };

  const signOut = async () => {
    setIsLoading(true);
    const token = localStorage.getItem(AUTH_TOKEN_KEY);
    if (token) {
      try {
        await apiFetch("/api/auth/sign-out", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        });
      } catch {
        // Ignore signout fetch errors
      }
    }
    // Fully clear all local tokens and session caches
    localStorage.removeItem(AUTH_TOKEN_KEY);
    localStorage.removeItem("vastraa_seller_email");
    localStorage.removeItem("vastraa_seller_authenticated");
    localStorage.removeItem("clerk_user_id");
    localStorage.removeItem("twirl_cart");
    sessionStorage.clear();
    window.dispatchEvent(new CustomEvent("vastraa-auth-changed", { detail: { action: "signout" } }));
    setUser(null);
    if (isClerkSignedIn) {
      try { await clerkSignOut(); } catch { /* Ignore */ }
    }
    setIsLoading(false);
  };

  const value: AuthContextType = {
    user,
    isSignedIn: !!user,
    isLoading,
    isLoaded: !isLoading,
    signIn,
    signUp,
    signOut,
    refreshUser: loadUser,
    updateUserLocally,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
