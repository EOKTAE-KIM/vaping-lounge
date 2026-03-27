"use client";

import { useCallback, useEffect, useRef } from "react";
import type { EmitterPoint } from "@/store/usePressInteractionStore";
import type { SmokeMode } from "@/types/smokeMode";
import { isDebugTouchMode } from "@/utils/isDebugTouchMode";

const DOUBLE_TAP_MS = 280;
const LONG_PRESS_MS = 450;

function dbg(...args: unknown[]) {
  if (!isDebugTouchMode()) return;
  const message = args
    .map((a) => {
      if (typeof a === "string") return a;
      try {
        return JSON.stringify(a);
      } catch {
        return String(a);
      }
    })
    .join(" ");
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("vr-debug-log", { detail: { level: "log", scope: "vape", message } }));
  }
  // eslint-disable-next-line no-console
  console.log("[vape]", ...args);
}

export type VapeInteractionHandlers = {
  onPointerDown: (e: React.PointerEvent<HTMLElement>) => void;
  onPointerUp: (e: React.PointerEvent<HTMLElement>) => void;
  onPointerCancel: (e: React.PointerEvent<HTMLElement>) => void;
  onPointerLeave: (e: React.PointerEvent<HTMLElement>) => void;
  onTouchStart: (e: React.TouchEvent<HTMLElement>) => void;
  onTouchEnd: (e: React.TouchEvent<HTMLElement>) => void;
  onTouchCancel: (e: React.TouchEvent<HTMLElement>) => void;
};

type Options = {
  disabled?: boolean;
  onPressStart: (payload: EmitterPoint, modeOverride?: SmokeMode) => void;
  onPressEnd: () => void;
  onLongPress: () => void;
  makeEmitterPayload: (clientX: number, clientY: number, host: HTMLElement) => EmitterPoint;
};

/**
 * 모바일/데스크톱 공통: Pointer Events 단일 경로.
 * native dblclick / 별도 touch 핸들러에 의존하지 않는 커스텀 더블탭·롱프레스.
 */
export function useVapeInteraction({
  disabled,
  onPressStart,
  onPressEnd,
  onLongPress,
  makeEmitterPayload,
}: Options): VapeInteractionHandlers {
  const activePointerIdRef = useRef<number | null>(null);
  const touchActiveRef = useRef(false);
  const lastTouchAtRef = useRef(0);
  const lastTapEndAtRef = useRef(0);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressFiredRef = useRef(false);

  const stopLongPressTimer = useCallback(() => {
    if (longPressTimerRef.current != null) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  const endGesture = useCallback(() => {
    stopLongPressTimer();
    activePointerIdRef.current = null;
    longPressFiredRef.current = false;
    onPressEnd();
  }, [onPressEnd, stopLongPressTimer]);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      if (disabled) return;
      /** 터치는 VapeDevice의 document capture 네이티브 경로에서만 처리 (pointer 중복 방지) */
      if (e.pointerType === "touch") return;
      dbg("pointerdown fired", e.pointerId, e.pointerType);
      if (e.button !== 0 && e.pointerType === "mouse") return;
      if (activePointerIdRef.current != null && activePointerIdRef.current !== e.pointerId) return;

      e.stopPropagation();
      if (e.cancelable) e.preventDefault();

      activePointerIdRef.current = e.pointerId;
      longPressFiredRef.current = false;
      stopLongPressTimer();

      try {
        (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
      } catch {
        /* ignore */
      }

      const now = performance.now();
      const isDoubleTap = lastTapEndAtRef.current > 0 && now - lastTapEndAtRef.current <= DOUBLE_TAP_MS;
      if (isDoubleTap) dbg("double tap detected (on press start)");

      const payload = makeEmitterPayload(e.clientX, e.clientY, e.currentTarget as HTMLElement);
      onPressStart(payload, isDoubleTap ? "donut" : "normal");

      longPressTimerRef.current = setTimeout(() => {
        longPressFiredRef.current = true;
        dbg("long press fired");
        onLongPress();
      }, LONG_PRESS_MS);
    },
    [disabled, makeEmitterPayload, onLongPress, onPressStart, stopLongPressTimer]
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      if (disabled) return;
      if (e.pointerType === "touch") return;
      dbg("pointerup fired", e.pointerId);
      if (activePointerIdRef.current !== e.pointerId) return;
      e.stopPropagation();
      if (e.cancelable) e.preventDefault();

      stopLongPressTimer();

      const now = performance.now();
      if (!longPressFiredRef.current) {
        dbg("tap detected");
        lastTapEndAtRef.current = now;
      } else {
        lastTapEndAtRef.current = 0;
      }

      try {
        (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
      } catch {
        /* ignore */
      }

      endGesture();
    },
    [disabled, endGesture, stopLongPressTimer]
  );

  const onPointerCancel = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      if (disabled) return;
      if (e.pointerType === "touch") return;
      dbg("pointercancel fired", e.pointerId);
      if (activePointerIdRef.current !== e.pointerId) return;
      e.stopPropagation();
      if (e.cancelable) e.preventDefault();
      stopLongPressTimer();
      lastTapEndAtRef.current = 0;
      endGesture();
    },
    [disabled, endGesture, stopLongPressTimer]
  );

  const onPointerLeave = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      if (disabled) return;
      if (e.pointerType === "touch") return;
      if (activePointerIdRef.current !== e.pointerId) return;
      if (e.pointerId && (e.currentTarget as HTMLElement).hasPointerCapture?.(e.pointerId)) return;
      dbg("pointerleave (no capture) -> end");
      stopLongPressTimer();
      lastTapEndAtRef.current = 0;
      endGesture();
    },
    [disabled, endGesture, stopLongPressTimer]
  );

  const onTouchStart = useCallback(
    (e: React.TouchEvent<HTMLElement>) => {
      if (disabled) return;
      dbg("touchstart fired");
      if (touchActiveRef.current) return;
      const t = e.touches[0];
      if (!t) return;

      if (e.cancelable) e.preventDefault();
      e.stopPropagation();

      touchActiveRef.current = true;
      activePointerIdRef.current = -1;
      lastTouchAtRef.current = performance.now();
      longPressFiredRef.current = false;
      stopLongPressTimer();

      const now = performance.now();
      const isDoubleTap = lastTapEndAtRef.current > 0 && now - lastTapEndAtRef.current <= DOUBLE_TAP_MS;
      if (isDoubleTap) dbg("double tap detected (touch)");

      const payload = makeEmitterPayload(t.clientX, t.clientY, e.currentTarget as HTMLElement);
      onPressStart(payload, isDoubleTap ? "donut" : "normal");

      longPressTimerRef.current = setTimeout(() => {
        longPressFiredRef.current = true;
        dbg("long press fired (touch)");
        onLongPress();
      }, LONG_PRESS_MS);
    },
    [disabled, makeEmitterPayload, onLongPress, onPressStart, stopLongPressTimer]
  );

  const onTouchEnd = useCallback(
    (e: React.TouchEvent<HTMLElement>) => {
      if (disabled) return;
      if (!touchActiveRef.current || activePointerIdRef.current !== -1) return;
      dbg("touchend fired");
      if (e.cancelable) e.preventDefault();
      e.stopPropagation();

      stopLongPressTimer();
      const now = performance.now();
      if (!longPressFiredRef.current) {
        dbg("tap detected (touch)");
        lastTapEndAtRef.current = now;
      } else {
        lastTapEndAtRef.current = 0;
      }

      touchActiveRef.current = false;
      endGesture();
    },
    [disabled, endGesture, stopLongPressTimer]
  );

  const onTouchCancel = useCallback(
    (e: React.TouchEvent<HTMLElement>) => {
      if (disabled) return;
      if (!touchActiveRef.current) return;
      dbg("touchcancel fired");
      if (e.cancelable) e.preventDefault();
      e.stopPropagation();
      touchActiveRef.current = false;
      lastTapEndAtRef.current = 0;
      stopLongPressTimer();
      endGesture();
    },
    [disabled, endGesture, stopLongPressTimer]
  );

  useEffect(() => {
    return () => {
      stopLongPressTimer();
    };
  }, [stopLongPressTimer]);

  useEffect(() => {
    if (!isDebugTouchMode()) return;
    const ts = () => dbg("touchstart fired (window capture)");
    const te = () => dbg("touchend fired (window capture)");
    window.addEventListener("touchstart", ts, true);
    window.addEventListener("touchend", te, true);
    return () => {
      window.removeEventListener("touchstart", ts, true);
      window.removeEventListener("touchend", te, true);
    };
  }, []);

  return { onPointerDown, onPointerUp, onPointerCancel, onPointerLeave, onTouchStart, onTouchEnd, onTouchCancel };
}
