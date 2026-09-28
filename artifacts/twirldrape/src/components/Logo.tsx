import React from "react";

interface LogoProps {
  className?: string;
  variant?: "default" | "dark" | "gold";
  height?: number | string;
  width?: number | string;
}

export const Logo: React.FC<LogoProps> = ({
  className = "h-12 md:h-16 w-auto object-contain",
  variant = "default",
}) => {
  // Use import.meta.env.BASE_URL for robust path resolution across subpaths and environments
  const baseUrl = import.meta.env.BASE_URL || "/";
  const cleanBase = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
  const logoSrc = `${cleanBase}/logo.svg`;
  const fallbackSrc = `${cleanBase}/images/logo.svg`;

  return (
    <div className={`inline-flex items-center justify-center ${variant === "dark" ? "brightness-110 contrast-125" : ""}`}>
      <img
        src={logoSrc}
        alt="VASTRAA — Paithani & Designer Sarees"
        className={className}
        onError={(e) => {
          const target = e.target as HTMLImageElement;
          if (target.src !== fallbackSrc) {
            target.src = fallbackSrc;
          }
        }}
      />
    </div>
  );
};

export default Logo;
