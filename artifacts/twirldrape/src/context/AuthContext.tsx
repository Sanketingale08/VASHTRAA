import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { useUser as useClerkUser, useClerk } from "@clerk/react";

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
  signIn: (email: string, password: string) => Promise<{ success: boolean; user?: AuthUser; error?: string }>;
  signUp: (name: string, email: string, password: string, confirmPassword: string) => Promise<{ success: boolean; user?: AuthUser; error?: string }>;
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
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    try {
      const res = await fetch("/api/account/profile", { headers, credentials: "include" });
      if (res.ok) {
        const data = await res.json();
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
    } catch { /* ignore fallback below */ }

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

    try {
      const res = await fetch("/api/auth/me", { headers });
      if (res.ok) {
        const data = await res.json();
        if (data?.user) {
          const nameParts = (data.user.name || "").split(" ");
          setUser({
            ...data.user,
            firstName: data.user.firstName || nameParts[0] || data.user.name || "Customer",
            lastName: data.user.lastName || nameParts.slice(1).join(" ") || "",
          });
        } else {
          localStorage.removeItem(AUTH_TOKEN_KEY);
          setUser(null);
        }
      } else {
        localStorage.removeItem(AUTH_TOKEN_KEY);
        setUser(null);
      }
    } catch {
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
      const res = await fetch("/api/auth/sign-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      let data: any = {};
      try {
        data = await res.json();
      } catch {
        // Fallback if response body is empty or non-JSON
      }

      if (!res.ok || !data.success) {
        setIsLoading(false);
        return { success: false, error: data.error || data.message || "Invalid email or password." };
      }

      localStorage.setItem(AUTH_TOKEN_KEY, data.token);
      await loadUser();
      setIsLoading(false);
      return { success: true, user: data.user };
    } catch (err: any) {
      console.error("[AuthContext] Sign in error:", err);
      setIsLoading(false);
      return { success: false, error: "Unable to connect to server. Please try again." };
    }
  };

  const signUp = async (name: string, email: string, password: string, confirmPassword: string) => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/auth/sign-up", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password, confirmPassword }),
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

      localStorage.setItem(AUTH_TOKEN_KEY, data.token);
      await loadUser();
      setIsLoading(false);
      return { success: true, user: data.user };
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
        await fetch("/api/auth/sign-out", {
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
    localStorage.removeItem(AUTH_TOKEN_KEY);
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
