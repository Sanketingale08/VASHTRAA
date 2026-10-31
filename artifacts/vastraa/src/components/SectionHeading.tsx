import React from "react";

interface SectionHeadingProps {
  title: string;
  subtitle?: string;
  centered?: boolean;
}

export function SectionHeading({ title, subtitle, centered = true }: SectionHeadingProps) {
  return (
    <div className={`mb-12 ${centered ? "text-center" : ""}`}>
      {subtitle && (
        <p className="text-[#C7CCD1] uppercase tracking-[0.2em] text-xs md:text-sm font-semibold mb-3">
          {subtitle}
        </p>
      )}
      <div className={`flex items-center gap-4 ${centered ? "justify-center" : ""}`}>
        {centered && <div className="h-px w-12 md:w-24 bg-gradient-to-r from-transparent to-[#C7CCD1]"></div>}
        <h2 className="font-serif text-3xl md:text-4xl text-[#0A1F44] dark:text-[#F4F5F7] font-bold">
          {title}
        </h2>
        {centered && <div className="h-px w-12 md:w-24 bg-gradient-to-l from-transparent to-[#C7CCD1]"></div>}
      </div>
      
      {/* Decorative ornament */}
      {centered && (
        <div className="flex justify-center mt-4">
          <svg width="40" height="10" viewBox="0 0 40 10" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M20 0L24 5L20 10L16 5L20 0Z" fill="#C7CCD1"/>
            <circle cx="8" cy="5" r="1.5" fill="#C7CCD1"/>
            <circle cx="32" cy="5" r="1.5" fill="#C7CCD1"/>
            <line x1="0" y1="5" x2="5" y2="5" stroke="#C7CCD1" strokeWidth="0.5"/>
            <line x1="35" y1="5" x2="40" y2="5" stroke="#C7CCD1" strokeWidth="0.5"/>
          </svg>
        </div>
      )}
    </div>
  );
}
