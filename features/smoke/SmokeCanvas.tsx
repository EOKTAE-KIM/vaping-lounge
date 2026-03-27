"use client";

import { useEffect, useMemo, useRef } from "react";
import type { SmokeAction } from "@/types/smoke";
import type { TrickType } from "@/types/tricks";

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  alpha: number;
  life: number;
  age: number;
  blur: number;
  hue: number; // smoke 계열로 섞기 위한 값
};

type ActionTimeline = {
  actionId: string;
  resolvedType: TrickType;
  startAt: number;
  strength: number;
  dirX: number;
  dirY: number;
  stagesSpawned: boolean[];
};

function rand(min: number, max: number) {
  return min + Math.random() * (max - min);
}

function normalize(x: number, y: number) {
  const d = Math.hypot(x, y) || 1;
  return { x: x / d, y: y / d };
}

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

function resolveRandomType(): TrickType {
  const r = Math.random();
  if (r < 0.44) return "donut";
  if (r < 0.78) return "turtle";
  return "burst";
}

export function SmokeCanvas({ action, lowPower }: { action: SmokeAction | null; lowPower: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const particlesRef = useRef<Particle[]>([]);
  const timelineRef = useRef<ActionTimeline | null>(null);
  const lastFrameAtRef = useRef<number>(0);

  const cfg = useMemo(() => {
    const maxParticles = lowPower ? 220 : 360;
    const idleRate = lowPower ? 28 : 44; // particles per second
    const idleStrength = lowPower ? 0.75 : 1.0;
    const blurScale = lowPower ? 0.45 : 1.0;
    return { maxParticles, idleRate, idleStrength, blurScale };
  }, [lowPower]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    let mounted = true;
    const resize = () => {
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
      canvas.width = Math.floor(rect.width * dpr);
      canvas.height = Math.floor(rect.height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); // 1 unit = CSS px
    };

    resize();

    const onResize = () => resize();
    window.addEventListener("resize", onResize);

    const spawnIdle = (now: number, dt: number) => {
      const mouthX = canvas.clientWidth * 0.5;
      const mouthY = canvas.clientHeight * 0.28;

      // dt 기반으로 확률적으로 생성
      const perSecond = cfg.idleRate;
      const spawnCount = Math.floor((perSecond * dt) / 1000);
      const n = clamp(spawnCount + (Math.random() < 0.4 ? 1 : 0), 0, 4);

      const parts = particlesRef.current;
      for (let i = 0; i < n; i++) {
        if (parts.length >= cfg.maxParticles) break;
        const angle = rand(-Math.PI, -0.15) + rand(-0.1, 0.1);
        const speed = rand(48, 118) * cfg.idleStrength;
        const vx = Math.cos(angle) * speed + rand(-4, 4);
        const vy = Math.sin(angle) * speed - rand(10, 22);
        parts.push({
          x: mouthX + rand(-8, 8),
          y: mouthY + rand(-3, 6),
          vx,
          vy,
          r: rand(6, 18) * (lowPower ? 0.85 : 1),
          alpha: rand(0.08, 0.18) * (lowPower ? 0.85 : 1),
          life: rand(900, 1400),
          age: 0,
          blur: rand(2, 7) * cfg.blurScale,
          hue: rand(190, 220),
        });
      }
    };

    const spawnBurst = (params: {
      mouthX: number;
      mouthY: number;
      strength: number;
      dirX: number;
      dirY: number;
      variant: "burst" | "donut" | "turtle";
      originSkewX: number;
      originSkewY: number;
    }) => {
      const parts = particlesRef.current;
      const mouthX = params.mouthX;
      const mouthY = params.mouthY;
      const s = clamp(params.strength, 0.5, 2.2);

      const maxNew = lowPower ? 130 : 200;
      const count =
        params.variant === "donut"
          ? Math.floor((lowPower ? 70 : 110) * s)
          : params.variant === "turtle"
            ? Math.floor((lowPower ? 55 : 95) * s)
            : Math.floor((lowPower ? 70 : 120) * s);

      const realCount = Math.min(count, maxNew, cfg.maxParticles - parts.length);

      if (realCount <= 0) return;

      if (params.variant === "donut") {
        const baseR = rand(9, 14) * (lowPower ? 0.9 : 1);
        for (let i = 0; i < realCount; i++) {
          const a = (i / realCount) * Math.PI * 2 + rand(-0.04, 0.04);
          const ux = Math.cos(a);
          const uy = Math.sin(a);
          const x = mouthX + ux * baseR + rand(-1.5, 1.5);
          const y = mouthY + uy * baseR + rand(-1.2, 1.2);
          const speed = rand(70, 150) * s;
          parts.push({
            x,
            y,
            vx: ux * speed + params.dirX * 26 + params.originSkewX * 0.25,
            vy: uy * speed + params.dirY * 46 + params.originSkewY * 0.25,
            r: rand(5, 13) * (0.9 + s * 0.22),
            alpha: rand(0.08, 0.22) * (0.8 + s * 0.18),
            life: rand(700, 1050) * (0.95 + s * 0.18),
            age: 0,
            blur: rand(2, 8) * cfg.blurScale,
            hue: rand(195, 220),
          });
        }
        return;
      }

      if (params.variant === "turtle") {
        // 뭉친 덩어리 -> 단계적 퍼짐 느낌
        const forwardX = params.dirX;
        const forwardY = params.dirY;
        for (let i = 0; i < realCount; i++) {
          const t = i / realCount;
          const spread = rand(4, 10);
          const x = mouthX + forwardX * rand(8, 18) + rand(-spread, spread);
          const y = mouthY + forwardY * rand(8, 18) + rand(-spread * 0.55, spread * 0.55);
          const speed = rand(50, 140) * s * (0.75 + t * 0.45);
          const vx = forwardX * speed + rand(-30, 30) + params.originSkewX * 0.18;
          const vy = forwardY * speed + rand(-10, 26) + params.originSkewY * 0.18;
          parts.push({
            x,
            y,
            vx,
            vy,
            r: rand(7, 18) * (0.85 + s * 0.12),
            alpha: rand(0.07, 0.19) * (0.85 + s * 0.2),
            life: rand(780, 1200) * (0.92 + s * 0.18),
            age: 0,
            blur: rand(3, 9) * cfg.blurScale,
            hue: rand(185, 220),
          });
        }
        return;
      }

      // 기본 burst
      for (let i = 0; i < realCount; i++) {
        const a = rand(-Math.PI * 0.92, -Math.PI * 0.12) + rand(-0.18, 0.18);
        const speed = rand(58, 150) * s;
        const ux = Math.cos(a);
        const uy = Math.sin(a);
        parts.push({
          x: mouthX + rand(-8, 8),
          y: mouthY + rand(-4, 8),
          vx: ux * speed + params.dirX * 38,
          vy: uy * speed + params.dirY * 56,
          r: rand(6, 16) * (0.9 + s * 0.2),
          alpha: rand(0.06, 0.18) * (0.85 + s * 0.2),
          life: rand(650, 980) * (0.96 + s * 0.16),
          age: 0,
          blur: rand(2, 7) * cfg.blurScale,
          hue: rand(195, 222),
        });
      }
    };

    const render = (now: number) => {
      if (!mounted) return;

      const dt = lastFrameAtRef.current ? now - lastFrameAtRef.current : 16;
      lastFrameAtRef.current = now;

      // idle smoke
      spawnIdle(now, dt);

      // action timeline check
      const t = timelineRef.current;
      if (t) {
        const elapsed = now - t.startAt;
        const mouthX = canvas.clientWidth * 0.5;
        const mouthY = canvas.clientHeight * 0.28;

        const dirX = t.dirX;
        const dirY = t.dirY;
        const skewX = t.dirX * 18;
        const skewY = t.dirY * 18;

        const stages = [
          { at: 0, type: "burst" as const, variant: t.resolvedType === "turtle" ? "turtle" : t.resolvedType === "donut" ? "donut" : "burst" },
          { at: 120, type: "burst" as const, variant: "burst" as const },
          { at: 260, type: "burst" as const, variant: "turtle" as const },
        ];

        // stageSpawned 배열 길이는 resolvedType에 맞춰 단순화
        for (let i = 0; i < stages.length; i++) {
          if (t.stagesSpawned[i]) continue;
          if (elapsed < stages[i].at) continue;

          if (t.resolvedType === "donut") {
            if (i === 0) {
              spawnBurst({
                mouthX,
                mouthY,
                strength: t.strength * 1.05,
                dirX,
                dirY,
                variant: "donut",
                originSkewX: skewX,
                originSkewY: skewY,
              });
            } else if (i === 1) {
              // 링이 조금 더 커졌다가 사라지는 느낌
              spawnBurst({
                mouthX,
                mouthY,
                strength: t.strength * 0.7,
                dirX,
                dirY,
                variant: "burst",
                originSkewX: skewX,
                originSkewY: skewY,
              });
            }
          } else if (t.resolvedType === "turtle") {
            if (i === 0) {
              spawnBurst({
                mouthX,
                mouthY,
                strength: t.strength * 0.95,
                dirX,
                dirY,
                variant: "turtle",
                originSkewX: skewX,
                originSkewY: skewY,
              });
            } else if (i === 1) {
              spawnBurst({
                mouthX,
                mouthY,
                strength: t.strength * 0.75,
                dirX,
                dirY,
                variant: "turtle",
                originSkewX: skewX,
                originSkewY: skewY,
              });
            } else if (i === 2) {
              spawnBurst({
                mouthX,
                mouthY,
                strength: t.strength * 0.6,
                dirX,
                dirY,
                variant: "burst",
                originSkewX: skewX,
                originSkewY: skewY,
              });
            }
          } else {
            // burst / double 계열 간단 처리
            if (i === 0) {
              spawnBurst({
                mouthX,
                mouthY,
                strength: t.strength * 1.0,
                dirX,
                dirY,
                variant: "burst",
                originSkewX: skewX,
                originSkewY: skewY,
              });
            } else if (i === 1) {
              spawnBurst({
                mouthX,
                mouthY,
                strength: t.strength * 0.75,
                dirX,
                dirY,
                variant: "burst",
                originSkewX: skewX * 0.8,
                originSkewY: skewY * 0.8,
              });
            }
          }

          t.stagesSpawned[i] = true;
        }

        if (elapsed > 1050) {
          timelineRef.current = null;
        }
      }

      // draw
      ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
      ctx.globalCompositeOperation = "screen";

      const parts = particlesRef.current;
      for (let i = parts.length - 1; i >= 0; i--) {
        const p = parts[i];
        p.age += dt;

        const t01 = p.age / p.life;
        if (t01 >= 1) {
          parts.splice(i, 1);
          continue;
        }

        // drag + slight buoyancy
        const drag = 0.985 - t01 * 0.03;
        p.vx *= drag;
        p.vy *= drag;
        p.vy -= 0.004 * dt;

        p.x += (p.vx * dt) / 1000;
        p.y += (p.vy * dt) / 1000;

        const alpha = p.alpha * (1 - t01);
        if (alpha <= 0.01) continue;

        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.shadowBlur = p.r * p.blur;
        ctx.shadowColor = `hsla(${p.hue}, 95%, 70%, ${alpha})`;
        ctx.fillStyle = `hsla(${p.hue}, 90%, 76%, ${alpha})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * (0.85 + (1 - t01) * 0.22), 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      ctx.globalCompositeOperation = "source-over";

      rafRef.current = window.requestAnimationFrame(render);
    };

    rafRef.current = window.requestAnimationFrame(render);

    return () => {
      mounted = false;
      window.removeEventListener("resize", onResize);
      if (rafRef.current) window.cancelAnimationFrame(rafRef.current);
    };
  }, [cfg.blurScale, cfg.idleRate, cfg.idleStrength, cfg.maxParticles, lowPower]);

  useEffect(() => {
    if (!action) return;

    const timelineStart = performance.now();

    let dirX = 0;
    let dirY = -1;

    if (action.origin.kind === "swipe") {
      const n = normalize(action.origin.dx, action.origin.dy);
      // smoke는 제스처 방향을 대략 따르게 하되, y는 위로 더 강하게
      dirX = n.x;
      dirY = n.y <= 0 ? n.y : -n.y * 0.55;
    } else {
      dirX = 0;
      dirY = -1;
    }

    const resolvedType: TrickType =
      action.type === "random" ? resolveRandomType() : (action.type as TrickType);

    timelineRef.current = {
      actionId: action.id,
      resolvedType,
      startAt: timelineStart,
      strength: action.strength,
      dirX,
      dirY,
      stagesSpawned: [false, false, false],
    };
  }, [action]);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full pointer-events-none"
      aria-hidden="true"
    />
  );
}

