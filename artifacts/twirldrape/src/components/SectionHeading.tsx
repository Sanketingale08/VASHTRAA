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
        <p className="text-[#C9A84C] uppercase tracking-[0.2em] text-xs md:text-sm font-semibold mb-3">
          {subtitle}
        </p>
      )}
      <div className={`flex items-center gap-4 ${centered ? "justify-center" : ""}`}>
        {centered && <div className="h-px w-12 md:w-24 bg-gradient-to-r from-transparent to-[#C9A84C]"></div>}
        <h2 className="font-serif text-3xl md:text-4xl text-[#1E6B5A] dark:text-[#F3F8F5] font-bold">
          {title}
        </h2>
        {centered && <div className="h-px w-12 md:w-24 bg-gradient-to-l from-transparent to-[#C9A84C]"></div>}
      </div>
      
      {/* Decorative ornament */}
      {centered && (
        <div className="flex justify-center mt-4">
          <svg width="40" height="10" viewBox="0 0 40 10" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M20 0L24 5L20 10L16 5L20 0Z" fill="#C9A84C"/>
            <circle cx="8" cy="5" r="1.5" fill="#C9A84C"/>
            <circle cx="32" cy="5" r="1.5" fill="#C9A84C"/>
            <line x1="0" y1="5" x2="5" y2="5" stroke="#C9A84C" strokeWidth="0.5"/>
            <line x1="35" y1="5" x2="40" y2="5" stroke="#C9A84C" strokeWidth="0.5"/>
          </svg>
        </div>
      )}
    </div>
  );
}
