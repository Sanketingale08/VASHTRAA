import React from "react";
import { AnnouncementBar } from "./AnnouncementBar";
import { Navbar } from "./Navbar";
import { NewsletterSection } from "./NewsletterSection";
import { Footer } from "./Footer";

interface LayoutProps {
  children: React.ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const [location] = useLocation();

  return (
    <div className="min-h-screen flex flex-col font-sans">
      <AnnouncementBar />
      <Navbar />
      <main className="flex-grow">
        {children}
      </main>
      <NewsletterSection />
      <Footer />
    </div>
  );
}
