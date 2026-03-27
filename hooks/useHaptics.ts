"use client";

import { useCallback } from "react";

export type HapticPattern = number | number[];

export function useHaptics(enabled: boolean) {
  return useCallback((pattern: HapticPattern) => {
    if (!enabled) return;
    if (typeof navigator === "undefined") return;
    // iOS/Android에서 지원되는 경우 진동 피드백
    if (typeof navigator.vibrate === "function") {
      navigator.vibrate(pattern);
    }
  }, [enabled]);
}

