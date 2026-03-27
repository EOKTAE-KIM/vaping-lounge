"use client";

import { useMemo, useCallback, useLayoutEffect, useRef } from "react";
import { motion } from "framer-motion";
import type { EmitterPoint } from "@/store/usePressInteractionStore";
import type { SmokeMode } from "@/types/smokeMode";

type Props = {
  glow: number; // 0 ~ 1.3 정도
  isPressing: boolean;
  smokeMode: SmokeMode;
  imageSrc: string;
  imageScale?: number;
  glowColorA: string;
  glowColorB: string;
  disabled?: boolean;
  onPressStart: (payload: EmitterPoint, modeOverride?: SmokeMode) => void;
  onPressEnd: () => void;
  onLongPress: () => void;
};

function clamp01(n: number) {
  return Math.max(0, Math.min(1, n));
}

export function VapeDevice({
  glow,
  disabled,
  isPressing,
  smokeMode,
  imageSrc,
  imageScale = 1,
  glowColorA,
  glowColorB,
  onPressStart,
  onPressEnd,
  onLongPress,
}: Props) {
  const hitRef = useRef<HTMLDivElement | null>(null);
  const visualRef = useRef<HTMLDivElement | null>(null);
  const nativePressedRef = useRef(false);
  const nativeLongPressRef = useRef(false);
  const nativeLongTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nativeLastTapRef = useRef(0);

  const makeEmitterPayload = useCallback((clientX: number, clientY: number, host: HTMLElement): EmitterPoint => {
    const rect = host.getBoundingClientRect();
    const centerX = rect.left + rect.width * 0.5;
    const emitterClientX = centerX;
    const emitterClientY = rect.top + rect.height * 0.42;
    const driftX = rect.width > 0 ? Math.max(-1, Math.min(1, (clientX - centerX) / (rect.width * 0.5))) : 0;
    void clientY;
    return { clientX: emitterClientX, clientY: emitterClientY, rawClientX: clientX, rawClientY: clientY, driftX };
  }, []);

  const reducedGlow = useMemo(() => clamp01(glow / 1.2), [glow]);

  const lipCursor = useMemo(() => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="18" viewBox="0 0 28 18">
      <path d="M2 8c2.8-5.2 7-8 12-8s9.2 2.8 12 8c-2.8 4.8-7 8-12 8S4.8 12.8 2 8z" fill="#ff4f6d" opacity="0.95"/>
      <path d="M7 9.2c1.8-2.1 4.1-3.2 7-3.2s5.2 1.1 7 3.2c-1.8 2-4.1 3 7 3s5.2-1 7-3z" fill="#ff85a0" opacity="0.35"/>
      <path d="M6 9c3-3.8 6.1-4.8 8-4.8S19 5.2 22 9c-3 2.6-6.1 3.6-8 3.6S9 11.6 6 9z" fill="#ff7a95" opacity="0.5"/>
    </svg>`;
    const encoded = encodeURIComponent(svg)
      .replace(/'/g, "%27")
      .replace(/"/g, "%22");

    return `url("data:image/svg+xml,${encoded}") 14 12, pointer`;
  }, []);

  const activeTouchIdRef = useRef<number | null>(null);
  const activePointerIdRef = useRef<number | null>(null);

  useLayoutEffect(() => {
    if (disabled) return;

    const stopLong = () => {
      if (nativeLongTimerRef.current != null) {
        clearTimeout(nativeLongTimerRef.current);
        nativeLongTimerRef.current = null;
      }
    };
    const isUiControlTarget = (target: EventTarget | null): boolean => {
      if (!(target instanceof HTMLElement)) return false;
      return Boolean(target.closest("[data-ui-control='1']"));
    };
    const emit = (message: string) => {
      try {
        window.dispatchEvent(new CustomEvent("vr-debug-log", { detail: { level: "log", scope: "vape-native", message } }));
      } catch {
        /* ignore */
      }
    };
    const resolveHost = () => hitRef.current ?? document.querySelector<HTMLElement>("[data-vape-hit='1']");
    const resolveEmitterHost = () => visualRef.current ?? resolveHost();

    const start = (clientX: number, clientY: number) => {
      if (nativePressedRef.current) return;
      const host = resolveHost();
      if (!host) {
        emit("start ignored: no host");
        return;
      }
      const emitterHost = resolveEmitterHost();
      if (!emitterHost) return;
      nativePressedRef.current = true;
      nativeLongPressRef.current = false;
      const now = Date.now();
      const isDouble = nativeLastTapRef.current > 0 && now - nativeLastTapRef.current < 300;
      const payload = makeEmitterPayload(clientX, clientY, emitterHost);
      onPressStart(payload, isDouble ? "donut" : "normal");
      emit(`start; double=${String(isDouble)}`);
      stopLong();
      nativeLongTimerRef.current = setTimeout(() => {
        nativeLongPressRef.current = true;
        onLongPress();
        emit("long press native");
      }, 450);
    };
    const finish = (kind: "touchend" | "touchcancel" | "pointerup" | "pointercancel" | "pointerleave-cancel") => {
      if (!nativePressedRef.current) return;
      stopLong();
      if (kind === "touchcancel" || kind === "pointercancel" || kind === "pointerleave-cancel") {
        nativeLastTapRef.current = 0;
      } else if (!nativeLongPressRef.current) {
        nativeLastTapRef.current = Date.now();
      } else {
        nativeLastTapRef.current = 0;
      }
      nativePressedRef.current = false;
      nativeLongPressRef.current = false;
      activeTouchIdRef.current = null;
      activePointerIdRef.current = null;
      onPressEnd();
      emit(kind);
    };
    const hitTest = (clientX: number, clientY: number, target: EventTarget | null): HTMLElement | null => {
      const host = resolveHost();
      if (!host) return null;
      const rect = host.getBoundingClientRect();
      const inRect = clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
      const inContains = !!target && host.contains(target as Node);
      return inRect || inContains ? host : null;
    };

    /** document capture 기준 터치 시작: host 리스너 누락/오버레이 가로채기 대비 */
    const onDocTouchStart = (e: TouchEvent) => {
      if (isUiControlTarget(e.target)) return;
      if (nativePressedRef.current) return;
      const t = e.touches[0];
      if (!t) return;
      const host = resolveHost();
      if (!host) return;
      const rect = host.getBoundingClientRect();
      const inRect = t.clientX >= rect.left && t.clientX <= rect.right && t.clientY >= rect.top && t.clientY <= rect.bottom;
      const tgt = e.target;
      const inContains = !!tgt && host.contains(tgt as Node);
      if (!inRect && !inContains) return;
      activeTouchIdRef.current = t.identifier;
      if (e.cancelable) e.preventDefault();
      e.stopPropagation();
      emit("doc-touchstart fallback");
      start(t.clientX, t.clientY);
    };
    const onTouchEnd = (e: TouchEvent) => {
      if (isUiControlTarget(e.target)) return;
      if (activeTouchIdRef.current == null) {
        const t0 = e.changedTouches[0];
        const host = t0 ? hitTest(t0.clientX, t0.clientY, e.target) : null;
        // iPhone 일부 환경: touchstart 누락 시 touchend 단독으로 들어오는 케이스 폴백
        if (host && t0) {
          emit("touchend-fallback-start");
          start(t0.clientX, t0.clientY);
          finish("touchend");
        }
        return;
      }
      if (activeTouchIdRef.current == null) return;
      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches.item(i);
        if (t && t.identifier === activeTouchIdRef.current) {
          if (e.cancelable) e.preventDefault();
          e.stopPropagation();
          emit("touchend");
          finish("touchend");
          return;
        }
      }
    };
    const onTouchCancel = (e: TouchEvent) => {
      if (isUiControlTarget(e.target)) return;
      if (activeTouchIdRef.current == null) return;
      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches.item(i);
        if (t && t.identifier === activeTouchIdRef.current) {
          if (e.cancelable) e.preventDefault();
          e.stopPropagation();
          emit("touchcancel");
          finish("touchcancel");
          return;
        }
      }
    };
    /** document capture 기준 포인터 시작: 에뮬레이터/데스크톱에서도 동일 경로로 처리 */
    const onDocPointerDown = (e: PointerEvent) => {
      if (isUiControlTarget(e.target)) return;
      if (e.pointerType === "touch") return;
      if (nativePressedRef.current) return;
      if (e.button !== 0 && e.pointerType === "mouse") return;
      const host = hitTest(e.clientX, e.clientY, e.target);
      if (!host) return;
      activePointerIdRef.current = e.pointerId;
      if (e.cancelable) e.preventDefault();
      e.stopPropagation();
      try {
        host.setPointerCapture?.(e.pointerId);
      } catch {
        /* ignore */
      }
      emit(`pointerdown ${e.pointerType}`);
      start(e.clientX, e.clientY);
    };
    const onPointerUp = (e: PointerEvent) => {
      if (activePointerIdRef.current == null || activePointerIdRef.current !== e.pointerId) return;
      const host = resolveHost();
      if (e.cancelable) e.preventDefault();
      e.stopPropagation();
      try {
        host?.releasePointerCapture?.(e.pointerId);
      } catch {
        /* ignore */
      }
      emit(`pointerup ${e.pointerType}`);
      finish("pointerup");
    };
    const onPointerCancel = (e: PointerEvent) => {
      if (activePointerIdRef.current == null || activePointerIdRef.current !== e.pointerId) return;
      if (e.cancelable) e.preventDefault();
      e.stopPropagation();
      emit(`pointercancel ${e.pointerType}`);
      finish("pointercancel");
    };
    const onPointerLeave = (e: PointerEvent) => {
      if (activePointerIdRef.current == null || activePointerIdRef.current !== e.pointerId) return;
      const host = resolveHost();
      if (host?.hasPointerCapture?.(e.pointerId)) return;
      emit(`pointerleave ${e.pointerType}`);
      finish("pointerleave-cancel");
    };
    const onDocClick = (e: MouseEvent) => {
      if (isUiControlTarget(e.target)) return;
      if (nativePressedRef.current) return;
      const host = hitTest(e.clientX, e.clientY, e.target);
      if (!host) return;
      // 실기기 Safari에서 touch/pointer 시작 이벤트가 누락될 때 click만 들어오는 경우 대응
      emit("click-fallback-start");
      start(e.clientX, e.clientY);
      finish("pointerup");
    };
    const prevent = (e: Event) => {
      if (e.cancelable) e.preventDefault();
    };

    document.addEventListener("touchstart", onDocTouchStart, { capture: true, passive: false });
    document.addEventListener("touchend", onTouchEnd, { capture: true, passive: false });
    document.addEventListener("touchcancel", onTouchCancel, { capture: true, passive: false });
    document.addEventListener("pointerdown", onDocPointerDown, { capture: true, passive: false });
    document.addEventListener("pointerup", onPointerUp, true);
    document.addEventListener("pointercancel", onPointerCancel, true);
    document.addEventListener("click", onDocClick, true);
    document.addEventListener("pointerleave", onPointerLeave, true);
    document.addEventListener("dragstart", prevent, true);
    document.addEventListener("contextmenu", prevent, true);

    return () => {
      stopLong();
      document.removeEventListener("touchstart", onDocTouchStart, { capture: true });
      document.removeEventListener("touchend", onTouchEnd, { capture: true });
      document.removeEventListener("touchcancel", onTouchCancel, { capture: true });
      document.removeEventListener("pointerdown", onDocPointerDown, { capture: true });
      document.removeEventListener("pointerup", onPointerUp, true);
      document.removeEventListener("pointercancel", onPointerCancel, true);
      document.removeEventListener("click", onDocClick, true);
      document.removeEventListener("pointerleave", onPointerLeave, true);
      document.removeEventListener("dragstart", prevent, true);
      document.removeEventListener("contextmenu", prevent, true);
    };
  }, [disabled, makeEmitterPayload, onLongPress, onPressEnd, onPressStart]);

  return (
    <div
      className="pointer-events-auto absolute inset-0 z-[130] flex items-center justify-center px-[max(12px,min(8vmin,40px))] py-[max(12px,min(8vmin,40px))]"
      style={{ touchAction: "manipulation" }}
    >
      <div
        ref={hitRef}
        data-vape-hit="1"
        className="absolute inset-0 z-[1] pointer-events-auto"
        style={{
          touchAction: "none",
          userSelect: "none",
          WebkitUserSelect: "none",
          WebkitTouchCallout: "none",
          WebkitTapHighlightColor: "transparent",
        }}
        draggable={false}
        role="button"
        aria-label="전자담배를 인터랙션해요"
      />
      {/* 시각적인 전자담배 본체 */}
      <div
        ref={visualRef}
        className="relative z-[2] flex max-h-[min(92vh,820px)] max-w-[min(92vw,690px)] min-h-[280px] min-w-[min(100%,480px)] shrink-0 items-center justify-center pointer-events-none"
        style={{
          width: "min(78vmin, calc(100vw - 32px))",
          aspectRatio: "1 / 1.15",
          cursor: disabled ? "default" : lipCursor,
          touchAction: "manipulation",
          userSelect: "none",
          WebkitUserSelect: "none",
          WebkitTouchCallout: "none",
          WebkitTapHighlightColor: "transparent",
        }}
      >
        <motion.img
          src={imageSrc}
          alt="전자담배"
          draggable={false}
          className="pointer-events-none h-full w-full select-none object-contain"
          style={{
            userSelect: "none",
            WebkitUserSelect: "none",
            msUserSelect: "none",
            WebkitTouchCallout: "none",
            WebkitTapHighlightColor: "transparent",
          }}
          initial={false}
          animate={{
            filter: `drop-shadow(0px 0px ${6 + reducedGlow * 12 + (isPressing ? 4 : 0)}px rgba(${glowColorA}, ${
              0.06 + reducedGlow * 0.18
            })) drop-shadow(0px 0px ${4 + reducedGlow * 6}px rgba(${glowColorB}, ${0.025 + reducedGlow * 0.08}))`,
            scale: (isPressing ? 1.015 : 1) * imageScale,
          }}
          transition={{ type: "spring", stiffness: 220, damping: 18 }}
        />
        <motion.div
          className="pointer-events-none absolute -top-4 left-1/2 -translate-x-1/2"
          animate={{
            opacity: 0.25 + reducedGlow * 0.65 + (isPressing ? 0.2 : 0),
            scale: 0.92 + reducedGlow * 0.2 + (smokeMode !== "normal" && isPressing ? 0.08 : 0),
          }}
          transition={{ type: "spring", stiffness: 260, damping: 18 }}
        >
          <div
            style={{
              width: 14 + reducedGlow * 8,
              height: 14 + reducedGlow * 8,
              borderRadius: "999px",
              background:
                "radial-gradient(circle at 30% 30%, rgba(255,173,92,0.85), rgba(255,92,170,0.22) 45%, rgba(255,173,92,0) 72%)",
              filter: "blur(1px)",
            }}
          />
        </motion.div>
      </div>
    </div>
  );
}
