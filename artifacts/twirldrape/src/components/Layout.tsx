import React from "react";
import { useLocation } from "wouter";
import { AnnouncementBar } from "./AnnouncementBar";
import { Navbar } from "./Navbar";
import { SectionSwitcher } from "./SectionSwitcher";
import { NewsletterSection } from "./NewsletterSection";
import { Footer } from "./Footer";

interface LayoutProps {
  children: React.ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const [location] = useLocation();
  const isHome = location === "/";

  return (
    <div className="min-h-screen flex flex-col font-sans">
      <AnnouncementBar />
      <Navbar />
      {!isHome && <SectionSwitcher />}
      <main className="flex-grow">
        {children}
      </main>
      <NewsletterSection />
      <Footer />
    </div>
  );
}
