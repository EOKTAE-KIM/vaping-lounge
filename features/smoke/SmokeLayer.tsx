"use client";

import { useEffect, useMemo, useRef } from "react";
import type { SmokeMode } from "@/types/smokeMode";
import type { EmitterPoint } from "@/store/usePressInteractionStore";

type SmokeParticle = {
  kind: "idle" | "press" | "donut";
  x: number;
  y: number;
  vx: number; // px/s
  vy: number; // px/s
  r: number; // base radius
  alpha: number; // base alpha
  life: number; // ms
  age: number; // ms
  blur: number;
  hue: number;
  wobbleAmp: number;
  wobbleFreq: number;
  wobblePhase: number;
  fadeExp: number; // alpha decay exponent
};

function rand(min: number, max: number) {
  return min + Math.random() * (max - min);
}

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

export function SmokeLayer({
  pressing,
  smokeMode,
  intensity,
  emitter,
  lowPower,
}: {
  pressing: boolean;
  smokeMode: SmokeMode;
  intensity: number; // 0..1.5
  emitter: EmitterPoint | null;
  lowPower: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);

  const smokeParticlesRef = useRef<SmokeParticle[]>([]);

  const pressingRef = useRef(pressing);
  const smokeModeRef = useRef(smokeMode);
  const intensityRef = useRef(intensity);
  const emitterRef = useRef<EmitterPoint | null>(emitter);

  const canvasRectRef = useRef<DOMRect | null>(null);
  const lastFrameAtRef = useRef<number>(0);

  const smokeEmitAccRef = useRef(0); // particles to emit accumulator
  const donutRingEmitAccRef = useRef(0); // ms accumulator

  const cfg = useMemo(() => {
    return {
      maxSmokeParticles: lowPower ? 260 : 520,
      idleRate: lowPower ? 26 : 40, // particles/sec
      idleStrength: lowPower ? 0.65 : 0.9,
      pressBaseRate: lowPower ? 95 : 160, // particles/sec at intensity=0
      pressExtraRate: lowPower ? 220 : 420, // additional particles/sec at intensity=1
      idleMaxPerTick: lowPower ? 2 : 3,
      pressMaxPerTick: lowPower ? 14 : 24,
      blurScale: lowPower ? 0.45 : 1.0,
      donutRingMinIntervalMs: lowPower ? 200 : 150,
      donutRingMaxIntervalMs: lowPower ? 380 : 280,
      donutRingParticleCount: lowPower ? 26 : 44,
    };
  }, [lowPower]);

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
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    let mounted = true;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      canvasRectRef.current = rect;

      const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
      canvas.width = Math.floor(rect.width * dpr);
      canvas.height = Math.floor(rect.height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); // CSS pixel 단위로 그립니다.
    };

    resize();
    window.addEventListener("resize", resize);

    const mouthFallbackX = () => canvas.clientWidth * 0.5;
    const mouthFallbackY = () => canvas.clientHeight * 0.28;

    const spawnSmoke = (params: {
      x: number;
      y: number;
      amount: number; // number of particles
      mode: "idle" | "press";
      driftX: number; // -1..1
      upBoost: number; // how much stronger upward
    }) => {
      const parts = smokeParticlesRef.current;
      if (parts.length >= cfg.maxSmokeParticles) return;

      const maxNew = cfg.maxSmokeParticles - parts.length;
      const realAmount = Math.min(params.amount, maxNew);

      if (realAmount <= 0) return;

      const baseAlpha = params.mode === "idle" ? rand(0.04, 0.11) : rand(0.16, 0.35);
      const baseBlur = params.mode === "idle" ? rand(1.6, 4.6) : rand(3.8, 10.2);

      // 자연스럽게 분산되도록, 상향 + 좌우 약한 흔들림
      for (let i = 0; i < realAmount; i++) {
        const spreadX = rand(-0.35, 0.35) + params.driftX * rand(0.1, 0.55);
        const spreadY = rand(-1.05, -0.55) * params.upBoost; // 위로 가는 방향

        const speed = params.mode === "idle" ? rand(44, 88) : rand(60, 150);
        const vx = spreadX * speed;
        const vy = spreadY * speed;

        // 링/연기 느낌을 위해 반투명 입자
        parts.push({
          kind: params.mode === "idle" ? "idle" : "press",
          x: params.x + rand(-6, 6),
          y: params.y + rand(-3, 6),
          vx,
          vy,
          r: rand(8, 22) * (params.mode === "idle" ? 0.7 : 1.15),
          alpha: baseAlpha,
          life: rand(780, params.mode === "idle" ? 1250 : 1100),
          age: 0,
          blur: baseBlur * cfg.blurScale,
          hue: rand(190, 222),
          wobbleAmp: params.mode === "idle" ? rand(0.6, 2.0) : rand(1.5, 5.2),
          wobbleFreq: rand(0.6, 1.8),
          wobblePhase: rand(0, Math.PI * 2),
          fadeExp: params.mode === "idle" ? 1.35 : 0.85,
        });
      }
    };

    const spawnDonutRing = (params: {
      x: number;
      y: number;
      driftX: number;
      intensity: number; // 0..1.5
      canvasW: number;
      canvasH: number;
    }) => {
      const parts = smokeParticlesRef.current;
      if (parts.length >= cfg.maxSmokeParticles) return;

      const i = clamp(params.intensity, 0, 1.5);
      const count = Math.floor(cfg.donutRingParticleCount * (0.75 + i * 0.35));
      const baseRadius = rand(22, 34) * (0.9 + i * 0.35); // 첨부 이미지처럼 "속 빈 원" 느낌의 둘레 크기
      const thickness = rand(5.5, 10.5) * (0.75 + i * 0.35); // 둘레 폭(입자 분포)
      const centerJitter = rand(-10, 10) * (0.35 + i * 0.55);

      // 링은 위로(전방) 이동 + 약간 좌우 흔들림
      const forwardUp = (0.8 + i * 0.55) * rand(0.7, 1.1);
      const side = params.driftX * rand(18, 55) * (0.4 + i * 0.4);

      const allocMax = cfg.maxSmokeParticles - parts.length;
      const realCount = Math.min(count, allocMax);
      if (realCount <= 0) return;

      for (let k = 0; k < realCount; k++) {
        const a = (k / realCount) * Math.PI * 2 + rand(-0.12, 0.12);
        const r = baseRadius + rand(-thickness, thickness);

        const px = params.x + centerJitter * 0.15 + Math.cos(a) * r;
        const py = params.y + centerJitter * 0.05 + Math.sin(a) * r;

        // radial outward + forward/up bias
        const radialSpeed = rand(120, 220) * (0.55 + i * 0.55);
        const vx = Math.cos(a) * radialSpeed + side * 0.02 + rand(-12, 12);
        const vy = -Math.abs(radialSpeed * 0.35) - forwardUp * rand(60, 120) + rand(-8, 8);

        const alpha = rand(0.14, 0.32) * (0.85 + i * 0.35);
        const blur = rand(10, 22) * cfg.blurScale;
        const radius = rand(6, 14) * (0.9 + i * 0.25);
        const life = rand(860, 1250) * (0.92 + i * 0.15);

        parts.push({
          kind: "donut",
          x: clamp(px, -50, params.canvasW + 50),
          y: clamp(py, -50, params.canvasH + 50),
          vx,
          vy,
          r: radius,
          alpha,
          life,
          age: 0,
          blur,
          hue: rand(190, 220),
          wobbleAmp: rand(1.0, 3.0) * (0.8 + i * 0.4),
          wobbleFreq: rand(0.6, 1.8),
          wobblePhase: rand(0, Math.PI * 2),
          fadeExp: 0.9 + i * 0.15,
        });
      }
    };

    const draw = (now: number) => {
      if (!mounted) return;

      const dt = lastFrameAtRef.current ? now - lastFrameAtRef.current : 16;
      lastFrameAtRef.current = now;
      const dtSec = dt / 1000;

      // idle/press 모두 기본 시작점을 두되, press/idle에서는 화면 전체 분포로 퍼뜨립니다.
      const mouthX = mouthFallbackX();
      const mouthY = mouthFallbackY();
      const canvasW = canvas.clientWidth;
      const canvasH = canvas.clientHeight;
      if (!pressingRef.current) {
        // idle는 아주 약하게
        const particlesPerFrame = cfg.idleRate * dtSec;
        const amount = Math.floor(particlesPerFrame * 0.35 + Math.random() * 0.35);
        const capped = Math.min(amount, cfg.idleMaxPerTick);
        if (capped > 0) {
          // 화면 상단~중단 위주로 잔연기 분산
          const ix = rand(canvasW * 0.08, canvasW * 0.92);
          const iy = rand(canvasH * 0.12, canvasH * 0.6);
          spawnSmoke({
            x: ix,
            y: iy,
            amount: capped,
            mode: "idle",
            driftX: 0,
            upBoost: 0.9,
          });
        }
      } else {
        // press 연기
        const e = emitterRef.current;
        const rect = canvasRectRef.current;
        const x = e && rect ? e.clientX - rect.left : mouthX;
        const y = e && rect ? e.clientY - rect.top : mouthY;

        const driftX = e ? e.driftX : 0;
        const i = clamp(intensityRef.current, 0, 1.5);

        if (smokeModeRef.current === "donut") {
          // donut: "속 빈 원형" 느낌을 내기 위해 둘레에 입자들을 뿌립니다(프레임마다 X, 간격 기반).
          donutRingEmitAccRef.current += dt;
          const intervalMs =
            cfg.donutRingMaxIntervalMs -
            (cfg.donutRingMaxIntervalMs - cfg.donutRingMinIntervalMs) * (i / 1.5);

          // 간격 기반으로 링 생성(프레임마다 생성 X)
          let safety = 0;
          const rectW = canvas.clientWidth;
          const rectH = canvas.clientHeight;
          while (donutRingEmitAccRef.current >= intervalMs && safety < 3) {
            donutRingEmitAccRef.current -= intervalMs;
            spawnDonutRing({
              x,
              y,
              driftX,
              intensity: i,
              canvasW: rectW,
              canvasH: rectH,
            });
            safety++;
          }
        } else {
          // normal: 입자 연기가 지속적으로 증가
          const rate = cfg.pressBaseRate + cfg.pressExtraRate * (i / 1.5);
          smokeEmitAccRef.current += rate * dtSec;

          const maxBatch = cfg.pressMaxPerTick;
          let batch = Math.floor(smokeEmitAccRef.current);
          if (batch > maxBatch) batch = maxBatch;

          if (batch > 0) {
            smokeEmitAccRef.current -= batch;
            // “바람이 휙 지나가듯” 한 덩어리로 보이게:
            // 시작 지점을 화면 전체 랜덤으로 흩지 않고, 바람(시간 기반) 방향으로만 약간 흔들어 줍니다.
            const windX = Math.cos(now * 0.00045) * canvasW * (0.02 + i * 0.01);
            const windY = Math.sin(now * 0.00037) * canvasH * (0.01 + i * 0.01);
            const spreadX = canvasW * (0.045 + i * 0.03);
            const spreadY = canvasH * (0.03 + i * 0.025);
            const gaussianishX = Math.random() + Math.random() - 1;
            const gaussianishY = Math.random() + Math.random() - 1;
            const nx = clamp(x + windX + gaussianishX * spreadX, 0, canvasW);
            const ny = clamp(y + windY + gaussianishY * spreadY, 0, canvasH);

            spawnSmoke({
              x: nx,
              y: ny,
              amount: batch,
              mode: "press",
              driftX,
              upBoost: 1.35 + i * 0.45,
            });

          }
        }
      }

      // draw stage
      ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
      ctx.globalCompositeOperation = "screen";

      // smoke particles
      const parts = smokeParticlesRef.current;
      for (let idx = parts.length - 1; idx >= 0; idx--) {
        const p = parts[idx];
        p.age += dt;
        const t01 = p.age / p.life;
        if (t01 >= 1) {
          parts.splice(idx, 1);
          continue;
        }

        // drag + buoyancy
        const drag = 0.985 - t01 * 0.03;
        p.vx *= drag;
        p.vy *= drag;

        // 약간 상승 보정
        p.vy -= 6 * dtSec * (0.15 + (1 - t01) * 0.3);

        const wobble =
          Math.sin((p.age * 0.006) * p.wobbleFreq + p.wobblePhase) * p.wobbleAmp;

        p.x += (p.vx + wobble) * dtSec;
        p.y += p.vy * dtSec;

        const alpha = p.alpha * Math.pow(1 - t01, p.fadeExp);
        if (alpha <= 0.01) continue;

        const radius = p.r * (0.72 + t01 * 0.95);
        const blur = p.blur * (0.85 + t01 * 1.35);

        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.shadowBlur = blur;
        ctx.shadowColor = `hsla(${p.hue}, 95%, 70%, ${alpha})`;

        if (p.kind === "press") {
          // 점이 아니라 “바람이 쓸고 지나가는” streak(선형 흐름)으로 렌더
          const speed = Math.hypot(p.vx, p.vy) || 1;
          const ux = p.vx / speed;
          const uy = p.vy / speed;
          const len = radius * (2.2 + speed / 520) * (0.65 + t01 * 0.75);

          ctx.strokeStyle = `hsla(${p.hue}, 92%, 78%, ${alpha})`;
          ctx.lineWidth = Math.max(1.2, radius * (0.5 + t01 * 0.55));
          ctx.lineCap = "round";
          ctx.beginPath();
          ctx.moveTo(p.x - ux * len * 0.5, p.y - uy * len * 0.5);
          ctx.lineTo(p.x + ux * len * 0.5, p.y + uy * len * 0.5);
          ctx.stroke();

          // 살짝 옅은 코어(중심 뿌리기)
          ctx.fillStyle = `hsla(${p.hue}, 90%, 80%, ${alpha * 0.75})`;
          ctx.beginPath();
          ctx.arc(p.x, p.y, radius * 0.55, 0, Math.PI * 2);
          ctx.fill();
        } else {
          // idle/donut은 기존 원형 입자 느낌
          ctx.fillStyle = `hsla(${p.hue}, 90%, 78%, ${alpha})`;
          ctx.beginPath();
          ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
          ctx.fill();
        }

        ctx.restore();
      }

      ctx.globalCompositeOperation = "source-over";

      rafRef.current = requestAnimationFrame(draw);
    };

    rafRef.current = requestAnimationFrame(draw);

    return () => {
      mounted = false;
      window.removeEventListener("resize", resize);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [
    cfg.blurScale,
    cfg.idleRate,
    cfg.idleStrength,
    cfg.idleMaxPerTick,
    cfg.pressBaseRate,
    cfg.pressExtraRate,
    cfg.maxSmokeParticles,
    cfg.pressMaxPerTick,
    cfg.donutRingMinIntervalMs,
    cfg.donutRingMaxIntervalMs,
    cfg.donutRingParticleCount,
    lowPower,
  ]);

  return <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none" aria-hidden="true" />;
}

