import React from "react";

function distance(
  a: { clientX: number; clientY: number },
  b: { clientX: number; clientY: number },
): number {
  return Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY);
}

function midpoint(
  a: { clientX: number; clientY: number },
  b: { clientX: number; clientY: number },
): { x: number; y: number } {
  return { x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2 };
}

const MIN_SCALE = 1;
const MAX_SCALE = 3;
const DOUBLE_TAP_MS = 300;
const DOUBLE_TAP_MAX_DIST = 40;

/**
 * 자식 전체를 감싸서:
 * - 두 손가락 핀치 시 손가락 사이 중심을 기준으로 확대/축소 (손가락 떼어도 배율 유지)
 * - 줌인 상태에서 한 손가락 스와이프로 확대 화면 이동
 * - 화면 어디든 더블터치 시 원래 배율(1배)로 복귀
 */
export function PinchZoomWrapper({ children }: { children: React.ReactNode }) {
  const wrapperRef = React.useRef<HTMLDivElement>(null);
  const initialDistanceRef = React.useRef<number>(0);
  const initialScaleRef = React.useRef<number>(1);
  const initialTranslateXRef = React.useRef<number>(0);
  const initialTranslateYRef = React.useRef<number>(0);
  const pinchCenterXRef = React.useRef<number>(0);
  const pinchCenterYRef = React.useRef<number>(0);

  const [scale, setScale] = React.useState(1);
  const [translateX, setTranslateX] = React.useState(0);
  const [translateY, setTranslateY] = React.useState(0);
  const [transition, setTransition] = React.useState("none");

  const scaleRef = React.useRef(scale);
  const translateXRef = React.useRef(translateX);
  const translateYRef = React.useRef(translateY);
  React.useEffect(() => {
    scaleRef.current = scale;
    translateXRef.current = translateX;
    translateYRef.current = translateY;
  }, [scale, translateX, translateY]);

  const panStartXRef = React.useRef<number>(0);
  const panStartYRef = React.useRef<number>(0);
  const panStartTranslateXRef = React.useRef<number>(0);
  const panStartTranslateYRef = React.useRef<number>(0);

  const lastTapTimeRef = React.useRef<number>(0);
  const lastTapXRef = React.useRef<number>(0);
  const lastTapYRef = React.useRef<number>(0);

  const resetToIdentity = React.useCallback(() => {
    setTransition("transform 0.2s ease-out");
    setScale(1);
    setTranslateX(0);
    setTranslateY(0);
  }, []);

  React.useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;

    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        const rect = el.getBoundingClientRect();
        initialDistanceRef.current = distance(e.touches[0], e.touches[1]);
        initialScaleRef.current = scale;
        initialTranslateXRef.current = translateX;
        initialTranslateYRef.current = translateY;
        const center = midpoint(e.touches[0], e.touches[1]);
        pinchCenterXRef.current = center.x - rect.left;
        pinchCenterYRef.current = center.y - rect.top;
        setTransition("none");
      } else if (e.touches.length === 1) {
        const rect = el.getBoundingClientRect();
        const clientX = e.touches[0].clientX;
        const clientY = e.touches[0].clientY;
        const now = Date.now();
        if (
          now - lastTapTimeRef.current <= DOUBLE_TAP_MS &&
          Math.hypot(clientX - lastTapXRef.current, clientY - lastTapYRef.current) <= DOUBLE_TAP_MAX_DIST
        ) {
          e.preventDefault();
          resetToIdentity();
          lastTapTimeRef.current = 0;
          return;
        }
        lastTapTimeRef.current = now;
        lastTapXRef.current = clientX;
        lastTapYRef.current = clientY;
        if (scaleRef.current > MIN_SCALE) {
          panStartXRef.current = clientX - rect.left;
          panStartYRef.current = clientY - rect.top;
          panStartTranslateXRef.current = translateXRef.current;
          panStartTranslateYRef.current = translateYRef.current;
        }
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 1 && scaleRef.current > MIN_SCALE) {
        e.preventDefault();
        const rect = el.getBoundingClientRect();
        const currentX = e.touches[0].clientX - rect.left;
        const currentY = e.touches[0].clientY - rect.top;
        const dx = currentX - panStartXRef.current;
        const dy = currentY - panStartYRef.current;
        setTranslateX(panStartTranslateXRef.current + dx);
        setTranslateY(panStartTranslateYRef.current + dy);
        return;
      }
      if (e.touches.length !== 2) return;
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const d = distance(e.touches[0], e.touches[1]);
      const s0 = initialScaleRef.current;
      const t0x = initialTranslateXRef.current;
      const t0y = initialTranslateYRef.current;
      const cx = pinchCenterXRef.current;
      const cy = pinchCenterYRef.current;

      const newScale = Math.min(
        MAX_SCALE,
        Math.max(MIN_SCALE, s0 * (d / initialDistanceRef.current)),
      );
      const ratio = newScale / s0;
      let newTx = cx * (1 - ratio) + t0x * ratio;
      let newTy = cy * (1 - ratio) + t0y * ratio;

      const currentCenter = midpoint(e.touches[0], e.touches[1]);
      const currentCenterX = currentCenter.x - rect.left;
      const currentCenterY = currentCenter.y - rect.top;
      const panDx = currentCenterX - cx;
      const panDy = currentCenterY - cy;
      newTx += panDx;
      newTy += panDy;

      if (newScale <= MIN_SCALE) {
        newTx = 0;
        newTy = 0;
      }

      setScale(newScale);
      setTranslateX(newTx);
      setTranslateY(newTy);
    };

    const handleTouchEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) {
        setTransition("none");
      }
    };

    el.addEventListener("touchstart", handleTouchStart, { passive: false });
    el.addEventListener("touchmove", handleTouchMove, { passive: false });
    el.addEventListener("touchend", handleTouchEnd, { passive: true });
    el.addEventListener("touchcancel", handleTouchEnd, { passive: true });

    return () => {
      el.removeEventListener("touchstart", handleTouchStart);
      el.removeEventListener("touchmove", handleTouchMove);
      el.removeEventListener("touchend", handleTouchEnd);
      el.removeEventListener("touchcancel", handleTouchEnd);
    };
  }, [scale, translateX, translateY, resetToIdentity]);

  return (
    <div
      ref={wrapperRef}
      className="min-h-full w-full touch-pan-x touch-pan-y overflow-hidden"
      style={{ touchAction: "none" }}
    >
      <div
        className="min-h-full w-full origin-top-left"
        style={{
          transformOrigin: "0 0",
          transform: `translate(${translateX}px, ${translateY}px) scale(${scale})`,
          transition,
        }}
      >
        {children}
      </div>
    </div>
  );
}
