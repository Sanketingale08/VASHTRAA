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
    // Auto-refresh/polling disabled across Admin Portal.
    if (fireOnMount) {
      fnRef.current();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fireOnMount]);
}
