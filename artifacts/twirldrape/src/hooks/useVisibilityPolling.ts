import { useEffect, useRef } from "react";

/**
 * Polls `fn` at `intervalMs` intervals, but pauses while the browser tab is
 * hidden and immediately re-runs `fn` the moment the tab becomes visible again.
 *
 * @param fn          The function to call on each poll tick and on re-focus.
 * @param intervalMs  How often (ms) to poll while the tab is visible.
 * @param options
 *   fireOnMount  Whether to call `fn` immediately on mount (default: true).
 *                Pass `false` when the caller already performs an initial fetch
 *                so that no double-request fires on mount.
 */
export function useVisibilityPolling(
  fn: () => void,
  intervalMs: number,
  options: { fireOnMount?: boolean } = {},
): void {
  const { fireOnMount = true } = options;

  // Keep a ref so the interval callback always calls the latest version of `fn`
  // without requiring the effect to re-run every time `fn` changes.
  const fnRef = useRef(fn);
  fnRef.current = fn;

  useEffect(() => {
    let timerId: ReturnType<typeof setInterval> | null = null;

    function startInterval() {
      if (timerId !== null) clearInterval(timerId);
      timerId = setInterval(() => fnRef.current(), intervalMs);
    }

    function stopInterval() {
      if (timerId !== null) {
        clearInterval(timerId);
        timerId = null;
      }
    }

    function handleVisibilityChange() {
      if (document.visibilityState === "hidden") {
        stopInterval();
      } else {
        // Tab is visible again — fetch immediately, then resume polling.
        fnRef.current();
        startInterval();
      }
    }

    // Initial setup (only start polling if the tab is already visible).
    if (document.visibilityState !== "hidden") {
      if (fireOnMount) fnRef.current();
      startInterval();
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      stopInterval();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  // intervalMs and fireOnMount are the real structural deps; fn is via ref.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intervalMs, fireOnMount]);
}
