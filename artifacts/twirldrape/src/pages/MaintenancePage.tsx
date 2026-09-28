/**
 * MaintenancePage — shown to shoppers when maintenance mode is active.
 *
 * Admin paths (/admin/*) bypass this entirely (handled in MaintenanceGuard).
 * The page auto-polls /api/settings/maintenance-status every 15 s and
 * reloads when the site comes back up.
 */
import { useEffect } from "react";

const GOLD = "#C7CCD1";
const NAVY = "#0D1B36";

export default function MaintenancePage() {
  // Poll every 15 s and reload when maintenance ends
  useEffect(() => {
    const id = setInterval(async () => {
      try {
        const r = await fetch("/api/settings/maintenance-status");
        if (r.ok) {
          const { maintenance } = await r.json();
          if (!maintenance) window.location.reload();
        }
      } catch {
        // ignore network errors — keep polling
      }
    }, 15_000);
    return () => clearInterval(id);
  }, []);

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-6"
      style={{ background: NAVY }}
    >
      {/* Logo mark */}
      <div
        className="w-20 h-20 rounded-3xl flex items-center justify-center mb-8 shadow-2xl"
        style={{ background: "rgba(199,204,209,0.15)", border: "1px solid rgba(199,204,209,0.3)" }}
      >
        <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
          <path
            d="M20 4C20 4 8 10 8 22C8 28.627 13.373 34 20 34C26.627 34 32 28.627 32 22C32 10 20 4 20 4Z"
            fill={GOLD}
            fillOpacity="0.9"
          />
          <path
            d="M20 12C20 12 14 16 14 22C14 25.314 16.686 28 20 28C23.314 28 26 25.314 26 22C26 16 20 12 20 12Z"
            fill={NAVY}
            fillOpacity="0.8"
          />
        </svg>
      </div>

      {/* Wordmark */}
      <p
        className="text-sm tracking-[0.35em] uppercase font-medium mb-2"
        style={{ color: GOLD }}
      >
        VASTRAA
      </p>

      {/* Headline */}
      <h1
        className="text-3xl sm:text-4xl font-bold text-center mb-4 leading-tight"
        style={{ color: "#F5F0E8" }}
      >
        Back Soon
      </h1>

      {/* Sub-copy */}
      <p
        className="text-center max-w-sm leading-relaxed mb-10"
        style={{ color: "rgba(245,240,232,0.6)", fontSize: "0.95rem" }}
      >
        We're doing a bit of maintenance to make VASTRAA even better.
        The site will be back up shortly — thank you for your patience.
      </p>

      {/* Live indicator */}
      <div
        className="flex items-center gap-2 px-4 py-2 rounded-full"
        style={{ background: "rgba(199,204,209,0.1)", border: "1px solid rgba(199,204,209,0.2)" }}
      >
        <span
          className="w-2 h-2 rounded-full animate-pulse"
          style={{ background: GOLD }}
        />
        <span className="text-xs font-medium" style={{ color: GOLD }}>
          Checking for updates every 15 seconds…
        </span>
      </div>

      {/* Fine print */}
      <p
        className="mt-12 text-xs text-center"
        style={{ color: "rgba(245,240,232,0.3)" }}
      >
        If you need immediate assistance, please contact our support team.
      </p>
    </div>
  );
}
