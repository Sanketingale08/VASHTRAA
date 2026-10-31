import { useEffect, useRef } from "react";
import { useLocation } from "wouter";

// Session storage key for scroll positions across page refreshes
const STORAGE_KEY = "vastraa_scroll_positions";

// In-memory cache of scroll positions mapped by history state key
const scrollPositions = new Map<string, { x: number; y: number }>();

// Read initial positions from sessionStorage if available
try {
  if (typeof window !== "undefined" && window.sessionStorage) {
    const saved = sessionStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      Object.entries(parsed).forEach(([key, val]) => {
        if (val && typeof val === "object") {
          scrollPositions.set(key, val as { x: number; y: number });
        }
      });
    }
  }
} catch (e) {
  // ignore quota / parse errors
}

function savePositionsToSession() {
  try {
    if (typeof window !== "undefined" && window.sessionStorage) {
      const obj: Record<string, { x: number; y: number }> = {};
      scrollPositions.forEach((val, key) => {
        obj[key] = val;
      });
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
    }
  } catch (e) {
    // ignore
  }
}

// Global flag tracking if the navigation was triggered by browser Back/Forward (popstate)
let isPopState = false;

if (typeof window !== "undefined") {
  // 1. Configure browser to manual scroll restoration
  if ("scrollRestoration" in window.history) {
    window.history.scrollRestoration = "manual";
  }

  // 2. Listen for popstate (browser back/forward button clicks)
  window.addEventListener("popstate", () => {
    isPopState = true;
  });

  // 3. Monkey-patch pushState & replaceState to ensure every history entry gets a unique __scrollKey
  const originalPushState = window.history.pushState;
  window.history.pushState = function (state, title, url) {
    const newState = state && typeof state === "object" ? { ...state } : {};
    if (!newState.__scrollKey) {
      newState.__scrollKey = Math.random().toString(36).substring(2, 9) + "-" + Date.now();
    }
    return originalPushState.call(this, newState, title, url);
  };

  const originalReplaceState = window.history.replaceState;
  window.history.replaceState = function (state, title, url) {
    const newState = state && typeof state === "object" ? { ...state } : {};
    if (!newState.__scrollKey) {
      newState.__scrollKey =
        window.history.state?.__scrollKey ||
        Math.random().toString(36).substring(2, 9) + "-" + Date.now();
    }
    return originalReplaceState.call(this, newState, title, url);
  };

  // Ensure current history entry has a __scrollKey on initial load
  if (!window.history.state || typeof window.history.state !== "object" || !window.history.state.__scrollKey) {
    const key = Math.random().toString(36).substring(2, 9) + "-" + Date.now();
    try {
      window.history.replaceState({ ...(window.history.state || {}), __scrollKey: key }, "");
    } catch (e) {
      // ignore
    }
  }
}

export function ScrollToTop() {
  const [location] = useLocation();
  const currentKeyRef = useRef<string | null>(null);

  // Continuously record scroll position for current history key
  useEffect(() => {
    const getKey = () => {
      const stateKey = window.history.state?.__scrollKey;
      return stateKey || location;
    };

    const currentKey = getKey();
    currentKeyRef.current = currentKey;

    const handleScroll = () => {
      if (currentKeyRef.current) {
        scrollPositions.set(currentKeyRef.current, {
          x: window.scrollX || window.pageXOffset || 0,
          y: window.scrollY || window.pageYOffset || 0,
        });
      }
    };

    // Save scroll on scroll event & before unload
    window.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("beforeunload", savePositionsToSession);

    return () => {
      // Save current scroll position when location changes or unmounts
      handleScroll();
      window.removeEventListener("scroll", handleScroll);
      window.removeEventListener("beforeunload", savePositionsToSession);
    };
  }, [location]);

  // Handle scrolling when location changes
  useEffect(() => {
    const stateKey = window.history.state?.__scrollKey || location;

    if (isPopState) {
      // BROWSER BACK / FORWARD NAVIGATION
      isPopState = false; // Reset flag for next navigation

      const savedPosition = scrollPositions.get(stateKey) || { x: 0, y: 0 };

      // Perform scroll restoration with multi-frame attempt to handle dynamic / async page layouts
      const scrollToSaved = () => {
        window.scrollTo({
          top: savedPosition.y,
          left: savedPosition.x,
          behavior: "instant" as ScrollBehavior,
        });
        document.documentElement.scrollTop = savedPosition.y;
        document.body.scrollTop = savedPosition.y;
      };

      scrollToSaved();
      // Retry after RAF and short timeout to account for async data loading or component mounts
      const raf1 = requestAnimationFrame(scrollToSaved);
      const timeoutId = setTimeout(scrollToSaved, 50);

      return () => {
        cancelAnimationFrame(raf1);
        clearTimeout(timeoutId);
      };
    } else {
      // NEW PAGE NAVIGATION (Clicking a link / setLocation)
      // Check for anchor hash links
      if (window.location.hash) {
        const targetId = window.location.hash.substring(1);
        const elem = document.getElementById(targetId);
        if (elem) {
          elem.scrollIntoView();
          return;
        }
      }

      const scrollToTop = () => {
        window.scrollTo({
          top: 0,
          left: 0,
          behavior: "instant" as ScrollBehavior,
        });
        document.documentElement.scrollTop = 0;
        document.body.scrollTop = 0;
      };

      scrollToTop();
      // Ensure top scroll stays at 0 across initial render frames
      const raf1 = requestAnimationFrame(scrollToTop);
      const timeoutId = setTimeout(scrollToTop, 50);

      return () => {
        cancelAnimationFrame(raf1);
        clearTimeout(timeoutId);
      };
    }
  }, [location]);

  return null;
}
