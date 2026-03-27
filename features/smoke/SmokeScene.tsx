"use client";

import { useEffect, useMemo, useRef } from "react";
import type { SmokeMode } from "@/types/smokeMode";
import type { EmitterPoint } from "@/store/usePressInteractionStore";

type AmbientFogBlob = {
  x: number;
  y: number;
  radius: number;
  alpha: number;
  blur: number;
  vx: number;
  vy: number;
  noiseOffset: number;
  life: number; // seconds
  age: number; // seconds
  depth: number; // 0..1 (for opacity/blur)
};

type ActiveSmokeBlob = {
  x: number;
  y: number;
  radius: number;
  alpha: number;
  blur: number;
  vx: number;
  vy: number;
  turb: number;
  life: number; // seconds
  age: number; // seconds
  seed: number;
};

type SmokeRing = {
  x: number;
  y: number;
  radius: number;
  thickness: number;
  alpha: number;
  blur: number;
  vx: number;
  vy: number;
  growth: number;
  wobbleAmp: number;
  wobbleFreq: number;
  wobblePhase: number;
  life: number; // seconds
  age: number; // seconds
};

function rand(min: number, max: number) {
  return min + Math.random() * (max - min);
}

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function smoothstep(t: number) {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
}

// 빠른 “노이즈 느낌” (완전한 Perlin 필요 없음)
function noise1(t: number, seed: number) {
  return (
    Math.sin(t * (0.7 + seed * 0.03) + seed) * 0.6 +
    Math.sin(t * (1.7 + seed * 0.01) + seed * 1.9) * 0.35 +
    Math.sin(t * (2.3 + seed * 0.02) + seed * 0.7) * 0.25
  );
}

export function SmokeScene({
  pressing,
  smokeMode,
  intensity,
  emitter,
  lowPower,
}: {
  pressing: boolean;
  smokeMode: SmokeMode;
  intensity: number;
  emitter: EmitterPoint | null;
  lowPower: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);

  const ambientRef = useRef<AmbientFogBlob[]>([]);
  const activeRef = useRef<ActiveSmokeBlob[]>([]);
  const ringsRef = useRef<SmokeRing[]>([]);

  const pressingRef = useRef(pressing);
  const smokeModeRef = useRef(smokeMode);
  const intensityRef = useRef(intensity);
  const emitterRef = useRef<EmitterPoint | null>(emitter);

  const canvasRectRef = useRef<DOMRect | null>(null);
  const lastFrameAtRef = useRef<number>(0);

  const smokePowerRef = useRef(0); // 0..1.5 정도
  const pressAgeRef = useRef(0); // seconds since press start

  // spawn accumulators
  const ambientSpawnAccRef = useRef(0);
  const activeSpawnAccRef = useRef(0);
  const ringSpawnAccRef = useRef(0);

  const quality = useMemo(() => {
    return {
      dprCap: lowPower ? 1.35 : 2.0,
      ambientMax: lowPower ? 14 : 22,
      activeMax: lowPower ? 20 : 34,
      ringMax: lowPower ? 10 : 16,

      ambientSpawnPerSec: lowPower ? 0.55 : 0.9,
      activeSpawnBase: lowPower ? 22 : 34, // scaled by power
      activeSpawnExtra: lowPower ? 44 : 78,

      // press 밀도 증가 지연(150~300ms)
      pressRiseTimeSec: 0.23,
      // release tail(0.6~1.5s)
      pressDecayTimeSec: lowPower ? 0.95 : 1.15,
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
      const dpr = Math.max(1, Math.min(quality.dprCap, window.devicePixelRatio || 1));
      canvas.width = Math.floor(rect.width * dpr);
      canvas.height = Math.floor(rect.height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    resize();
    window.addEventListener("resize", resize);

    // blob drawing helpers
    const drawFogBlob = (blob: AmbientFogBlob) => {
      const t01 = blob.life <= 0 ? 1 : blob.age / blob.life;
      const fade = (1 - t01) * (1 - t01);
      const a = blob.alpha * fade;
      if (a <= 0.005) return;

      // 완전한 원 대신 radial gradient로 “볼륨형 안개” 느낌
      const inner = blob.radius * (0.22 + blob.depth * 0.18);
      const outer = blob.radius * (0.95 + blob.depth * 0.28);

      const g = ctx.createRadialGradient(blob.x, blob.y, inner * 0.2, blob.x, blob.y, outer);
      // 흰색~회색 톤(검은 배경 대비)
      const c0 = `rgba(245,245,255,${a})`;
      const c1 = `rgba(205,215,230,${a * 0.55})`;
      const c2 = `rgba(245,245,255,0)`;
      g.addColorStop(0, c0);
      g.addColorStop(0.55, c1);
      g.addColorStop(1, c2);

      ctx.save();
      ctx.globalAlpha = 1;
      ctx.shadowBlur = blob.blur;
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(blob.x, blob.y, outer, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    };

    const drawActiveBlob = (blob: ActiveSmokeBlob) => {
      const t01 = blob.life <= 0 ? 1 : blob.age / blob.life;
      const fade = Math.pow(1 - t01, 1.2);
      const a = blob.alpha * fade * (0.8 + smokePowerRef.current * 0.15);
      if (a <= 0.006) return;

      const inner = blob.radius * (0.18 + 0.15 * noise1(blob.age, blob.seed));
      const outer = blob.radius * 1.05;

      // 코어는 더 진하게, 외곽은 부드럽게
      const g = ctx.createRadialGradient(blob.x, blob.y, Math.max(1, inner), blob.x, blob.y, outer);
      g.addColorStop(0, `rgba(250,250,255,${a})`);
      g.addColorStop(0.45, `rgba(215,225,238,${a * 0.6})`);
      g.addColorStop(1, `rgba(250,250,255,0)`);

      ctx.save();
      ctx.globalAlpha = 1;
      ctx.shadowBlur = blob.blur;
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(blob.x, blob.y, outer, 0, Math.PI * 2);
      ctx.fill();

      // 약간의 “질감” 레이어(미세 오프셋 그라디언트 1회)
      const t = blob.age;
      const dx = noise1(t * 0.8, blob.seed + 2.1) * blob.turb * 0.3;
      const dy = noise1(t * 0.9, blob.seed + 5.7) * blob.turb * 0.25;
      const g2 = ctx.createRadialGradient(blob.x + dx, blob.y + dy, blob.radius * 0.12, blob.x + dx, blob.y + dy, outer * 0.88);
      g2.addColorStop(0, `rgba(245,245,255,${a * 0.55})`);
      g2.addColorStop(1, `rgba(245,245,255,0)`);
      ctx.fillStyle = g2;
      ctx.beginPath();
      ctx.arc(blob.x + dx, blob.y + dy, outer * 0.85, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    };

    const drawRing = (ring: SmokeRing) => {
      const t01 = ring.life <= 0 ? 1 : ring.age / ring.life;
      const fade = Math.pow(1 - t01, 1.05);
      const a = ring.alpha * fade;
      if (a <= 0.008) return;

      const wobble = Math.sin(ring.wobblePhase + ring.wobbleFreq * ring.age) * ring.wobbleAmp * (1 - t01);
      const r = Math.max(1, ring.radius + wobble);

      ctx.save();
      ctx.globalAlpha = 1;
      ctx.shadowBlur = ring.blur;
      ctx.globalCompositeOperation = "screen";
      ctx.lineCap = "round";

      // 바깥 소프트 스트로크
      ctx.strokeStyle = `rgba(235,240,255,${a})`;
      ctx.lineWidth = ring.thickness * (1 + t01 * 0.2);
      ctx.beginPath();
      ctx.arc(ring.x, ring.y, r, 0, Math.PI * 2);
      ctx.stroke();

      // 안쪽 보조 스트로크(더 얇고 약하게) -> “soft ring” 질감
      ctx.strokeStyle = `rgba(220,230,245,${a * 0.55})`;
      ctx.lineWidth = ring.thickness * 0.48 * (1 + t01 * 0.12);
      ctx.beginPath();
      ctx.arc(ring.x, ring.y, r * 0.992, 0, Math.PI * 2);
      ctx.stroke();

      // 가장자리 살짝 채움(아주 약하게) -> 완전한 도형 선명도 감소
      ctx.fillStyle = `rgba(245,250,255,${a * 0.04})`;
      ctx.beginPath();
      ctx.arc(ring.x, ring.y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    };

    const step = (now: number) => {
      if (!mounted) return;

      const dtMs = lastFrameAtRef.current ? now - lastFrameAtRef.current : 16;
      lastFrameAtRef.current = now;
      const dt = Math.min(0.05, dtMs / 1000); // safety clamp

      const canvasW = canvas.clientWidth;
      const canvasH = canvas.clientHeight;

      const isPressingNow = pressingRef.current;
      const modeNow = smokeModeRef.current;
      const iNow = intensityRef.current;

      // smokePower: press 중 상승(150~300ms), release 후 decay tail
      if (isPressingNow) {
        pressAgeRef.current += dt;
        const riseT = smoothstep(pressAgeRef.current / quality.pressRiseTimeSec);
        // 150~300ms 뒤에 밀도 상승이 체감되도록, riseT가 0일 때 target도 매우 작게 유지
        const powerBase = clamp(iNow / 1.5, 0, 1.5);
        const target = powerBase * (0.05 + 0.95 * riseT);
        // 상승은 비교적 빠르게
        const k = 1 - Math.exp(-dt * 8.5);
        smokePowerRef.current = lerp(smokePowerRef.current, target, k);
      } else {
        pressAgeRef.current = 0;
        const k = Math.exp(-dt / quality.pressDecayTimeSec);
        smokePowerRef.current = smokePowerRef.current * k;
      }

      const power = clamp(smokePowerRef.current, 0, 1.5);

      // emitter 기반 origin (장면 중심부 뒤로 약간 오프셋)
      const rect = canvasRectRef.current;
      const emitterX = emitterRef.current && rect ? emitterRef.current.clientX - rect.left : canvasW * 0.5;
      const emitterY = emitterRef.current && rect ? emitterRef.current.clientY - rect.top : canvasH * 0.3;
      const originX = emitterX;
      const originY = emitterY + canvasH * 0.04; // “기기 뒤”로 약간 이동

      // ambient spawn (항상 존재, 단 idle는 약하게)
      const ambientMultiplier = isPressingNow ? 1.1 : 0.85;
      ambientSpawnAccRef.current += dt * quality.ambientSpawnPerSec * ambientMultiplier;
      while (ambientSpawnAccRef.current >= 1) {
        ambientSpawnAccRef.current -= 1;
        const list = ambientRef.current;
        if (list.length >= quality.ambientMax) break;

        // 좌/우/후면에 퍼지도록 분포를 “중심 가중 + 가장자리 일부”로 혼합
        const sideBias = Math.random() < (lowPower ? 0.22 : 0.28);
        const x = sideBias
          ? rand(canvasW * 0.08, canvasW * 0.92)
          : canvasW * 0.5 + (Math.random() * 2 - 1) * canvasW * rand(0.05, 0.22) * (0.35 + Math.random());

        const y = rand(canvasH * 0.18, canvasH * 0.75);
        const radius = rand(canvasW * 0.12, canvasW * 0.26) * rand(0.75, 1.15);
        const depth = Math.random();

        list.push({
          x,
          y,
          radius,
          alpha: rand(0.05, 0.13) * (0.75 + depth * 0.7),
          blur: rand(18, 46) * (0.75 + depth * 0.8),
          vx: rand(-18, 18) * (0.25 + depth * 0.6),
          vy: rand(-10, -2) * (0.2 + depth * 0.75),
          noiseOffset: rand(0, 1000),
          life: rand(6.5, 12.0),
          age: 0,
          depth,
        });
      }

      // active spawn (press 중 증가)
      if (power > 0.02) {
        const rate = quality.activeSpawnBase * power + quality.activeSpawnExtra * power * power;
        activeSpawnAccRef.current += dt * rate;
        const list = activeRef.current;

        while (activeSpawnAccRef.current >= 1) {
          activeSpawnAccRef.current -= 1;
          if (list.length >= quality.activeMax) break;

          // “기기 주변 뒤쪽”이 가장 진하고, 좌우로도 부풀게
          const sidePop = power > 0.5 && Math.random() < 0.32;
          const x = sidePop
            ? originX + rand(-canvasW * 0.38, canvasW * 0.38)
            : originX + rand(-canvasW * 0.18, canvasW * 0.18) * (0.4 + power);

          const y = originY + rand(-canvasH * 0.03, canvasH * 0.22) * (0.6 + power);
          const radius = rand(canvasW * 0.08, canvasW * 0.18) * (0.55 + power * 0.75);
          const depthBoost = 0.85 + power * 0.35;

          list.push({
            x: clamp(x, -80, canvasW + 80),
            y: clamp(y, -80, canvasH + 80),
            radius,
            alpha: rand(0.12, 0.26) * depthBoost,
            blur: rand(22, 58) * (0.7 + power * 0.6),
            vx: rand(-28, 28) * (0.08 + power * 0.16),
            vy: rand(-40, -10) * (0.12 + power * 0.22) - rand(0, 25) * power,
            turb: rand(10, 26) * (0.7 + power * 0.5),
            life: rand(0.95, 1.55) * (0.75 + power * 0.45),
            age: 0,
            seed: rand(0, 9999),
          });
        }
      }

      // ring spawn (donut overlay)
      if (modeNow === "donut" && power > 0.18) {
        // press 중 더 자주 생성
        const interval = lerp(lowPower ? 0.28 : 0.22, lowPower ? 0.15 : 0.12, smoothstep(power / 1.0));
        ringSpawnAccRef.current += dt / interval;
        const list = ringsRef.current;

        while (ringSpawnAccRef.current >= 1) {
          ringSpawnAccRef.current -= 1;
          if (list.length >= quality.ringMax) break;

          const r0 = rand(canvasW * 0.07, canvasW * 0.095) * (0.85 + power * 0.35);
          const thickness = rand(canvasW * 0.016, canvasW * 0.024) * (0.9 + power * 0.45);
          const y0 = originY - canvasH * 0.02;

          list.push({
            x: originX + rand(-canvasW * 0.05, canvasW * 0.05),
            y: y0 + rand(-canvasH * 0.02, canvasH * 0.02),
            radius: r0,
            thickness,
            alpha: rand(0.15, 0.34) * (0.85 + power * 0.35),
            blur: rand(14, 28) * (0.75 + power * 0.35),
            vx: rand(-18, 18) * (0.08 + power * 0.14),
            vy: rand(-70, -30) * (0.08 + power * 0.18),
            growth: rand(120, 240) * (0.35 + power * 0.55),
            wobbleAmp: rand(6, 14) * (0.7 + power * 0.45),
            wobbleFreq: rand(1.0, 2.1),
            wobblePhase: rand(0, Math.PI * 2),
            life: rand(0.65, 1.1) * (0.85 + power * 0.35),
            age: 0,
          });
        }
      }

      // clear & draw
      ctx.clearRect(0, 0, canvasW, canvasH);
      ctx.globalCompositeOperation = "source-over";

      // Ambient Fog Layer
      const ambientList = ambientRef.current;
      for (let idx = ambientList.length - 1; idx >= 0; idx--) {
        const b = ambientList[idx];
        b.age += dt;
        if (b.age >= b.life) {
          ambientList.splice(idx, 1);
          continue;
        }

        // 천천히 움직이는 흐름(후면에서 말려드는 느낌)
        const t = now / 1000;
        const n = noise1(t * 0.6, b.noiseOffset);
        b.x += (b.vx * dt + n * b.radius * 0.004) * 0.75;
        b.y += b.vy * dt + n * b.radius * 0.002;

        // 좌우 경계 부드러운 감기
        b.x = clamp(b.x, -canvasW * 0.3, canvasW * 1.3);

        drawFogBlob(b);
      }

      // Active Vape Smoke Layer
      ctx.globalCompositeOperation = "screen";
      const activeList = activeRef.current;
      for (let idx = activeList.length - 1; idx >= 0; idx--) {
        const b = activeList[idx];
        b.age += dt;
        if (b.age >= b.life) {
          activeList.splice(idx, 1);
          continue;
        }

        const t = now / 1000;
        const n = noise1(t, b.seed);
        b.x += b.vx * dt + n * b.turb * dt * 0.35;
        b.y += b.vy * dt + noise1(t * 1.07, b.seed + 33.3) * b.turb * dt * 0.25;

        drawActiveBlob(b);
      }

      // Trick Overlay Layer (donut ring)
      if (modeNow === "donut") {
        ctx.globalCompositeOperation = "screen";
        const ringList = ringsRef.current;
        for (let idx = ringList.length - 1; idx >= 0; idx--) {
          const r = ringList[idx];
          r.age += dt;
          if (r.age >= r.life) {
            ringList.splice(idx, 1);
            continue;
          }

          r.x += r.vx * dt;
          r.y += r.vy * dt;
          r.radius += r.growth * dt;

          drawRing(r);
        }
      } else {
        // ring 배열은 donut 모드가 아닐 때도 업데이트되지만,
        // 활성 ring이 너무 오래 보이는 것을 막기 위해 느슨하게 감쇠
        // (현재 구현에선 age 기반으로 제거되므로 그대로 둠)
      }

      rafRef.current = requestAnimationFrame(step);
    };

    rafRef.current = requestAnimationFrame(step);

    return () => {
      mounted = false;
      window.removeEventListener("resize", resize);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [quality, lowPower]);

  return <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none" aria-hidden="true" />;
}

