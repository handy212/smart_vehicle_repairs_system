"use client";

import { useEffect, useRef } from "react";

/**
 * Simple pull-to-refresh for mobile list pages.
 * Calls onRefresh when user pulls down from the top of the page.
 */
export function usePullToRefresh(onRefresh: () => void | Promise<void>) {
  const startY = useRef(0);
  const pulling = useRef(false);
  const onRefreshRef = useRef(onRefresh);

  useEffect(() => {
    onRefreshRef.current = onRefresh;
  }, [onRefresh]);

  useEffect(() => {
    const threshold = 80;

    const onTouchStart = (e: TouchEvent) => {
      if (window.scrollY <= 0) {
        startY.current = e.touches[0].clientY;
        pulling.current = true;
      } else {
        pulling.current = false;
      }
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (!pulling.current) return;
      const delta = e.changedTouches[0].clientY - startY.current;
      if (delta > threshold && window.scrollY <= 0) {
        void onRefreshRef.current();
      }
      pulling.current = false;
    };

    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchend", onTouchEnd, { passive: true });
    return () => {
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchend", onTouchEnd);
    };
  }, []);
}
