import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles } from "lucide-react";

interface IntroScreenProps {
  /** If true, forces the intro screen to display regardless of any internal state */
  forceShow?: boolean;
  /** Callback fired after the intro screen has completed and dissolved */
  onFinish?: () => void;
  /** Total animation duration before auto-dissolving in milliseconds (default: 2300) */
  durationMs?: number;
}

const STORAGE_KEY = "vastraa_intro_seen";

export const IntroScreen: React.FC<IntroScreenProps> = ({
  forceShow = false,
  onFinish,
  durationMs = 2300,
}) => {
  // Appears every time user or seller opens or refreshes the browser tab
  const [isVisible, setIsVisible] = useState<boolean>(true);
  const [progress, setProgress] = useState(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  // Sync forceShow prop if toggled dynamically
  useEffect(() => {
    if (forceShow) {
      setIsVisible(true);
    }
  }, [forceShow]);

  // Robust asset base path resolution
  const baseUrl = (typeof import.meta !== "undefined" && import.meta.env?.BASE_URL) || "/";
  const cleanBase = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
  const logoSrc = `${cleanBase}/logo.svg`;
  const fallbackSrc = `${cleanBase}/images/logo.svg`;
  const fallbackPng = `${cleanBase}/logo.png`;

  // Check prefers-reduced-motion
  useEffect(() => {
    if (typeof window !== "undefined" && window.matchMedia) {
      const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
      if (motionQuery.matches && !forceShow) {
        handleDismiss();
      }
    }
  }, [forceShow]);

  // Handle smooth progress bar and auto-dissolve
  useEffect(() => {
    if (!isVisible) return;

    const startTime = performance.now();
    const updateProgress = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const calculated = Math.min((elapsed / (durationMs - 200)) * 100, 100);
      setProgress(calculated);

      if (elapsed < durationMs - 150) {
        animationFrameRef.current = requestAnimationFrame(updateProgress);
      } else {
        setProgress(100);
      }
    };

    animationFrameRef.current = requestAnimationFrame(updateProgress);

    timerRef.current = setTimeout(() => {
      handleDismiss();
    }, durationMs);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    };
  }, [isVisible, durationMs]);

  const handleDismiss = () => {
    try {
      if (typeof window !== "undefined" && window.sessionStorage) {
        window.sessionStorage.setItem(STORAGE_KEY, "true");
      }
    } catch {
      // Storage error ignored
    }
    setIsVisible(false);
    if (onFinish) onFinish();
  };

  return (
    <AnimatePresence
      onExitComplete={() => {
        if (onFinish) onFinish();
      }}
    >
      {isVisible && (
        <motion.aside
          data-testid="vastraa-intro-screen"
          aria-label="VASTRAA Welcome"
          aria-live="polite"
          initial={{ opacity: 1 }}
          exit={{
            opacity: 0,
            scale: 1.04,
            filter: "blur(10px)",
            transition: { duration: 0.7, ease: [0.22, 1, 0.36, 1] },
          }}
          className="fixed inset-0 z-[99999] flex flex-col items-center justify-center overflow-hidden bg-gradient-to-b from-[#0A1F44] via-[#0E2756] to-[#050D1C] text-white selection:bg-[#D4AF37]/30 select-none"
        >
          {/* Subtle Rotating Sacred Loom / Zari Geometric Mandala Rings */}
          <motion.div
            initial={{ rotate: 0, opacity: 0 }}
            animate={{ rotate: 360, opacity: 0.18 }}
            transition={{
              rotate: { duration: 50, repeat: Infinity, ease: "linear" },
              opacity: { duration: 1.2 },
            }}
            className="absolute w-[560px] sm:w-[720px] h-[560px] sm:h-[720px] rounded-full border border-dashed border-[#D4AF37]/30 pointer-events-none"
          />
          <motion.div
            initial={{ rotate: 360, opacity: 0 }}
            animate={{ rotate: 0, opacity: 0.12 }}
            transition={{
              rotate: { duration: 40, repeat: Infinity, ease: "linear" },
              opacity: { duration: 1.2 },
            }}
            className="absolute w-[440px] sm:w-[580px] h-[440px] sm:h-[580px] rounded-full border border-dotted border-[#C7CCD1]/40 pointer-events-none"
          />

          {/* Deep Royal Midnight Ambient Halo */}
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: [0.95, 1.08, 0.95] }}
            transition={{
              opacity: { duration: 1 },
              scale: { duration: 4.5, repeat: Infinity, ease: "easeInOut" },
            }}
            className="absolute w-[480px] sm:w-[640px] h-[480px] sm:h-[640px] rounded-full bg-gradient-to-r from-[#2C3E6B]/30 via-[#D4AF37]/18 to-[#0A1F44]/40 blur-[100px] pointer-events-none"
          />

          {/* Royal Paithani Double Border Framing */}
          <div className="absolute inset-4 sm:inset-8 border border-[#D4AF37]/20 rounded-3xl pointer-events-none">
            <div className="absolute inset-1.5 border border-[#C7CCD1]/10 rounded-[22px]" />
            {/* Corner Filigree Motifs */}
            <div className="absolute top-0 left-0 w-8 h-8 border-t-2 border-l-2 border-[#D4AF37]/50 rounded-tl-xl" />
            <div className="absolute top-0 right-0 w-8 h-8 border-t-2 border-r-2 border-[#D4AF37]/50 rounded-tr-xl" />
            <div className="absolute bottom-0 left-0 w-8 h-8 border-b-2 border-l-2 border-[#D4AF37]/50 rounded-bl-xl" />
            <div className="absolute bottom-0 right-0 w-8 h-8 border-b-2 border-r-2 border-[#D4AF37]/50 rounded-br-xl" />
          </div>

          {/* Central Logo & Brand Showcase */}
          <div className="relative z-10 flex flex-col items-center px-4 max-w-lg text-center">
            {/* VASTRAA Logo Main Highlight with Clean White Background */}
            <motion.div
              initial={{ opacity: 0, scale: 0.84, y: 20 }}
              animate={{
                opacity: 1,
                scale: 1,
                y: [0, -4, 0],
              }}
              transition={{
                opacity: { duration: 0.9, ease: [0.16, 1, 0.3, 1] },
                scale: { duration: 0.9, ease: [0.16, 1, 0.3, 1] },
                y: { duration: 3.5, repeat: Infinity, ease: "easeInOut", delay: 0.9 },
              }}
              className="relative px-6 py-4 sm:px-9 sm:py-5 rounded-2xl sm:rounded-3xl bg-white border-2 border-[#D4AF37]/55 shadow-[0_25px_60px_-12px_rgba(5,13,28,0.7),0_0_35px_rgba(212,175,55,0.35)] ring-4 ring-[#D4AF37]/15 overflow-hidden"
            >
              <img
                data-testid="vastraa-intro-logo"
                src={logoSrc}
                alt="VASTRAA"
                className="h-14 sm:h-20 w-auto max-w-[280px] sm:max-w-[340px] object-contain drop-shadow-[0_2px_8px_rgba(10,31,68,0.15)]"
                onError={(e) => {
                  const target = e.target as HTMLImageElement;
                  if (target.src !== fallbackSrc && target.src !== fallbackPng) {
                    target.src = fallbackSrc;
                  } else if (target.src === fallbackSrc) {
                    target.src = fallbackPng;
                  }
                }}
              />

              {/* Liquid Zari Light-Beam Sweep Across the White Logo Surface */}
              <motion.div
                initial={{ x: "-160%" }}
                animate={{ x: "240%" }}
                transition={{
                  repeat: Infinity,
                  duration: 2.4,
                  ease: "easeInOut",
                  repeatDelay: 0.6,
                }}
                className="absolute inset-y-0 w-32 bg-gradient-to-r from-transparent via-amber-200/40 via-white/80 to-transparent pointer-events-none transform -skew-x-12"
              />
            </motion.div>

            {/* Brand Title with Harmonious Gold & Platinum Palette */}
            <motion.div
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.28, duration: 0.85, ease: [0.16, 1, 0.3, 1] }}
              className="mt-6 sm:mt-7 flex flex-col items-center"
            >
              <h1 className="font-serif text-3xl sm:text-4xl lg:text-[42px] font-bold tracking-[0.24em] uppercase bg-gradient-to-r from-[#FFF5D9] via-[#D4AF37] to-[#E3C578] bg-clip-text text-transparent drop-shadow-md">
                VASTRAA
              </h1>

              {/* Subtitle with Diamond Accent Motifs */}
              <div className="mt-2.5 flex items-center gap-2 sm:gap-2.5">
                <span className="h-[1px] w-6 sm:w-12 bg-gradient-to-r from-transparent to-[#D4AF37]/70" />
                <span className="text-[#D4AF37] text-[10px]">◆</span>
                <span className="text-[#E5E8EC] font-sans text-[11px] sm:text-xs font-semibold tracking-[0.28em] uppercase drop-shadow-xs">
                  Royal Paithani &amp; Designer Sarees
                </span>
                <span className="text-[#D4AF37] text-[10px]">◆</span>
                <span className="h-[1px] w-6 sm:w-12 bg-gradient-to-l from-transparent to-[#D4AF37]/70" />
              </div>

              {/* Heritage Master Weavers Badge */}
              <motion.div
                initial={{ opacity: 0, scale: 0.92 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.48, duration: 0.65 }}
                className="mt-3.5 inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full bg-[#D4AF37]/12 border border-[#D4AF37]/30 text-[#FFF2D1] text-[10px] sm:text-[11px] font-sans tracking-wider shadow-xs"
              >
                <Sparkles className="w-3 h-3 text-[#D4AF37]" />
                <span>Handcrafted by Master Weavers of India</span>
                <Sparkles className="w-3 h-3 text-[#D4AF37]" />
              </motion.div>
            </motion.div>

            {/* Symmetrical Handloom Zari Thread Progress Line */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.42, duration: 0.7 }}
              className="mt-8 sm:mt-9 flex flex-col items-center w-full"
            >
              <div
                data-testid="vastraa-intro-progress"
                className="relative h-[2px] w-48 sm:w-64 bg-white/10 rounded-full overflow-hidden"
              >
                <motion.div
                  className="h-full bg-gradient-to-r from-[#2C3E6B] via-[#D4AF37] to-[#FFF3D6] rounded-full shadow-[0_0_10px_rgba(212,175,55,0.8)]"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </motion.div>
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
};

export default IntroScreen;
