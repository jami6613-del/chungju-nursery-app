import { useCallback, useEffect, useRef } from "react";

/**
 * 모바일에서 overflow 스크롤이 동작하지 않을 때 터치로 수동 스크롤하는 fallback
 */
export function useTouchScroll<T extends HTMLElement>(ref: React.RefObject<T | null>): void {
  const lastY = useRef(0);
  const lastX = useRef(0);

  const onTouchStart = useCallback((e: TouchEvent) => {
    if (e.touches.length === 1) {
      lastY.current = e.touches[0].clientY;
      lastX.current = e.touches[0].clientX;
    }
  }, []);

  const onTouchMove = useCallback((e: TouchEvent) => {
    const el = ref.current;
    if (!el || e.touches.length !== 1) return;

    const y = e.touches[0].clientY;
    const x = e.touches[0].clientX;
    const dy = lastY.current - y;
    const dx = lastX.current - x;
    lastY.current = y;
    lastX.current = x;

    const canScrollY = el.scrollHeight > el.clientHeight;
    const canScrollX = el.scrollWidth > el.clientWidth;

    if (canScrollY || canScrollX) {
      if (Math.abs(dy) >= Math.abs(dx) && canScrollY) {
        el.scrollTop += dy;
        e.preventDefault();
      } else if (Math.abs(dx) > Math.abs(dy) && canScrollX) {
        el.scrollLeft += dx;
        e.preventDefault();
      }
    }
  }, [ref]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
    };
  }, [ref, onTouchStart, onTouchMove]);
}
