import React from "react";
import { useLocation } from "wouter";
import { Navbar } from "./Navbar";
import { Footer } from "./Footer";

interface LayoutProps {
  children: React.ReactNode;
  hideFooter?: boolean;
}

const AUTH_ROUTES = [
  "/sign-in",
  "/sign-up",
  "/seller/login",
  "/seller/register",
  "/seller/signup",
  "/admin/login",
  "/admin/2fa-verify",
  "/google-callback",
];

function isAuthPage(location: string): boolean {
  const cleanPath = location.split("?")[0].split("#")[0].toLowerCase();
  return AUTH_ROUTES.some(
    (route) => cleanPath === route || cleanPath.startsWith(`${route}/`)
  );
}

export function Layout({ children, hideFooter }: LayoutProps) {
  const [location] = useLocation();
  const shouldHideFooter = hideFooter || isAuthPage(location);

  return (
    <div className="min-h-screen flex flex-col font-sans overflow-x-clip w-full bg-[#F4F5F7]">
      <Navbar />
      <main className="flex-1 flex flex-col w-full min-h-0">
        {children}
      </main>
      {!shouldHideFooter && <Footer />}
    </div>
  );
}

