"use client";

import { useEffect, useMemo, useRef } from "react";
import type { RefObject } from "react";
import type { EmitterPoint } from "@/store/usePressInteractionStore";
import type { SmokeMode } from "@/types/smokeMode";
import type { SmokeBlob } from "@/types/smoke";

import { lerp } from "@/lib/noise";
import { emitRingCluster, stepRing, drawRing } from "@/components/smoke/RingSmokeLayer";

import { interactionDonutPreset } from "@/features/smoke/smokePresets";

type InteractionVariant = "normal" | "donut";

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

function clamp01(n: number) {
  return clamp(n, 0, 1);
}

function smoothstep01(t: number) {
  const x = clamp01(t);
  return x * x * (3 - 2 * x);
}

function getNozzle(
  rect: DOMRect | null,
  emitter: EmitterPoint | null,
  w: number,
  h: number
) {
  const nozzleX = emitter && rect ? emitter.clientX - rect.left : w * 0.5;
  const nozzleY = emitter && rect ? emitter.clientY - rect.top : h * 0.28;
  const driftX = emitter ? emitter.driftX : 0;
  return { nozzleX, nozzleY, driftX };
}

export function useInteractionSmokeEngine(
  canvasRef: RefObject<HTMLCanvasElement | null>,
  {
    variant,
    pressing,
    smokeMode,
    intensity,
    emitter,
    lowPower,
  }: {
    variant: InteractionVariant;
    pressing: boolean;
    smokeMode: SmokeMode;
    intensity: number;
    emitter: EmitterPoint | null;
    lowPower: boolean;
  }
) {
  const ringRef = useRef<SmokeBlob[]>([]);

  const pressingRef = useRef(pressing);
  const smokeModeRef = useRef(smokeMode);
  const intensityRef = useRef(intensity);
  const emitterRef = useRef(emitter);
  const lowPowerRef = useRef(lowPower);

  const rafRef = useRef<number | null>(null);
  const rectRef = useRef<DOMRect | null>(null);
  const lastAtRef = useRef<number>(0);

  const pressAgeRef = useRef(0);

  const ringAccRef = useRef(0);
  const nextRingIntervalRef = useRef(0.28);

  const prevSmokeModeRef = useRef<SmokeMode>(smokeMode);

  useEffect(() => {
    pressingRef.current = pressing;
  }, [pressing]);
  useEffect(() => {
    smokeModeRef.current = smokeMode;
  }, [smokeMode]);
  useEffect(() => {
    intensityRef.current = intensity;
  }, [intensity]);
  useEffect(() => {
    emitterRef.current = emitter;
  }, [emitter]);
  useEffect(() => {
    lowPowerRef.current = lowPower;
  }, [lowPower]);

  const quality = useMemo(() => {
    const baseRingMax = lowPower ? 40 : 58;

    return {
      dprCap: lowPower ? 1.35 : 1.8,
      ringMax: Math.round(baseRingMax * interactionDonutPreset.ringSystemCapMul),
      ringMinInterval: 0.22,
      ringMaxInterval: 0.44,
    };
  }, [lowPower]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    let mounted = true;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      rectRef.current = rect;
      const dprRaw = window.devicePixelRatio || 1;
      const dpr = Math.max(1, Math.min(quality.dprCap, dprRaw));
      canvas.width = Math.floor(rect.width * dpr);
      canvas.height = Math.floor(rect.height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    resize();
    lastAtRef.current = performance.now();
    window.addEventListener("resize", resize);

    const step = (now: number) => {
      if (!mounted) return;

      const dtMs = Math.max(0, now - lastAtRef.current);
      lastAtRef.current = now;
      const dt = Math.min(0.05, dtMs / 1000);
      if (dt <= 0) {
        rafRef.current = requestAnimationFrame(step);
        return;
      }

      const rect = rectRef.current;
      const w = rect ? rect.width : canvas.clientWidth;
      const h = rect ? rect.height : canvas.clientHeight;
      const nowSec = now / 1000;
      // interaction: keep additional smoke subtle and slow
      const timeScale = lowPowerRef.current ? 0.28 : 0.32;
      const simDt = dt * timeScale;
      const simNowSec = nowSec * timeScale;

      const isPressing = pressingRef.current;
      const currentMode = smokeModeRef.current;
      const currentIntensity = intensityRef.current;
      const currentEmitter = emitterRef.current;

      // smokeMode가 바뀌면, 현재 variant에서 렌더링되지 않는 ring/잔상을 빠르게 정리
      if (prevSmokeModeRef.current !== currentMode && isPressing) {
        if (variant === "donut" && currentMode === "normal") {
          ringRef.current.splice(0, ringRef.current.length);
        }
      }
      prevSmokeModeRef.current = currentMode;

      // press ramp
      if (isPressing) {
        pressAgeRef.current += simDt;
      } else {
        pressAgeRef.current = 0;
      }
      const ramp01 = smoothstep01(pressAgeRef.current / 0.22);

      const intensity01 = clamp01(currentIntensity / 1.5);
      const effectivePower01 = isPressing ? clamp01(intensity01 * 0.92 + ramp01 * 0.45) : 0;
      const rampGate = ramp01 < 0.04 ? 0 : clamp01((ramp01 - 0.04) / 0.10);
      const power01 = effectivePower01 * rampGate;

      const powerDonut01 = power01 * interactionDonutPreset.powerScale;

      const nozzle = getNozzle(rect, currentEmitter, w, h);

      // interaction canvas는 ambient을 덮지 않도록 “매 프레임 투명”으로 유지한다.
      ctx.clearRect(0, 0, w, h);

      // 요구사항: 입구(노즐/mouthpiece)에서 생성되는 연기 제거
      // - 따라서 Interaction normal(press) 파티클 발사를 비활성화한다.
      // - 도넛(trick)은 TrickOverlay(variant="donut")에서만 별도 전경으로 렌더링된다.
      if (variant !== "donut") {
        rafRef.current = requestAnimationFrame(step);
        return;
      }

      // --------------------------------------------
      // 1) Emit (variant 기준)
      // --------------------------------------------
      if (isPressing && currentMode === "donut" && powerDonut01 > 0.001) {
        ringAccRef.current += simDt;
        if (ringAccRef.current >= nextRingIntervalRef.current) {
          ringAccRef.current = 0;
          // donut preset이 약하므로 시스템 간격도 약간 늘려 “과한 폭죽” 방지
          const randT = Math.random();
          nextRingIntervalRef.current =
            lerp(quality.ringMinInterval, quality.ringMaxInterval, randT) * (1.15 + 0.25 * (1 - powerDonut01));

          const minDim = Math.min(w, h);
          const ringRadius = lerp(w * 0.055, w * 0.095, powerDonut01) * (0.86 + Math.random() * 0.3);
          const ringTh = lerp(w * 0.012, w * 0.03, powerDonut01) * (0.80 + Math.random() * 0.6);

          emitRingCluster({
            ringCenterX: nozzle.nozzleX + nozzle.driftX * 6,
            ringCenterY: nozzle.nozzleY - 8,
            ringRadius: ringRadius * (0.92 + 0.10 * (minDim / Math.max(1, minDim))),
            ringTh: ringTh * (0.95 + 0.12 * powerDonut01),
            power01: powerDonut01,
            ramp01,
            lowPower: lowPowerRef.current,
            blobs: ringRef.current,
            maxCount: quality.ringMax,
          });
        }
      }

      // --------------------------------------------
      // 2) Step physics (existing blobs only)
      // --------------------------------------------
      const emitterDriftX = nozzle.driftX;
      const forceScale = 1 + powerDonut01 * 0.25;
      stepRing(ringRef.current, simDt, simNowSec, { w, h }, emitterDriftX, forceScale);

      ctx.globalCompositeOperation = "screen";
      ctx.globalAlpha = 0.44 + 0.18 * ramp01;
      drawRing(ctx, ringRef.current, simNowSec);
      ctx.globalAlpha = 1;

      rafRef.current = requestAnimationFrame(step);
    };

    rafRef.current = requestAnimationFrame(step);

    return () => {
      mounted = false;
      window.removeEventListener("resize", resize);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [canvasRef, quality, variant]);
}

