import { useCallback, useEffect, useRef } from "react";

const FRICTION = 0.97;
const MIN_VELOCITY = 0.03;
const HORIZONTAL_SCROLL_MULTIPLIER = 2.2;
const MOMENTUM_BOOST_BASE = 1.2;
const MOMENTUM_BOOST_PER_VELOCITY = 0.15;

/**
 * 모바일에서 overflow 스크롤이 동작하지 않을 때 터치로 수동 스크롤 + 관성(모멘텀) fallback
 * 스와이프 강도에 따라 속도·거리 비례 (강하게 → 빨리·많이, 살살 → 천천히·조금)
 */
export function useTouchScroll<T extends HTMLElement>(ref: React.RefObject<T | null>): void {
  const lastY = useRef(0);
  const lastX = useRef(0);
  const lastTime = useRef(0);
  const velY = useRef(0);
  const velX = useRef(0);
  const rafId = useRef<number | null>(null);

  const onTouchStart = useCallback((e: TouchEvent) => {
    if (e.touches.length === 1) {
      lastY.current = e.touches[0].clientY;
      lastX.current = e.touches[0].clientX;
      lastTime.current = performance.now();
      velY.current = 0;
      velX.current = 0;
      if (rafId.current != null) {
        cancelAnimationFrame(rafId.current);
        rafId.current = null;
      }
    }
  }, []);

  const onTouchMove = useCallback((e: TouchEvent) => {
    const el = ref.current;
    if (!el || e.touches.length !== 1) return;

    const now = performance.now();
    const dt = Math.min(now - lastTime.current, 50);
    const y = e.touches[0].clientY;
    const x = e.touches[0].clientX;
    const dy = lastY.current - y;
    const dx = lastX.current - x;
    lastY.current = y;
    lastX.current = x;
    lastTime.current = now;

    if (dt > 0) {
      velY.current = dy / dt;
      velX.current = (dx / dt) * HORIZONTAL_SCROLL_MULTIPLIER;
    }

    const canScrollY = el.scrollHeight > el.clientHeight;
    const canScrollX = el.scrollWidth > el.clientWidth;

    if (canScrollY || canScrollX) {
      if (Math.abs(dy) >= Math.abs(dx) && canScrollY) {
        el.scrollTop += dy;
        e.preventDefault();
      } else if (Math.abs(dx) > Math.abs(dy) && canScrollX) {
        el.scrollLeft += dx * HORIZONTAL_SCROLL_MULTIPLIER;
        e.preventDefault();
      }
    }
  }, [ref]);

  const onTouchEnd = useCallback(() => {
    const el = ref.current;
    if (!el) return;

    let vY = velY.current;
    let vX = velX.current;
    if (Math.abs(vY) < MIN_VELOCITY && Math.abs(vX) < MIN_VELOCITY) return;

    const canScrollY = el.scrollHeight > el.clientHeight;
    const canScrollX = el.scrollWidth > el.clientWidth;
    if (!canScrollY && !canScrollX) return;

    const magY = Math.abs(vY);
    const magX = Math.abs(vX);
    const boostY = MOMENTUM_BOOST_BASE + Math.min(magY * MOMENTUM_BOOST_PER_VELOCITY, 2.5);
    const boostX = MOMENTUM_BOOST_BASE + Math.min(magX * MOMENTUM_BOOST_PER_VELOCITY, 2.5);
    vY *= boostY;
    vX *= boostX;

    let lastTime = performance.now();

    const run = (now: number) => {
      const target = ref.current;
      if (!target) return;
      const dt = Math.min(now - lastTime, 32);
      lastTime = now;

      const maxY = target.scrollHeight - target.clientHeight;
      const maxX = target.scrollWidth - target.clientWidth;

      if (canScrollY) target.scrollTop = Math.max(0, Math.min(maxY, target.scrollTop + vY * dt * 0.08));
      if (canScrollX) target.scrollLeft = Math.max(0, Math.min(maxX, target.scrollLeft + vX * dt * 0.08));

      const decay = Math.pow(FRICTION, dt / 16);
      vY *= decay;
      vX *= decay;

      if (Math.abs(vY) >= MIN_VELOCITY || Math.abs(vX) >= MIN_VELOCITY) {
        rafId.current = requestAnimationFrame(run);
      } else {
        rafId.current = null;
      }
    };
    rafId.current = requestAnimationFrame(run);
  }, [ref]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd, { passive: true });
    el.addEventListener("touchcancel", onTouchEnd, { passive: true });
    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("touchcancel", onTouchEnd);
      if (rafId.current != null) cancelAnimationFrame(rafId.current);
    };
  }, [ref, onTouchStart, onTouchMove, onTouchEnd]);
}
