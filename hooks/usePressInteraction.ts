"use client";

import { useCallback, useEffect, useRef } from "react";
import type { TrickType } from "@/types/tricks";
import type { SmokeMode } from "@/types/smokeMode";
import { usePressInteractionStore, type EmitterPoint } from "@/store/usePressInteractionStore";

function resolveSmokeMode(trick: TrickType): SmokeMode {
  // MVP: normal/donut만 구현
  if (trick === "donut") return "donut";
  if (trick === "none") return "normal";
  if (trick === "random") {
    // press 시작 시 결정(렌더에서는 난수 사용하지 않음)
    return Math.random() < 0.45 ? "donut" : "normal";
  }
  return "normal"; // turtle/double/waterfall은 아직 normal로 매핑
}

export function usePressInteraction(trick: TrickType, onPressCountOnce: (mode: SmokeMode) => void) {
  const setIsPressing = usePressInteractionStore((s) => s.setIsPressing);
  const setSmokeMode = usePressInteractionStore((s) => s.setSmokeMode);
  const setSmokeIntensity = usePressInteractionStore((s) => s.setSmokeIntensity);
  const setEmitter = usePressInteractionStore((s) => s.setEmitter);

  const rafRef = useRef<number | null>(null);
  const releaseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tickLoopRef = useRef<() => void>(() => {});
  const pressStartAtRef = useRef<number>(0);
  const lastSetRef = useRef<number>(-1);
  const countedRef = useRef(false);
  const clickCountRef = useRef(0);
  const lastClickAtRef = useRef(0);

  const stopRaf = useCallback(() => {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
  }, []);

  const stopReleaseTimer = useCallback(() => {
    if (releaseTimerRef.current != null) {
      clearTimeout(releaseTimerRef.current);
      releaseTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    tickLoopRef.current = () => {
      const now = performance.now();
      const dt = now - pressStartAtRef.current;
      // 클릭 직후 더 풍성하게 차오르도록 상승 속도/상한 상향
      const intensity = Math.min(1.8, dt <= 0 ? 0 : dt / 360);

      // 너무 잦은 setState 방지(렌더/연기 성능)
      const prev = lastSetRef.current;
      if (Math.abs(intensity - prev) > 0.028) {
        lastSetRef.current = intensity;
        setSmokeIntensity(intensity);
      }

      rafRef.current = requestAnimationFrame(tickLoopRef.current);
    };
  }, [setSmokeIntensity]);

  const onPressStart = useCallback(
    (payload: EmitterPoint, modeOverride?: SmokeMode) => {
      // 이미 pressing 중이면(멀티터치 꼬임) 추가 시작 무시
      stopReleaseTimer();
      setIsPressing(true);
      setEmitter(payload);

      const now = performance.now();
      let mode = modeOverride ?? "normal";
      if (!modeOverride) {
        // fallback: 기존 클릭 누적 판정 유지
        clickCountRef.current = now - lastClickAtRef.current <= 980 ? clickCountRef.current + 1 : 1;
        lastClickAtRef.current = now;
        mode = resolveSmokeMode(trick);
        if (clickCountRef.current >= 3) {
          mode = "dragon";
        } else if (clickCountRef.current === 2) {
          mode = "donut";
        } else {
          mode = "normal";
        }
      }
      setSmokeMode(mode);

      pressStartAtRef.current = performance.now();
      lastSetRef.current = -1;
      countedRef.current = true;
      onPressCountOnce(mode);

      // 클릭 직후 연기량을 더 크게 체감하도록 시작 강도 추가 상향
      setSmokeIntensity(mode === "normal" ? 0.3 : mode === "donut" ? 1.15 : 0.72);
      stopRaf();
      rafRef.current = requestAnimationFrame(tickLoopRef.current);
    },
    [onPressCountOnce, setEmitter, setIsPressing, setSmokeIntensity, setSmokeMode, stopRaf, stopReleaseTimer, trick]
  );

  const onPressEnd = useCallback(() => {
    countedRef.current = false;
    stopRaf();
    const mode = usePressInteractionStore.getState().smokeMode;
    // 따닥(짧은 더블클릭)에서도 도넛/드래곤이 보이도록 릴리즈 후 짧게 유지
    const lingerMs = mode === "normal" ? 0 : 260;
    stopReleaseTimer();
    if (lingerMs <= 0) {
      setIsPressing(false);
      setSmokeIntensity(0);
      return;
    }
    releaseTimerRef.current = setTimeout(() => {
      setIsPressing(false);
      setSmokeIntensity(0);
      releaseTimerRef.current = null;
    }, lingerMs);
  }, [setIsPressing, setSmokeIntensity, stopRaf, stopReleaseTimer]);

  useEffect(() => {
    return () => {
      stopRaf();
      stopReleaseTimer();
    };
  }, [stopRaf, stopReleaseTimer]);

  const onLongPress = useCallback(() => {
    setSmokeMode("dragon");
    setSmokeIntensity(0.42);
  }, [setSmokeIntensity, setSmokeMode]);

  return { onPressStart, onPressEnd, onLongPress };
}

