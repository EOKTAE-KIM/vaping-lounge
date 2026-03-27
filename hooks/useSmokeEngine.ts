"use client";

import type { RefObject } from "react";
import { useEffect, useRef } from "react";
import type { SmokeMode } from "@/types/smokeMode";
import type { EmitterPoint } from "@/store/usePressInteractionStore";
import { clamp, lerp } from "@/lib/noise";

import { emitNormalSmoke } from "@/components/smoke/emitters/normalSmokeEmitter";
import { emitDonutRingSystem, type RingSystem } from "@/components/smoke/emitters/donutSmokeEmitter";
import { normalSmokePreset, smokeQualityDefaults } from "@/components/smoke/smokePresets";
import { ringBreakN, smokeTurbulenceVec2 } from "@/components/smoke/utils/noise";
import type { SmokeParticleLike } from "@/components/smoke/utils/renderSmokeParticle";
import { getQualityFrameFade, renderSmokeParticle } from "@/components/smoke/utils/renderSmokeParticle";

type QualityLevel = "low" | "medium" | "high";

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

function smoothstep01(t: number) {
  const x = clamp01(t);
  return x * x * (3 - 2 * x);
}

function rand(min: number, max: number) {
  return min + Math.random() * (max - min);
}

function pickQualityLevel(lowPower: boolean, intensity: number): QualityLevel {
  if (lowPower) return "low";
  const i01 = clamp01(intensity / 1.5);
  if (i01 > 0.82) return "high";
  return "medium";
}

function getCaps(qualityLevel: QualityLevel) {
  const c = smokeQualityDefaults;
  if (qualityLevel === "low") {
    return {
      dprCap: 1.6,
      normalTotalCap: c.normalCoreCapLow + c.normalSoftCapLow + c.normalWispCapLow,
      ringSystemCap: c.ringSystemCapLow,
      ringParticlePerSystem: c.ringParticlePerSystemLow,
      normalWispCap: c.normalWispCapLow,
    };
  }
  if (qualityLevel === "medium") {
    return {
      dprCap: 1.85,
      normalTotalCap: c.normalCoreCapMedium + c.normalSoftCapMedium + c.normalWispCapMedium,
      ringSystemCap: c.ringSystemCapMedium,
      ringParticlePerSystem: c.ringParticlePerSystemMedium,
      normalWispCap: c.normalWispCapMedium,
    };
  }
  return {
    dprCap: 2.0,
    normalTotalCap: c.normalCoreCapHigh + c.normalSoftCapHigh + c.normalWispCapHigh,
    ringSystemCap: c.ringSystemCapHigh,
    ringParticlePerSystem: c.ringParticlePerSystemHigh,
    normalWispCap: c.normalWispCapHigh,
  };
}

export function useSmokeEngine(
  canvasRef: RefObject<HTMLCanvasElement | null>,
  { pressing, smokeMode, intensity, emitter, lowPower }: { pressing: boolean; smokeMode: SmokeMode; intensity: number; emitter: EmitterPoint | null; lowPower: boolean }
) {
  const normalParticlesRef = useRef<SmokeParticleLike[]>([]);
  const ringSystemsRef = useRef<RingSystem[]>([]);

  // latest external state (avoid restarting RAF loop)
  const pressingRef = useRef(pressing);
  const smokeModeRef = useRef(smokeMode);
  const intensityRef = useRef(intensity);
  const emitterRef = useRef(emitter);
  const lowPowerRef = useRef(lowPower);

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

  const pressAgeRef = useRef(0);
  const prevPressingRef = useRef(false);

  const normalEmitAccRef = useRef(0);
  const streamIdRef = useRef(0);

  const ringAccRef = useRef(0);
  const nextRingIntervalRef = useRef(0.26);
  const ringSystemIndexRef = useRef(0);

  const rafRef = useRef<number | null>(null);
  const rectRef = useRef<DOMRect | null>(null);

  // renderSmokeParticle의 stamp seed로 사용(패턴 반복 방지)
  const smokeSeedRef = useRef<number>(7777);

  // mode switching cleanup
  const prevModeRef = useRef<SmokeMode>(smokeMode);
  useEffect(() => {
    prevModeRef.current = smokeMode;
  }, [smokeMode]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    ctx.imageSmoothingEnabled = true;
    (ctx as unknown as { imageSmoothingQuality?: string }).imageSmoothingQuality = "high";

    let mounted = true;

    const resize = (dprCap: number) => {
      const rect = canvas.getBoundingClientRect();
      rectRef.current = rect;
      const dprRaw = window.devicePixelRatio || 1;
      const dpr = Math.max(1, Math.min(dprCap, dprRaw));
      canvas.width = Math.floor(rect.width * dpr);
      canvas.height = Math.floor(rect.height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    resize(getCaps(pickQualityLevel(lowPowerRef.current, intensityRef.current)).dprCap);

    let lastAt = performance.now();

    const step = (now: number) => {
      if (!mounted) return;

      const dtMs = Math.max(0, now - lastAt);
      lastAt = now;
      const dt = Math.min(0.05, dtMs / 1000);
      if (dt <= 0) {
        rafRef.current = requestAnimationFrame(step);
        return;
      }

      const rect = rectRef.current;
      const w = rect ? rect.width : canvas.clientWidth;
      const h = rect ? rect.height : canvas.clientHeight;
      const nowSec = now / 1000;

      const isPressing = pressingRef.current;
      const currentMode = smokeModeRef.current;
      const currentIntensity = intensityRef.current;
      const currentEmitter = emitterRef.current;
      const currentLowPower = lowPowerRef.current;

      const qualityLevel = pickQualityLevel(currentLowPower, currentIntensity);
      const caps = getCaps(qualityLevel);

      // press ramp
      if (isPressing) {
        const wasPressing = prevPressingRef.current;
        if (!wasPressing) pressAgeRef.current = 0;
        pressAgeRef.current += dt;
      } else {
        pressAgeRef.current = 0;
      }
      prevPressingRef.current = isPressing;

      const ramp01 = smoothstep01(pressAgeRef.current / 0.22);

      const intensity01 = clamp01(currentIntensity / 1.5);
      const effectivePower01 = isPressing ? clamp01(intensity01 * 0.92 + ramp01 * 0.45) : 0;
      const rampGate = ramp01 < 0.04 ? 0 : clamp01((ramp01 - 0.04) / 0.10);
      const power01 = effectivePower01 * rampGate;

      // anchor: 전자담배 배출구 좌표
      const nozzleX = currentEmitter && rect ? currentEmitter.clientX - rect.left : w * 0.5;
      const nozzleY = currentEmitter && rect ? currentEmitter.clientY - rect.top : h * 0.28;
      const driftX = currentEmitter ? currentEmitter.driftX : 0;

      // mode switching cleanup
      if (prevModeRef.current !== currentMode) {
        normalParticlesRef.current.splice(0, normalParticlesRef.current.length);
        ringSystemsRef.current.splice(0, ringSystemsRef.current.length);
        normalEmitAccRef.current = 0;
        ringAccRef.current = 0;
        streamIdRef.current = 0;
        ringSystemIndexRef.current = 0;
        prevModeRef.current = currentMode;
      }

      // frame persistence (not the smoke itself)
      const fadeBase = getQualityFrameFade(qualityLevel);
      const fadeIdle = fadeBase * 1.35;
      const fadePress = fadeBase * (0.92 + 0.08 * (1 - power01));
      const fade = isPressing ? lerp(fadeIdle, fadePress, ramp01) : fadeIdle;

      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = `rgba(0,0,0,${fade})`;
      ctx.fillRect(0, 0, w, h);

      // --------------------------------------------
      // 1) Emission
      // --------------------------------------------
      if (isPressing && power01 > 0.001) {
        if (currentMode === "normal") {
          const pressGain = 0.25 + 0.75 * power01;
          const rampGain = 0.55 + 0.45 * ramp01;
          const qualityGain = qualityLevel === "low" ? 0.82 : qualityLevel === "medium" ? 0.98 : 1.10;

          normalEmitAccRef.current += dt * normalSmokePreset.emissionRate * pressGain * rampGain * qualityGain;
          const spawnCount = Math.min(220, Math.floor(normalEmitAccRef.current));
          if (spawnCount > 0) {
            normalEmitAccRef.current -= spawnCount;
            streamIdRef.current++;
            emitNormalSmoke({
              particles: normalParticlesRef.current,
              maxTotal: caps.normalTotalCap,
              nozzleX,
              nozzleY,
              driftX,
              power01,
              ramp01,
              qualityLevel,
              nowSec,
              streamSeed: smokeSeedRef.current + streamIdRef.current * 123.77,
              spawnCount,
            });
          }
        } else {
          ringAccRef.current += dt;
          if (ringAccRef.current >= nextRingIntervalRef.current) {
            ringAccRef.current = 0;
            nextRingIntervalRef.current = lerp(0.18, 0.34, Math.random()) * (0.95 + 0.10 * (1 - power01));

            emitDonutRingSystem({
              ringSystems: ringSystemsRef.current,
              maxSystems: caps.ringSystemCap,
              nozzleX,
              nozzleY,
              driftX,
              power01,
              ramp01,
              nowSec,
              qualityLevel,
              bounds: { w, h },
              seed: smokeSeedRef.current + ringSystemIndexRef.current * 991.3 + Math.floor(power01 * 1000),
              ringParticleCount: caps.ringParticlePerSystem,
            });
            ringSystemIndexRef.current++;
          }
        }
      }

      // --------------------------------------------
      // 2) Physics update
      // --------------------------------------------
      if (currentMode === "normal") {
        const list = normalParticlesRef.current;
        for (let i = list.length - 1; i >= 0; i--) {
          const p = list[i];
          p.life -= dt;
          if (p.life <= 0) {
            list.splice(i, 1);
            continue;
          }

          const ageT = 1 - p.life / Math.max(0.0001, p.maxLife);
          const strength = p.kind === "core" ? 1.0 : p.kind === "soft" ? 0.85 : 0.72;
          const f = smokeTurbulenceVec2(p.x, p.y, nowSec, p.turbulenceSeed, strength);

          const dragPerSec = p.kind === "core" ? 1.02 : p.kind === "soft" ? 1.12 : 1.22;
          const drag = Math.exp(-dragPerSec * dt * (0.92 + 0.22 * (1 - ageT)));

          p.vx = p.vx * drag + f.vx * (normalSmokePreset.driftAmount * 0.05) * dt;
          p.vx += driftX * (normalSmokePreset.driftAmount * 0.0025) * dt * (0.6 + 0.4 * (1 - ageT));

          const buoy = p.kind === "core" ? 210 : p.kind === "soft" ? 150 : 120;
          const buoyK = 0.55 + 0.45 * (1 - ageT);
          p.vy = p.vy * drag + (f.vy * buoy * 0.015 - buoy * buoyK) * dt;

          p.x += p.vx * dt;
          p.y += p.vy * dt;

          p.rotation += (f.vx - f.vy) * 0.16 * dt + (p.vx * 0.00045 - p.vy * 0.00025) * (0.5 + ageT) * dt;

          const stretchGrowth = p.kind === "wisp" ? 0.05 : p.kind === "soft" ? 0.035 : 0.025;
          p.stretch = clamp(p.stretch * (1 + stretchGrowth * dt * (0.65 + 0.35 * ageT)), p.kind === "wisp" ? 1.4 : 1.0, p.kind === "wisp" ? 5.4 : 3.4);

          p.x = clamp(p.x, -w * 0.25, w * 1.25);
          p.y = clamp(p.y, -h * 0.25, h * 1.15);
        }
      } else {
        const systems = ringSystemsRef.current;
        for (let si = systems.length - 1; si >= 0; si--) {
          const sys = systems[si];
          const age = nowSec - sys.bornAtSec;
          if (age >= sys.systemLife) {
            systems.splice(si, 1);
            continue;
          }

          const ageT = age / sys.systemLife;
          const breakStart = 0.12 + 0.10 * (1 - sys.power01);
          const breakT = age <= breakStart ? 0 : clamp((age - breakStart) / 0.72, 0, 1);

          const cxWobble = Math.sin(age * 1.7 + sys.seed * 0.001) * 7.5 * sys.edgeNoise * 0.18;
          const cyWobble = Math.cos(age * 1.2 + sys.seed * 0.002) * 5.0 * sys.edgeNoise * 0.11;

          const centerX = sys.centerX0 + driftX * 12 * Math.min(1, age * 0.7) + cxWobble;
          const centerY = sys.centerY0 - sys.forwardVelocity * age + cyWobble;

          const prevCX = sys.prevCenterX;
          const prevCY = sys.prevCenterY;
          sys.prevCenterX = centerX;
          sys.prevCenterY = centerY;

          const rBase = sys.ringRadiusBasePx + sys.expansionRate * age;
          const squashY = 0.64;
          const dTheta = sys.forwardVelocity / Math.max(30, rBase);

          for (let pi = sys.particles.length - 1; pi >= 0; pi--) {
            const p = sys.particles[pi];
            p.life -= dt * (1 + breakT * sys.ringBreakupRate * 0.35);
            if (p.life <= 0) {
              sys.particles.splice(pi, 1);
              continue;
            }

            const bN = ringBreakN(p.theta0, age, sys.seed + p.gapPhase);
            const breakCut = breakT <= 0 ? 1 : clamp(1 - breakT * sys.ringBreakupRate * (0.18 + 0.82 * (1 - bN)), 0.02, 1);
            p.alpha = p.alphaBase * breakCut * (0.92 + 0.08 * (1 - ageT));

            const edgeJ = (bN - 0.5) * 2;
            const radial =
              rBase +
              p.radialOffset +
              edgeJ * sys.edgeNoise * (sys.ringThicknessPx * (0.10 + 0.22 * ageT)) +
              Math.sin(age * 6.0 + p.gapPhase) * sys.edgeNoise * (sys.ringThicknessPx * 0.03) * breakT;

            const theta = p.theta0 + dTheta * age * (1 + 0.12 * edgeJ * breakT) + Math.sin(age * 2.8 + p.gapPhase) * 0.05 * sys.edgeNoise * breakT;

            p.x = centerX + Math.cos(theta) * radial;
            p.y = centerY + Math.sin(theta) * radial * squashY;

            const drdt = sys.expansionRate + edgeJ * sys.edgeNoise * sys.ringThicknessPx * 0.04;
            p.vx = -Math.sin(theta) * dTheta * radial + Math.cos(theta) * drdt;
            p.vy = -sys.forwardVelocity + Math.cos(theta) * dTheta * radial * squashY + Math.sin(theta) * drdt * squashY;

            p.rotation = theta + Math.PI / 2 + (edgeJ * sys.edgeNoise * 0.34 + (1 - bN) * 0.22) * breakT;
            p.stretch = clamp(p.stretch * (1 + dt * (0.05 + 0.15 * breakT) * (0.7 + 0.3 * bN)), 1.0, 5.6);
          }

          const ringTailCap = Math.floor(sys.particles.length * 0.45 + sys.systemLife * 12);
          sys.tailAcc += dt * (2 + 12 * sys.trailingSmokeAmount * sys.power01) * (0.35 + 0.65 * (1 - ageT));
          while (sys.tailAcc >= 1) {
            sys.tailAcc -= 1;
            if (sys.trailing.length >= ringTailCap || sys.trailing.length >= caps.normalWispCap * 2) break;

            const backX = lerp(prevCX, centerX, 0.25 + Math.random() * 0.25);
            const backY = lerp(prevCY, centerY, 0.25 + Math.random() * 0.25);
            const n = ringBreakN(backX * 0.01, age + 0.02, sys.seed + 123.4);
            const ang = (n - 0.5) * Math.PI * 0.35 + (Math.random() - 0.5) * 0.25;

            const f = smokeTurbulenceVec2(backX, backY, nowSec, sys.seed + 700 + sys.trailing.length * 11.3, 0.7);

            sys.trailing.push({
              kind: "wisp",
              x: backX + Math.cos(ang) * sys.ringThicknessPx * rand(-0.10, 0.24),
              y: backY + Math.sin(ang) * sys.ringThicknessPx * rand(-0.14, 0.22),
              vx: f.vx * 90 + rand(-35, 35),
              vy: f.vy * 80 - sys.forwardVelocity * 0.08 + rand(-10, 10),
              size: sys.minDim * rand(0.0035, 0.0078) * (0.75 + sys.power01 * 0.65),
              alpha: rand(0.035, 0.085) * (0.35 + sys.power01 * 0.65),
              life: rand(0.55, 1.05) * (0.7 + 0.6 * (1 - ageT)),
              maxLife: rand(0.55, 1.05) * (0.7 + 0.6 * (1 - ageT)),
              turbulenceSeed: sys.seed + 900 + sys.trailing.length * 17.77,
              stretch: rand(2.15, 4.2),
              rotation: rand(-Math.PI, Math.PI),
              softness: rand(0.72, 0.98),
            });
          }

          for (let ti = sys.trailing.length - 1; ti >= 0; ti--) {
            const p = sys.trailing[ti];
            p.life -= dt;
            if (p.life <= 0) {
              sys.trailing.splice(ti, 1);
              continue;
            }
            const t01 = 1 - p.life / Math.max(0.0001, p.maxLife);

            const f = smokeTurbulenceVec2(p.x, p.y, nowSec, p.turbulenceSeed, 0.7);
            const drag = Math.exp(-1.18 * dt * (0.9 + 0.2 * (1 - t01)));

            p.vx = p.vx * drag + f.vx * 95 * dt + driftX * 10 * dt;
            p.vy = p.vy * drag + (f.vy * 60 * dt - 120 * dt * (0.35 + 0.65 * (1 - t01)));

            p.x += p.vx * dt;
            p.y += p.vy * dt;

            p.rotation += (f.vx - f.vy) * 0.2 * dt + (p.vx * 0.0004 - p.vy * 0.0002) * dt;
            p.stretch = clamp(p.stretch * (1 + 0.04 * dt * (0.65 + 0.35 * t01)), 1.6, 6.0);
            p.x = clamp(p.x, -w * 0.25, w * 1.25);
            p.y = clamp(p.y, -h * 0.25, h * 1.15);
          }
        }
      }

      // --------------------------------------------
      // 3) Render
      // --------------------------------------------
      if (currentMode === "normal") {
        // wisps/soft behind, dense core on top(screen)
        ctx.globalCompositeOperation = "source-over";
        for (let i = 0; i < normalParticlesRef.current.length; i++) {
          const p = normalParticlesRef.current[i];
          if (p.kind !== "wisp") continue;
          renderSmokeParticle(ctx, p, nowSec, smokeSeedRef.current, qualityLevel);
        }

        for (let i = 0; i < normalParticlesRef.current.length; i++) {
          const p = normalParticlesRef.current[i];
          if (p.kind !== "soft") continue;
          renderSmokeParticle(ctx, p, nowSec, smokeSeedRef.current, qualityLevel);
        }

        ctx.globalCompositeOperation = "screen";
        for (let i = 0; i < normalParticlesRef.current.length; i++) {
          const p = normalParticlesRef.current[i];
          if (p.kind !== "core") continue;
          renderSmokeParticle(ctx, p, nowSec, smokeSeedRef.current, qualityLevel);
        }
      } else {
        const systems = ringSystemsRef.current;
        for (let si = 0; si < systems.length; si++) {
          const sys = systems[si];

          ctx.globalCompositeOperation = "source-over";
          for (let ti = 0; ti < sys.trailing.length; ti++) {
            renderSmokeParticle(ctx, sys.trailing[ti], nowSec, smokeSeedRef.current, qualityLevel);
          }

          for (let pi = 0; pi < sys.particles.length; pi++) {
            const p = sys.particles[pi];
            ctx.globalCompositeOperation = p.kind === "soft" ? "screen" : "source-over";
            renderSmokeParticle(ctx, p, nowSec, smokeSeedRef.current, qualityLevel);
          }
        }
      }

      rafRef.current = requestAnimationFrame(step);
    };

    rafRef.current = requestAnimationFrame(step);

    const onResize = () => {
      const curQuality = pickQualityLevel(lowPowerRef.current, intensityRef.current);
      resize(getCaps(curQuality).dprCap);
    };
    window.addEventListener("resize", onResize);

    return () => {
      mounted = false;
      window.removeEventListener("resize", onResize);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [canvasRef]);
}
 
/* "use client"; (legacy blob engine code below is ignored)

import type { RefObject } from "react";
import { useEffect, useRef } from "react";
import type { SmokeMode } from "@/types/smokeMode";
import type { EmitterPoint } from "@/store/usePressInteractionStore";
import { clamp, lerp } from "@/lib/noise";

import { emitNormalSmoke } from "@/components/smoke/emitters/normalSmokeEmitter";
import { emitDonutRingSystem, type RingSystem } from "@/components/smoke/emitters/donutSmokeEmitter";
import { normalSmokePreset, smokeQualityDefaults } from "@/components/smoke/smokePresets";
import { ringBreakN, smokeTurbulenceVec2 } from "@/components/smoke/utils/noise";
import type { SmokeParticleLike } from "@/components/smoke/utils/renderSmokeParticle";
import { getQualityFrameFade, renderSmokeParticle } from "@/components/smoke/utils/renderSmokeParticle";

type QualityLevel = "low" | "medium" | "high";

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

function smoothstep01(t: number) {
  const x = clamp01(t);
  return x * x * (3 - 2 * x);
}

function pickQualityLevel(lowPower: boolean, intensity: number): QualityLevel {
  if (lowPower) return "low";
  const i01 = clamp01(intensity / 1.5);
  if (i01 > 0.82) return "high";
  return "medium";
}

function getCaps(qualityLevel: QualityLevel) {
  const c = smokeQualityDefaults;
  if (qualityLevel === "low") {
    return {
      dprCap: 1.6,
      normalTotalCap: c.normalCoreCapLow + c.normalSoftCapLow + c.normalWispCapLow,
      ringSystemCap: c.ringSystemCapLow,
      ringParticlePerSystem: c.ringParticlePerSystemLow,
      ringParticleCap: c.ringParticleCapLow,
      normalWispCap: c.normalWispCapLow,
    };
  }
  if (qualityLevel === "medium") {
    return {
      dprCap: 1.85,
      normalTotalCap: c.normalCoreCapMedium + c.normalSoftCapMedium + c.normalWispCapMedium,
      ringSystemCap: c.ringSystemCapMedium,
      ringParticlePerSystem: c.ringParticlePerSystemMedium,
      ringParticleCap: c.ringParticleCapMedium,
      normalWispCap: c.normalWispCapMedium,
    };
  }
  return {
    dprCap: 2.0,
    normalTotalCap: c.normalCoreCapHigh + c.normalSoftCapHigh + c.normalWispCapHigh,
    ringSystemCap: c.ringSystemCapHigh,
    ringParticlePerSystem: c.ringParticlePerSystemHigh,
    ringParticleCap: c.ringParticleCapHigh,
    normalWispCap: c.normalWispCapHigh,
  };
}

export function useSmokeEngine(
  canvasRef: RefObject<HTMLCanvasElement | null>,
  { pressing, smokeMode, intensity, emitter, lowPower }: { pressing: boolean; smokeMode: SmokeMode; intensity: number; emitter: EmitterPoint | null; lowPower: boolean }
) {
  const normalParticlesRef = useRef<SmokeParticleLike[]>([]);
  const ringSystemsRef = useRef<RingSystem[]>([]);

  const pressingRef = useRef(pressing);
  const smokeModeRef = useRef(smokeMode);
  const intensityRef = useRef(intensity);
  const emitterRef = useRef(emitter);
  const lowPowerRef = useRef(lowPower);

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

  const pressAgeRef = useRef(0);
  const prevPressingRef = useRef(false);

  const normalEmitAccRef = useRef(0);
  const streamIdRef = useRef(0);

  const ringAccRef = useRef(0);
  const nextRingIntervalRef = useRef(0.26);
  const ringSystemIndexRef = useRef(0);

  const rafRef = useRef<number | null>(null);
  const rectRef = useRef<DOMRect | null>(null);

  // renderSmokeParticle의 stamp seed로 사용(패턴 반복 방지)
  const smokeSeedRef = useRef<number>(7777);

  // smokeMode 변경 시 기존 배열을 정리해서 “normal → donut” 전환 시 혼합을 줄인다.
  const prevModeRef = useRef<SmokeMode>(smokeMode);

  useEffect(() => {
    prevModeRef.current = smokeMode;
  }, [smokeMode]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    ctx.imageSmoothingEnabled = true;
    (ctx as unknown as { imageSmoothingQuality?: string }).imageSmoothingQuality = "high";

    let mounted = true;

    const resize = (dprCap: number) => {
      const rect = canvas.getBoundingClientRect();
      rectRef.current = rect;
      const dprRaw = window.devicePixelRatio || 1;
      const dpr = Math.max(1, Math.min(dprCap, dprRaw));
      canvas.width = Math.floor(rect.width * dpr);
      canvas.height = Math.floor(rect.height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    // initial dpr based on mount props
    resize(getCaps(pickQualityLevel(lowPowerRef.current, intensityRef.current)).dprCap);

    let lastAt = performance.now();

    const step = (now: number) => {
      if (!mounted) return;

      const dtMs = Math.max(0, now - lastAt);
      lastAt = now;
      const dt = Math.min(0.05, dtMs / 1000);
      if (dt <= 0) {
        rafRef.current = requestAnimationFrame(step);
        return;
      }

      const rect = rectRef.current;
      const w = rect ? rect.width : canvas.clientWidth;
      const h = rect ? rect.height : canvas.clientHeight;
      const nowSec = now / 1000;

      const isPressing = pressingRef.current;
      const currentMode = smokeModeRef.current;
      const currentIntensity = intensityRef.current;
      const currentEmitter = emitterRef.current;
      const currentLowPower = lowPowerRef.current;

      const qualityLevel = pickQualityLevel(currentLowPower, currentIntensity);
      const caps = getCaps(qualityLevel);

      // press ramp
      if (isPressing) {
        const wasPressing = prevPressingRef.current;
        if (!wasPressing) pressAgeRef.current = 0;
        pressAgeRef.current += dt;
      } else {
        pressAgeRef.current = 0;
      }
      prevPressingRef.current = isPressing;

      const ramp01 = smoothstep01(pressAgeRef.current / 0.22);

      const intensity01 = clamp01(currentIntensity / 1.5);
      const effectivePower01 = isPressing ? clamp01(intensity01 * 0.92 + ramp01 * 0.45) : 0;
      const rampGate = ramp01 < 0.04 ? 0 : clamp01((ramp01 - 0.04) / 0.10);
      const power01 = effectivePower01 * rampGate;

      // anchor: 전자담배 배출구 좌표
      const nozzleX = currentEmitter && rect ? currentEmitter.clientX - rect.left : w * 0.5;
      const nozzleY = currentEmitter && rect ? currentEmitter.clientY - rect.top : h * 0.28;
      const driftX = currentEmitter ? currentEmitter.driftX : 0;

      // mode switching cleanup
      if (prevModeRef.current !== currentMode) {
        normalParticlesRef.current.splice(0, normalParticlesRef.current.length);
        ringSystemsRef.current.splice(0, ringSystemsRef.current.length);
        normalEmitAccRef.current = 0;
        ringAccRef.current = 0;
        streamIdRef.current = 0;
        ringSystemIndexRef.current = 0;
        prevModeRef.current = currentMode;
      }

      // frame persistence
      const fadeBase = getQualityFrameFade(qualityLevel);
      const fadeIdle = fadeBase * 1.35;
      const fadePress = fadeBase * (0.92 + 0.08 * (1 - power01));
      const fade = isPressing ? lerp(fadeIdle, fadePress, ramp01) : fadeIdle;

      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = `rgba(0,0,0,${fade})`;
      ctx.fillRect(0, 0, w, h);

      // --------------------------------------------
      // 1) Emission
      // --------------------------------------------
      if (isPressing && power01 > 0.001) {
        if (currentMode === "normal") {
          const pressGain = 0.25 + 0.75 * power01;
          const rampGain = 0.55 + 0.45 * ramp01;
          const qualityGain = qualityLevel === "low" ? 0.82 : qualityLevel === "medium" ? 0.98 : 1.10;

          normalEmitAccRef.current += dt * normalSmokePreset.emissionRate * pressGain * rampGain * qualityGain;
          const spawnCount = Math.min(220, Math.floor(normalEmitAccRef.current));
          if (spawnCount > 0) {
            normalEmitAccRef.current -= spawnCount;
            streamIdRef.current++;
            emitNormalSmoke({
              particles: normalParticlesRef.current,
              maxTotal: caps.normalTotalCap,
              nozzleX,
              nozzleY,
              driftX,
              power01,
              ramp01,
              qualityLevel,
              nowSec,
              streamSeed: smokeSeedRef.current + streamIdRef.current * 123.77,
              spawnCount,
            });
          }
        } else {
          ringAccRef.current += dt;
          if (ringAccRef.current >= nextRingIntervalRef.current) {
            ringAccRef.current = 0;
            nextRingIntervalRef.current = lerp(0.18, 0.34, Math.random()) * (0.95 + 0.10 * (1 - power01));

            emitDonutRingSystem({
              ringSystems: ringSystemsRef.current,
              maxSystems: caps.ringSystemCap,
              nozzleX,
              nozzleY,
              driftX,
              power01,
              ramp01,
              nowSec,
              qualityLevel,
              bounds: { w, h },
              seed: smokeSeedRef.current + ringSystemIndexRef.current * 991.3 + Math.floor(power01 * 1000),
              ringParticleCount: caps.ringParticlePerSystem,
            });
            ringSystemIndexRef.current++;
          }
        }
      }

      // --------------------------------------------
      // 2) Physics update
      // --------------------------------------------
      if (currentMode === "normal") {
        const list = normalParticlesRef.current;
        for (let i = list.length - 1; i >= 0; i--) {
          const p = list[i];
          p.life -= dt;
          if (p.life <= 0) {
            list.splice(i, 1);
            continue;
          }

          const ageT = 1 - p.life / Math.max(0.0001, p.maxLife);
          const strength = p.kind === "core" ? 1.0 : p.kind === "soft" ? 0.85 : 0.72;
          const f = smokeTurbulenceVec2(p.x, p.y, nowSec, p.turbulenceSeed, strength);

          const dragPerSec = p.kind === "core" ? 1.02 : p.kind === "soft" ? 1.12 : 1.22;
          const drag = Math.exp(-dragPerSec * dt * (0.92 + 0.22 * (1 - ageT)));

          p.vx = p.vx * drag + f.vx * (normalSmokePreset.driftAmount * 0.05) * dt;
          p.vx += driftX * (normalSmokePreset.driftAmount * 0.0025) * dt * (0.6 + 0.4 * (1 - ageT));

          const buoy = p.kind === "core" ? 210 : p.kind === "soft" ? 150 : 120;
          const buoyK = 0.55 + 0.45 * (1 - ageT);
          p.vy = p.vy * drag + (f.vy * buoy * 0.015 - buoy * buoyK) * dt;

          p.x += p.vx * dt;
          p.y += p.vy * dt;

          p.rotation += (f.vx - f.vy) * 0.16 * dt + (p.vx * 0.00045 - p.vy * 0.00025) * (0.5 + ageT) * dt;

          const stretchGrowth = p.kind === "wisp" ? 0.05 : p.kind === "soft" ? 0.035 : 0.025;
          p.stretch = clamp(p.stretch * (1 + stretchGrowth * dt * (0.65 + 0.35 * ageT)), p.kind === "wisp" ? 1.4 : 1.0, p.kind === "wisp" ? 5.4 : 3.4);

          p.x = clamp(p.x, -w * 0.25, w * 1.25);
          p.y = clamp(p.y, -h * 0.25, h * 1.15);
        }
      } else {
        const systems = ringSystemsRef.current;
        for (let si = systems.length - 1; si >= 0; si--) {
          const sys = systems[si];
          const age = nowSec - sys.bornAtSec;
          if (age >= sys.systemLife) {
            systems.splice(si, 1);
            continue;
          }

          const ageT = age / sys.systemLife;
          const breakStart = 0.12 + 0.10 * (1 - sys.power01);
          const breakT = age <= breakStart ? 0 : clamp((age - breakStart) / 0.72, 0, 1);

          const cxWobble = Math.sin(age * 1.7 + sys.seed * 0.001) * 7.5 * sys.edgeNoise * 0.18;
          const cyWobble = Math.cos(age * 1.2 + sys.seed * 0.002) * 5.0 * sys.edgeNoise * 0.11;

          const centerX = sys.centerX0 + driftX * 12 * Math.min(1, age * 0.7) + cxWobble;
          const centerY = sys.centerY0 - sys.forwardVelocity * age + cyWobble;

          const prevCX = sys.prevCenterX;
          const prevCY = sys.prevCenterY;
          sys.prevCenterX = centerX;
          sys.prevCenterY = centerY;

          const rBase = sys.ringRadiusBasePx + sys.expansionRate * age;
          const squashY = 0.64;
          const dTheta = sys.forwardVelocity / Math.max(30, rBase);

          for (let pi = sys.particles.length - 1; pi >= 0; pi--) {
            const p = sys.particles[pi];
            p.life -= dt * (1 + breakT * sys.ringBreakupRate * 0.35);
            if (p.life <= 0) {
              sys.particles.splice(pi, 1);
              continue;
            }

            const bN = ringBreakN(p.theta0, age, sys.seed + p.gapPhase);
            const breakCut = breakT <= 0 ? 1 : clamp(1 - breakT * sys.ringBreakupRate * (0.18 + 0.82 * (1 - bN)), 0.02, 1);
            p.alpha = p.alphaBase * breakCut * (0.92 + 0.08 * (1 - ageT));

            const edgeJ = (bN - 0.5) * 2;
            const radial =
              rBase +
              p.radialOffset +
              edgeJ * sys.edgeNoise * (sys.ringThicknessPx * (0.10 + 0.22 * ageT)) +
              Math.sin(age * 6.0 + p.gapPhase) * sys.edgeNoise * (sys.ringThicknessPx * 0.03) * breakT;

            const theta = p.theta0 + dTheta * age * (1 + 0.12 * edgeJ * breakT) + Math.sin(age * 2.8 + p.gapPhase) * 0.05 * sys.edgeNoise * breakT;

            p.x = centerX + Math.cos(theta) * radial;
            p.y = centerY + Math.sin(theta) * radial * squashY;

            const drdt = sys.expansionRate + edgeJ * sys.edgeNoise * sys.ringThicknessPx * 0.04;
            p.vx = -Math.sin(theta) * dTheta * radial + Math.cos(theta) * drdt;
            p.vy = -sys.forwardVelocity + Math.cos(theta) * dTheta * radial * squashY + Math.sin(theta) * drdt * squashY;

            p.rotation = theta + Math.PI / 2 + (edgeJ * sys.edgeNoise * 0.34 + (1 - bN) * 0.22) * breakT;
            p.stretch = clamp(p.stretch * (1 + dt * (0.05 + 0.15 * breakT) * (0.7 + 0.3 * bN)), 1.0, 5.6);
          }

          // trailing wisps emission + physics
          const ringTailCap = Math.floor(sys.particles.length * 0.45 + sys.systemLife * 12);
          sys.tailAcc += dt * (2 + 12 * sys.trailingSmokeAmount * sys.power01) * (0.35 + 0.65 * (1 - ageT));
          while (sys.tailAcc >= 1) {
            sys.tailAcc -= 1;
            if (sys.trailing.length >= ringTailCap || sys.trailing.length >= caps.normalWispCap * 2) break;

            const backX = lerp(prevCX, centerX, 0.25 + Math.random() * 0.25);
            const backY = lerp(prevCY, centerY, 0.25 + Math.random() * 0.25);
            const n = ringBreakN(backX * 0.01, age + 0.02, sys.seed + 123.4);
            const ang = (n - 0.5) * Math.PI * 0.35 + (Math.random() - 0.5) * 0.25;

            const f = smokeTurbulenceVec2(backX, backY, nowSec, sys.seed + 700 + sys.trailing.length * 11.3, 0.7);

            sys.trailing.push({
              kind: "wisp",
              x: backX + Math.cos(ang) * sys.ringThicknessPx * (Math.random() * 0.34 - 0.10),
              y: backY + Math.sin(ang) * sys.ringThicknessPx * (Math.random() * 0.36 - 0.14),
              vx: f.vx * 90 + (Math.random() * 70 - 35),
              vy: f.vy * 80 - sys.forwardVelocity * 0.08 + (Math.random() * 20 - 10),
              size: sys.minDim * (Math.random() * (0.0078 - 0.0035) + 0.0035) * (0.75 + sys.power01 * 0.65),
              alpha: (Math.random() * (0.085 - 0.035) + 0.035) * (0.35 + sys.power01 * 0.65),
              life: (Math.random() * (1.05 - 0.55) + 0.55) * (0.7 + 0.6 * (1 - ageT)),
              maxLife: (Math.random() * (1.05 - 0.55) + 0.55) * (0.7 + 0.6 * (1 - ageT)),
              turbulenceSeed: sys.seed + 900 + sys.trailing.length * 17.77,
              stretch: Math.random() * (4.2 - 2.15) + 2.15,
              rotation: Math.random() * Math.PI * 2 - Math.PI,
              softness: Math.random() * (0.98 - 0.72) + 0.72,
            });
          }

          for (let ti = sys.trailing.length - 1; ti >= 0; ti--) {
            const p = sys.trailing[ti];
            p.life -= dt;
            if (p.life <= 0) {
              sys.trailing.splice(ti, 1);
              continue;
            }
            const t01 = 1 - p.life / Math.max(0.0001, p.maxLife);

            const f = smokeTurbulenceVec2(p.x, p.y, nowSec, p.turbulenceSeed, 0.7);
            const drag = Math.exp(-1.18 * dt * (0.9 + 0.2 * (1 - t01)));

            p.vx = p.vx * drag + f.vx * 95 * dt + driftX * 10 * dt;
            p.vy = p.vy * drag + (f.vy * 60 * dt - 120 * dt * (0.35 + 0.65 * (1 - t01)));

            p.x += p.vx * dt;
            p.y += p.vy * dt;

            p.rotation += (f.vx - f.vy) * 0.2 * dt + (p.vx * 0.0004 - p.vy * 0.0002) * dt;
            p.stretch = clamp(p.stretch * (1 + 0.04 * dt * (0.65 + 0.35 * t01)), 1.6, 6.0);
            p.x = clamp(p.x, -w * 0.25, w * 1.25);
            p.y = clamp(p.y, -h * 0.25, h * 1.15);
          }
        }
      }

      // --------------------------------------------
      // 3) Render
      // --------------------------------------------
      if (currentMode === "normal") {
        // wisps/soft behind, dense core on top(screen)
        ctx.globalCompositeOperation = "source-over";
        for (let i = 0; i < normalParticlesRef.current.length; i++) {
          const p = normalParticlesRef.current[i];
          if (p.kind !== "wisp") continue;
          renderSmokeParticle(ctx, p, nowSec, smokeSeedRef.current, qualityLevel);
        }

        ctx.globalCompositeOperation = "source-over";
        for (let i = 0; i < normalParticlesRef.current.length; i++) {
          const p = normalParticlesRef.current[i];
          if (p.kind !== "soft") continue;
          renderSmokeParticle(ctx, p, nowSec, smokeSeedRef.current, qualityLevel);
        }

        ctx.globalCompositeOperation = "screen";
        for (let i = 0; i < normalParticlesRef.current.length; i++) {
          const p = normalParticlesRef.current[i];
          if (p.kind !== "core") continue;
          renderSmokeParticle(ctx, p, nowSec, smokeSeedRef.current, qualityLevel);
        }
      } else {
        const systems = ringSystemsRef.current;
        for (let si = 0; si < systems.length; si++) {
          const sys = systems[si];

          // trailing (source-over)
          ctx.globalCompositeOperation = "source-over";
          for (let ti = 0; ti < sys.trailing.length; ti++) {
            renderSmokeParticle(ctx, sys.trailing[ti], nowSec, smokeSeedRef.current, qualityLevel);
          }

          // ring particles
          for (let pi = 0; pi < sys.particles.length; pi++) {
            const p = sys.particles[pi];
            ctx.globalCompositeOperation = p.kind === "soft" ? "screen" : "source-over";
            renderSmokeParticle(ctx, p, nowSec, smokeSeedRef.current, qualityLevel);
          }
        }
      }

      rafRef.current = requestAnimationFrame(step);
    };

    rafRef.current = requestAnimationFrame(step);

    const onResize = () => {
      const curQuality = pickQualityLevel(lowPowerRef.current, intensityRef.current);
      resize(getCaps(curQuality).dprCap);
    };
    window.addEventListener("resize", onResize);

    return () => {
      mounted = false;
      window.removeEventListener("resize", onResize);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [canvasRef]);
}

/* "use client"; (legacy blob engine code below is ignored)

import type { RefObject } from "react";
import { useEffect, useRef } from "react";
import type { SmokeMode } from "@/types/smokeMode";
import type { EmitterPoint } from "@/store/usePressInteractionStore";
import { clamp, lerp } from "@/lib/noise";

import { emitNormalSmoke } from "@/components/smoke/emitters/normalSmokeEmitter";
import { emitDonutRingSystem, type RingSystem } from "@/components/smoke/emitters/donutSmokeEmitter";
import { normalSmokePreset, smokeQualityDefaults } from "@/components/smoke/smokePresets";
import { ringBreakN, smokeTurbulenceVec2 } from "@/components/smoke/utils/noise";
import type { SmokeParticleLike } from "@/components/smoke/utils/renderSmokeParticle";
import { getQualityFrameFade, renderSmokeParticle } from "@/components/smoke/utils/renderSmokeParticle";

type QualityLevel = "low" | "medium" | "high";

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

function smoothstep01(t: number) {
  const x = clamp01(t);
  return x * x * (3 - 2 * x);
}

* /
function pickQualityLevel(lowPower: boolean, intensity: number): QualityLevel {
  if (lowPower) return "low";
  const i01 = clamp01(intensity / 1.5);
  if (i01 > 0.82) return "high";
  return "medium";
}

function getCaps(qualityLevel: QualityLevel) {
  const c = smokeQualityDefaults;
  if (qualityLevel === "low") {
    return {
      dprCap: 1.6,
      normalCoreCap: c.normalCoreCapLow,
      normalSoftCap: c.normalSoftCapLow,
      normalWispCap: c.normalWispCapLow,
      normalTotalCap: c.normalCoreCapLow + c.normalSoftCapLow + c.normalWispCapLow,

      ringSystemCap: c.ringSystemCapLow,
      ringParticlePerSystem: c.ringParticlePerSystemLow,

      // ring particle cap: ring system 내부 + trailing까지 포함해 조절
      ringParticleCap: c.ringParticleCapLow,
      frameFadeMul: 1.0,
    };
  }
  if (qualityLevel === "medium") {
    return {
      dprCap: 1.85,
      normalCoreCap: c.normalCoreCapMedium,
      normalSoftCap: c.normalSoftCapMedium,
      normalWispCap: c.normalWispCapMedium,
      normalTotalCap: c.normalCoreCapMedium + c.normalSoftCapMedium + c.normalWispCapMedium,

      ringSystemCap: c.ringSystemCapMedium,
      ringParticlePerSystem: c.ringParticlePerSystemMedium,
      ringParticleCap: c.ringParticleCapMedium,
      frameFadeMul: 1.0,
    };
  }
  return {
    dprCap: 2.0,
    normalCoreCap: c.normalCoreCapHigh,
    normalSoftCap: c.normalSoftCapHigh,
    normalWispCap: c.normalWispCapHigh,
    normalTotalCap: c.normalCoreCapHigh + c.normalSoftCapHigh + c.normalWispCapHigh,

    ringSystemCap: c.ringSystemCapHigh,
    ringParticlePerSystem: c.ringParticlePerSystemHigh,
    ringParticleCap: c.ringParticleCapHigh,
    frameFadeMul: 1.0,
  };
}

export function useSmokeEngine(
  canvasRef: RefObject<HTMLCanvasElement | null>,
  { pressing, smokeMode, intensity, emitter, lowPower }: { pressing: boolean; smokeMode: SmokeMode; intensity: number; emitter: EmitterPoint | null; lowPower: boolean }
) {
  const normalParticlesRef = useRef<SmokeParticleLike[]>([]);
  const ringSystemsRef = useRef<RingSystem[]>([]);

  const pressingRef = useRef(pressing);
  const smokeModeRef = useRef(smokeMode);
  const intensityRef = useRef(intensity);
  const emitterRef = useRef(emitter);
  const lowPowerRef = useRef(lowPower);

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

  const pressAgeRef = useRef(0);
  const prevPressingRef = useRef(false);

  const normalEmitAccRef = useRef(0);
  const streamIdRef = useRef(0);

  const ringAccRef = useRef(0);
  const nextRingIntervalRef = useRef(0.26);
  const ringSystemIndexRef = useRef(0);

  const rafRef = useRef<number | null>(null);
  const rectRef = useRef<DOMRect | null>(null);

  // renderSmokeParticle의 stamp seed로 사용(패턴 반복 방지 + 안정성)
  const smokeSeedRef = useRef<number>(7777);

  // smokeMode 변경 시 기존 배열을 정리해서 “normal → donut” 전환 시 잔상/혼합을 줄인다.
  const prevModeRef = useRef<SmokeMode>(smokeMode);

  useEffect(() => {
    prevModeRef.current = smokeMode;
  }, [smokeMode]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    ctx.imageSmoothingEnabled = true;
    (ctx as unknown as { imageSmoothingQuality?: string }).imageSmoothingQuality = "high";

    let mounted = true;

    const resize = (dprCap: number) => {
      const rect = canvas.getBoundingClientRect();
      rectRef.current = rect;
      const dprRaw = window.devicePixelRatio || 1;
      const dpr = Math.max(1, Math.min(dprCap, dprRaw));
      canvas.width = Math.floor(rect.width * dpr);
      canvas.height = Math.floor(rect.height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    // initial dpr cap: mount 시점 lowPower 기준(이후 quality 변화에 의해 effect가 재시작되지 않게)
    resize(getCaps(pickQualityLevel(lowPowerRef.current, intensityRef.current)).dprCap);

    let lastAt = performance.now();

    const step = (now: number) => {
      if (!mounted) return;

      const dtMs = Math.max(0, now - lastAt);
      lastAt = now;
      const dt = Math.min(0.05, dtMs / 1000);
      if (dt <= 0) {
        rafRef.current = requestAnimationFrame(step);
        return;
      }

      const rect = rectRef.current;
      const w = rect ? rect.width : canvas.clientWidth;
      const h = rect ? rect.height : canvas.clientHeight;
      const nowSec = now / 1000;

      const isPressing = pressingRef.current;
      const currentMode = smokeModeRef.current;
      const currentIntensity = intensityRef.current;
      const currentEmitter = emitterRef.current;
      const currentLowPower = lowPowerRef.current;

      // quality는 매 프레임이 아니라 "stamp/캡"의 선택 기준만 바꾸는 정도로 쓰되,
      // 배열 구조/렌더 루프는 계속 유지한다.
      const qualityLevel = pickQualityLevel(currentLowPower, currentIntensity);
      const caps = getCaps(qualityLevel);

      // press ramp
      if (isPressing) {
        const wasPressing = prevPressingRef.current;
        if (!wasPressing) pressAgeRef.current = 0;
        pressAgeRef.current += dt;
      } else {
        pressAgeRef.current = 0;
      }
      prevPressingRef.current = isPressing;

      const ramp01 = smoothstep01(pressAgeRef.current / 0.22);

      const intensity01 = clamp01(currentIntensity / 1.5);
      const effectivePower01 = isPressing ? clamp01(intensity01 * 0.92 + ramp01 * 0.45) : 0;
      const rampGate = ramp01 < 0.04 ? 0 : clamp01((ramp01 - 0.04) / 0.10);
      const power01 = effectivePower01 * rampGate;

      // anchor: 전자담배 배출구 좌표
      const nozzleX = currentEmitter && rect ? currentEmitter.clientX - rect.left : w * 0.5;
      const nozzleY = currentEmitter && rect ? currentEmitter.clientY - rect.top : h * 0.28;
      const driftX = currentEmitter ? currentEmitter.driftX : 0;

      // mode switching cleanup
      if (prevModeRef.current !== currentMode) {
        normalParticlesRef.current.splice(0, normalParticlesRef.current.length);
        ringSystemsRef.current.splice(0, ringSystemsRef.current.length);
        normalEmitAccRef.current = 0;
        ringAccRef.current = 0;
        streamIdRef.current = 0;
        ringSystemIndexRef.current = 0;
        prevModeRef.current = currentMode;
      }

      // frame persistence
      const fadeBase = getQualityFrameFade(qualityLevel) * caps.frameFadeMul;
      const fadeIdle = fadeBase * 1.35;
      const fadePress = fadeBase * (0.92 + 0.08 * (1 - power01));
      const fade = isPressing ? lerp(fadeIdle, fadePress, ramp01) : fadeIdle;

      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = `rgba(0,0,0,${fade})`;
      ctx.fillRect(0, 0, w, h);

      // --------------------------------------------
      // 1) Emission
      // --------------------------------------------
      if (isPressing && power01 > 0.001) {
        if (currentMode === "normal") {
          // 길게 누를수록 plume가 누적되지만, 뭉치지 않게 얇은 배출(코어/소프트/와이즈)
          const pressGain = 0.25 + 0.75 * power01;
          const rampGain = 0.55 + 0.45 * ramp01;
          const qualityGain = qualityLevel === "low" ? 0.82 : qualityLevel === "medium" ? 0.98 : 1.10;

          normalEmitAccRef.current += dt * normalSmokePreset.emissionRate * pressGain * rampGain * qualityGain;
          const spawnCount = Math.min(220, Math.floor(normalEmitAccRef.current));
          if (spawnCount > 0) {
            normalEmitAccRef.current -= spawnCount;
            streamIdRef.current++;
            emitNormalSmoke({
              particles: normalParticlesRef.current,
              maxTotal: caps.normalTotalCap,
              nozzleX,
              nozzleY,
              driftX,
              power01,
              ramp01,
              qualityLevel,
              nowSec,
              streamSeed: smokeSeedRef.current + streamIdRef.current * 123.77,
              spawnCount,
            });
          }
        } else {
          // donut mode: ring systems(링=입자 다발) + tail wisps
          ringAccRef.current += dt;
          if (ringAccRef.current >= nextRingIntervalRef.current) {
            ringAccRef.current = 0;
            // 링 간격: 입력 강도가 커질수록 조금 더 촘촘히(단, 너무 빠른 폭죽 금지)
            nextRingIntervalRef.current = lerp(0.18, 0.34, Math.random()) * (0.95 + 0.10 * (1 - power01));

            emitDonutRingSystem({
              ringSystems: ringSystemsRef.current,
              maxSystems: caps.ringSystemCap,
              nozzleX,
              nozzleY,
              driftX,
              power01,
              ramp01,
              nowSec,
              qualityLevel,
              bounds: { w, h },
              seed: smokeSeedRef.current + ringSystemIndexRef.current * 991.3 + Math.floor(power01 * 1000),
              ringParticleCount: caps.ringParticlePerSystem,
            });
            ringSystemIndexRef.current++;
          }
        }
      }

      // --------------------------------------------
      // 2) Physics update
      // --------------------------------------------
      if (currentMode === "normal") {
        const list = normalParticlesRef.current;
        for (let i = list.length - 1; i >= 0; i--) {
          const p = list[i];
          p.life -= dt;
          if (p.life <= 0) {
            list.splice(i, 1);
            continue;
          }

          const ageT = 1 - p.life / Math.max(0.0001, p.maxLife);
          const strength = p.kind === "core" ? 1.0 : p.kind === "soft" ? 0.85 : 0.72;

          const f = smokeTurbulenceVec2(p.x, p.y, nowSec, p.turbulenceSeed, strength);

          const dragPerSec = p.kind === "core" ? 1.02 : p.kind === "soft" ? 1.12 : 1.22;
          const drag = Math.exp(-dragPerSec * dt * (0.92 + 0.22 * (1 - ageT)));

          // 좌우/난류 drift + 얇은 측면 흐름
          p.vx = p.vx * drag + f.vx * (normalSmokePreset.driftAmount * 0.05) * dt;
          p.vx += driftX * (normalSmokePreset.driftAmount * 0.0025) * dt * (0.6 + 0.4 * (1 - ageT));

          // 위로 상승: 완전 수직 대신 f.vy와 섞어 편향(직선 이동 금지)
          const buoy = p.kind === "core" ? 210 : p.kind === "soft" ? 150 : 120;
          const buoyK = 0.55 + 0.45 * (1 - ageT);
          p.vy = p.vy * drag + (f.vy * buoy * 0.015 - buoy * buoyK) * dt;

          p.x += p.vx * dt;
          p.y += p.vy * dt;

          // 회전은 난류+속도 기반으로 살짝만 흔들어 "유동성" 확보
          p.rotation += (f.vx - f.vy) * 0.16 * dt + (p.vx * 0.00045 - p.vy * 0.00025) * (0.5 + ageT) * dt;

          // 시간 지나면 퍼짐(단, 폭발적으로 커지지 않게 stretch 제한)
          const stretchGrowth = p.kind === "wisp" ? 0.05 : p.kind === "soft" ? 0.035 : 0.025;
          p.stretch = clamp(p.stretch * (1 + stretchGrowth * dt * (0.65 + 0.35 * ageT)), p.kind === "wisp" ? 1.4 : 1.0, p.kind === "wisp" ? 5.4 : 3.4);

          // 범위 제한(오프스크린 캡과 유사)
          p.x = clamp(p.x, -w * 0.25, w * 1.25);
          p.y = clamp(p.y, -h * 0.25, h * 1.15);
        }
      } else {
        // donut mode physics (ring systems)
        const systems = ringSystemsRef.current;
        for (let si = systems.length - 1; si >= 0; si--) {
          const sys = systems[si];
          const age = nowSec - sys.bornAtSec;
          if (age >= sys.systemLife) {
            systems.splice(si, 1);
            continue;
          }

          const ageT = age / sys.systemLife; // 0..1
          const breakStart = 0.12 + 0.10 * (1 - sys.power01); // 0.1~0.22초
          const breakT = age <= breakStart ? 0 : clamp((age - breakStart) / 0.72, 0, 1);

          // ring center: 앞으로/위로
          const cxWobble = Math.sin(age * 1.7 + sys.seed * 0.001) * 7.5 * sys.edgeNoise * 0.18;
          const cyWobble = Math.cos(age * 1.2 + sys.seed * 0.002) * 5.0 * sys.edgeNoise * 0.11;

          const centerX = sys.centerX0 + driftX * 12 * Math.min(1, age * 0.7) + cxWobble;
          const centerY = sys.centerY0 - sys.forwardVelocity * age + cyWobble;

          const prevCX = sys.prevCenterX;
          const prevCY = sys.prevCenterY;
          sys.prevCenterX = centerX;
          sys.prevCenterY = centerY;

          const rBase = sys.ringRadiusBasePx + sys.expansionRate * age;
          const squashY = 0.64;
          const dTheta = sys.forwardVelocity / Math.max(30, rBase);

          // ring particles update
          for (let pi = sys.particles.length - 1; pi >= 0; pi--) {
            const p = sys.particles[pi];
            p.life -= dt * (1 + breakT * sys.ringBreakupRate * 0.35);
            if (p.life <= 0) {
              sys.particles.splice(pi, 1);
              continue;
            }

            const bN = ringBreakN(p.theta0, age, sys.seed + p.gapPhase);
            const breakCut = breakT <= 0 ? 1 : clamp(1 - breakT * sys.ringBreakupRate * (0.18 + 0.82 * (1 - bN)), 0.02, 1);

            // α는 base에서 계산(누적(compound) 방지)
            p.alpha = p.alphaBase * breakCut * (0.92 + 0.08 * (1 - ageT));

            // 각도/반지름의 edge noise로 링이 찢어지며 흐트러짐
            const edgeJ = (bN - 0.5) * 2; // -1..1
            const radial =
              rBase +
              p.radialOffset +
              edgeJ * sys.edgeNoise * (sys.ringThicknessPx * (0.10 + 0.22 * ageT)) +
              Math.sin(age * 6.0 + p.gapPhase) * sys.edgeNoise * (sys.ringThicknessPx * 0.03) * breakT;

            // theta는 완전한 기하학이 아니게 noise 기반으로 미세 변화
            const theta = p.theta0 + dTheta * age * (1 + 0.12 * edgeJ * breakT) + Math.sin(age * 2.8 + p.gapPhase) * 0.05 * sys.edgeNoise * breakT;

            // 3D ring 느낌을 위한 y-squash + 중심 비움 유지(입자 radialOffset 분포)
            p.x = centerX + Math.cos(theta) * radial;
            p.y = centerY + Math.sin(theta) * radial * squashY;

            // 회전에 쓰기 위한 속도(대략 미분 기반)
            const drdt = sys.expansionRate + edgeJ * sys.edgeNoise * sys.ringThicknessPx * 0.04;
            p.vx = -Math.sin(theta) * dTheta * radial + Math.cos(theta) * drdt;
            p.vy = -sys.forwardVelocity + Math.cos(theta) * dTheta * radial * squashY + Math.sin(theta) * drdt * squashY;

            // 찢어질 때 stretch/rotation이 살아야 링이 “살아있다”로 보임
            const tearK = 0.35 + 0.65 * (1 - breakT);
            p.rotation = theta + Math.PI / 2 + (edgeJ * sys.edgeNoise * 0.34 + (1 - bN) * 0.22) * breakT;
            p.stretch = clamp(p.stretch * (1 + dt * (0.05 + 0.15 * breakT) * (0.7 + 0.3 * bN)), 1.0, 5.6);
          }

          // trailing wisps emission + physics
          const ringTailCap = Math.floor(sys.particles.length * 0.45 + sys.systemLife * 12);
          sys.tailAcc += dt * (2 + 12 * sys.trailingSmokeAmount * sys.power01) * (0.35 + 0.65 * (1 - ageT));
          while (sys.tailAcc >= 1) {
            sys.tailAcc -= 1;
            if (sys.trailing.length >= ringTailCap || sys.trailing.length >= caps.normalWispCap * 2) break;

            const backX = lerp(prevCX, centerX, 0.25 + Math.random() * 0.25);
            const backY = lerp(prevCY, centerY, 0.25 + Math.random() * 0.25);
            const n = ringBreakN(backX * 0.01, age + 0.02, sys.seed + 123.4);
            const ang = (n - 0.5) * Math.PI * 0.35 + (Math.random() - 0.5) * 0.25;

            const f = smokeTurbulenceVec2(backX, backY, nowSec, sys.seed + 700 + sys.trailing.length * 11.3, 0.7);

            sys.trailing.push({
              kind: "wisp",
              x: backX + Math.cos(ang) * sys.ringThicknessPx * rand(-0.10, 0.24),
              y: backY + Math.sin(ang) * sys.ringThicknessPx * rand(-0.14, 0.22),
              vx: f.vx * 90 + rand(-35, 35),
              vy: f.vy * 80 - sys.forwardVelocity * 0.08 + rand(-10, 10),
              size: sys.minDim * rand(0.0035, 0.0078) * (0.75 + sys.power01 * 0.65),
              alpha: rand(0.035, 0.085) * (0.35 + sys.power01 * 0.65),
              life: rand(0.55, 1.05) * (0.7 + 0.6 * (1 - ageT)),
              maxLife: rand(0.55, 1.05) * (0.7 + 0.6 * (1 - ageT)),
              turbulenceSeed: sys.seed + 900 + sys.trailing.length * 17.77,
              stretch: rand(2.15, 4.2),
              rotation: rand(-Math.PI, Math.PI),
              softness: rand(0.72, 0.98),
            });
          }

          // update trailing particles with normal-like physics
          for (let ti = sys.trailing.length - 1; ti >= 0; ti--) {
            const p = sys.trailing[ti];
            p.life -= dt;
            if (p.life <= 0) {
              sys.trailing.splice(ti, 1);
              continue;
            }
            const t01 = 1 - p.life / Math.max(0.0001, p.maxLife);

            const f = smokeTurbulenceVec2(p.x, p.y, nowSec, p.turbulenceSeed, 0.7);
            const drag = Math.exp(-1.18 * dt * (0.9 + 0.2 * (1 - t01)));

            p.vx = p.vx * drag + f.vx * 95 * dt + driftX * 10 * dt;
            p.vy = p.vy * drag + (f.vy * 60 * dt - 120 * dt * (0.35 + 0.65 * (1 - t01)));

            p.x += p.vx * dt;
            p.y += p.vy * dt;

            p.rotation += (f.vx - f.vy) * 0.2 * dt + (p.vx * 0.0004 - p.vy * 0.0002) * dt;
            p.stretch = clamp(p.stretch * (1 + 0.04 * dt * (0.65 + 0.35 * t01)), 1.6, 6.0);
            p.x = clamp(p.x, -w * 0.25, w * 1.25);
            p.y = clamp(p.y, -h * 0.25, h * 1.15);
          }
        }
      }

      // --------------------------------------------
      // 3) Render
      // --------------------------------------------
      ctx.globalCompositeOperation = "source-over";

      if (currentMode === "normal") {
        // layer overlap: wisps/soft behind, dense core on top(screen)
        for (let i = 0; i < normalParticlesRef.current.length; i++) {
          const p = normalParticlesRef.current[i];
          if (p.kind !== "wisp") continue;
          renderSmokeParticle(ctx, p, nowSec, smokeSeedRef.current, qualityLevel);
        }

        ctx.globalCompositeOperation = "source-over";
        for (let i = 0; i < normalParticlesRef.current.length; i++) {
          const p = normalParticlesRef.current[i];
          if (p.kind !== "soft") continue;
          renderSmokeParticle(ctx, p, nowSec, smokeSeedRef.current, qualityLevel);
        }

        ctx.globalCompositeOperation = "screen";
        for (let i = 0; i < normalParticlesRef.current.length; i++) {
          const p = normalParticlesRef.current[i];
          if (p.kind !== "core") continue;
          renderSmokeParticle(ctx, p, nowSec, smokeSeedRef.current, qualityLevel);
        }
      } else {
        // donut: ring edges first(소량), tail slightly weaker
        const systems = ringSystemsRef.current;
        for (let si = 0; si < systems.length; si++) {
          const sys = systems[si];

          // trailing (source-over)
          for (let ti = 0; ti < sys.trailing.length; ti++) {
            ctx.globalCompositeOperation = "source-over";
            renderSmokeParticle(ctx, sys.trailing[ti], nowSec, smokeSeedRef.current, qualityLevel);
          }

          // ring particles: outer feel on screen, inner(wisp) on source-over
          for (let pi = 0; pi < sys.particles.length; pi++) {
            const p = sys.particles[pi];
            ctx.globalCompositeOperation = p.kind === "soft" ? "screen" : "source-over";
            renderSmokeParticle(ctx, p, nowSec, smokeSeedRef.current, qualityLevel);
          }
        }
      }

      rafRef.current = requestAnimationFrame(step);
    };

    rafRef.current = requestAnimationFrame(step);

    const onResize = () => {
      // 캔버스 리스케일은 dprCap 기반으로만 업데이트
      const curQuality = pickQualityLevel(lowPowerRef.current, intensityRef.current);
      resize(getCaps(curQuality).dprCap);
    };
    window.addEventListener("resize", onResize);

    return () => {
      mounted = false;
      window.removeEventListener("resize", onResize);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [canvasRef]);
}

"use client";

import type { RefObject } from "react";
import { useEffect, useMemo, useRef } from "react";
import type { SmokeMode } from "@/types/smokeMode";
import type { EmitterPoint } from "@/store/usePressInteractionStore";
import type { SmokeBlob, SmokeLayerType } from "@/types/smoke";

import { emitPlumeCluster, stepPlume, drawPlume } from "@/components/smoke/DensePlumeLayer";
import { emitBodyCluster, stepBody, drawBody } from "@/components/smoke/TurbulentBodyLayer";
import { emitDiffuseCluster, stepDiffuse, drawDiffuse } from "@/components/smoke/DiffuseFadeLayer";
import { emitAmbient, stepAmbient, drawAmbient } from "@/components/smoke/AmbientSmokeLayer";
import { emitRingCluster, stepRing, drawRing } from "@/components/smoke/RingSmokeLayer";
import { lerp } from "@/components/smoke/util";

// NOTE: DensePlumeLayer 파일은 export가 emit/step/draw 단위라서
// 여기 import 문법을 간단히 정리하기 위해 아래 형태로만 사용한다.

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

function smoothstep01(t: number) {
  const x = clamp01(t);
  return x * x * (3 - 2 * x);
}

export function useSmokeEngine(
  canvasRef: RefObject<HTMLCanvasElement | null>,
  {
    pressing,
    smokeMode,
    intensity,
    emitter,
    lowPower,
  }: { pressing: boolean; smokeMode: SmokeMode; intensity: number; emitter: EmitterPoint | null; lowPower: boolean }
) {
  const blobsRef = useRef<Record<SmokeLayerType, SmokeBlob[]>>({
    plume: [],
    body: [],
    diffuse: [],
    ambient: [],
    ring: [],
  });

  const pressAgeRef = useRef(0);
  const prevPressingRef = useRef(false);

  const plumeAccRef = useRef(0);
  const bodyAccRef = useRef(0);
  const diffuseAccRef = useRef(0);

  const ringAccRef = useRef(0);
  const nextRingIntervalRef = useRef(0.30);

  const rafRef = useRef<number | null>(null);
  const rectRef = useRef<DOMRect | null>(null);

  const quality = useMemo(() => {
    return {
      dprCap: lowPower ? 1.6 : 2.0,
      fadeBase: lowPower ? 0.042 : 0.034,
      // persistent trail helps fill volume
      fadeTail: lowPower ? 0.0105 : 0.0085,

      // max blob budget (요구: 120~200 사이)
      plumeMax: lowPower ? 72 : 90,
      bodyMax: lowPower ? 90 : 125,
      diffuseMax: lowPower ? 60 : 85,
      ambientMax: lowPower ? 30 : 42,
      ringMax: lowPower ? 40 : 58,

      // ambient target should keep screen filled
      ambientTarget: lowPower ? 22 : 30,

      // cluster emission rates (clusters/sec at power=1)
      plumeRate: lowPower ? 12 : 16,
      bodyRate: lowPower ? 10 : 14,
      diffuseRate: lowPower ? 8 : 12,

      // ring interval bounds (sec)
      ringMinInterval: 0.18,
      ringMaxInterval: 0.36,
    };
  }, [lowPower]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    ctx.imageSmoothingEnabled = true;
    // `imageSmoothingQuality`는 일부 타입 정의/브라우저에서 지원하지 않을 수 있어 안전하게 처리
    (ctx as unknown as { imageSmoothingQuality?: string }).imageSmoothingQuality = "high";

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
    window.addEventListener("resize", resize);

    let lastAt = performance.now();
    const step = (now: number) => {
      if (!mounted) return;

      const dtMs = Math.max(0, now - lastAt);
      lastAt = now;
      const dt = Math.min(0.05, dtMs / 1000);

      const rect = rectRef.current;
      const w = rect ? rect.width : canvas.clientWidth;
      const h = rect ? rect.height : canvas.clientHeight;

      const nowSec = now / 1000;

      const isPressing = pressing;
      const intensity01 = clamp01(intensity / 1.5);

      // press ramp-up density (0.1~0.25초)
      if (isPressing) {
        const wasPressing = prevPressingRef.current;
        if (!wasPressing) pressAgeRef.current = 0;
        pressAgeRef.current += dt;
      } else {
        pressAgeRef.current = 0;
      }
      prevPressingRef.current = isPressing;
      const ramp01 = smoothstep01(pressAgeRef.current / 0.22);

      // intensity(스토어 값)가 0으로 시작하더라도 ramp-up만으로 안정적인 “첫 연기”가 나오도록 power를 조합
      // (깜빡임 완화: power가 초기에 0으로만 머무르지 않도록)
      const effectivePower01 = isPressing ? clamp01(intensity01 * 0.92 + ramp01 * 0.45) : 0;

      // 추가 게이트: press ramp 초반에 코어 스폰/강도가 급상승하면 “깜빡임”이 생긴다.
      // ramp01이 어느 정도 올라온 뒤에 gatedPower01로 스폰을 시작한다.
      const rampGate = ramp01 < 0.04 ? 0 : clamp01((ramp01 - 0.04) / 0.10);
      const gatedPower01 = effectivePower01 * rampGate;

      const nozzleX =
        emitter && rect ? emitter.clientX - rect.left : w * 0.5;
      const nozzleY =
        emitter && rect ? emitter.clientY - rect.top : h * 0.28;
      const driftX = emitter ? emitter.driftX : 0;

      // background persistence (source-over only)
      // fade는 isPressing 기준으로 거의 고정 (초기 프레임에서 power에 따라 급변하지 않게)
      // 첫 프레임 깜빡임 완화:
      // press 토글 시 fade가 즉시 바뀌면, plume screen 코어가 한 프레임에 급노출될 수 있다.
      // 따라서 fade 자체를 ramp01 기반으로 부드럽게 보간한다.
      const fadeIdle = quality.fadeBase + quality.fadeTail * 0.78;
      const fadePress = quality.fadeBase + quality.fadeTail * 0.28;
      const fade = isPressing ? lerp(fadeIdle, fadePress, ramp01) : fadeIdle;
      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = `rgba(0,0,0,${fade})`;
      ctx.fillRect(0, 0, w, h);

      const forceScale = 1 + gatedPower01 * 0.8;

      const plume = blobsRef.current.plume;
      const body = blobsRef.current.body;
      const diffuse = blobsRef.current.diffuse;
      const ambient = blobsRef.current.ambient;
      const ring = blobsRef.current.ring;

      // 1) Ambient layer
      // - idle(클릭 전)에는 배경 연무를 제거(=ambient 미스폰 + 기존 blob 즉시 정리)
      // - pointerdown 동안에는 ramp-up에 따라 점점 커지며 “배경을 휘몰아치는” 느낌을 만든다.
      if (!isPressing) {
        if (ambient.length) ambient.splice(0, ambient.length);
      } else {
        const ambientPower01 = clamp01(0.22 + gatedPower01 * 0.55) * (0.15 + 0.85 * ramp01);

        // 노즐 중심 확산(초기 좁게 -> 점점 넓게)
        const spreadX = lerp(w * 0.06, w * 0.62, Math.pow(Math.max(0.0001, gatedPower01), 0.65));
        const spreadY = lerp(h * 0.04, h * 0.40, Math.pow(Math.max(0.0001, gatedPower01), 0.60));

        emitAmbient({
          blobs: ambient,
          targetCount: Math.min(quality.ambientMax, Math.round(quality.ambientTarget * (0.35 + 0.65 * ramp01) + ambientPower01 * 10)),
          nozzleX,
          nozzleY,
          w,
          h,
          power01: ambientPower01,
          lowPower,
          spawnSpreadX: spreadX,
          spawnSpreadY: spreadY,
        });
      }

      // 2) Emission only while pointerdown
      if (isPressing) {
        // plume
        const spreadX = lerp(4, 10, gatedPower01);
        const spreadY = lerp(6, 14, gatedPower01);
        plumeAccRef.current += dt * quality.plumeRate * gatedPower01 * (0.35 + 0.65 * ramp01);
        while (plumeAccRef.current >= 1) {
          plumeAccRef.current -= 1;
          emitPlumeCluster({
            nozzleX,
            nozzleY: nozzleY - 2,
            spreadX,
            spreadY,
            power01: gatedPower01,
            ramp01,
            lowPower,
            blobs: plume,
            maxCount: quality.plumeMax,
          });
        }

        // body
        const bodySpreadX = spreadX * (1.8 + gatedPower01 * 0.8);
        const bodySpreadY = spreadY * (1.8 + gatedPower01 * 0.9);
        bodyAccRef.current += dt * quality.bodyRate * gatedPower01 * (0.25 + 0.75 * ramp01);
        while (bodyAccRef.current >= 1) {
          bodyAccRef.current -= 1;
          emitBodyCluster({
            nozzleX,
            nozzleY: nozzleY - 8,
            spreadX: bodySpreadX,
            spreadY: bodySpreadY,
            power01: gatedPower01,
            ramp01,
            lowPower,
            blobs: body,
            maxCount: quality.bodyMax,
          });
        }

        // diffuse outer fade
        const diffSpreadX = spreadX * (2.7 + gatedPower01 * 0.9);
        const diffSpreadY = spreadY * (2.4 + gatedPower01 * 0.9);
        diffuseAccRef.current += dt * quality.diffuseRate * gatedPower01 * (0.22 + 0.78 * ramp01);
        while (diffuseAccRef.current >= 1) {
          diffuseAccRef.current -= 1;
          emitDiffuseCluster({
            nozzleX,
            nozzleY: nozzleY - 4,
            spreadX: diffSpreadX,
            spreadY: diffSpreadY,
            power01: gatedPower01,
            ramp01,
            lowPower,
            blobs: diffuse,
            maxCount: quality.diffuseMax,
          });
        }

        // donut ring cluster (interval based)
        if (smokeMode === "donut") {
          ringAccRef.current += dt;
          if (ringAccRef.current >= nextRingIntervalRef.current) {
            ringAccRef.current = 0;
            nextRingIntervalRef.current = lerp(quality.ringMinInterval, quality.ringMaxInterval, Math.random());

            const ringRadius = lerp(w * 0.055, w * 0.095, gatedPower01) * (0.9 + Math.random() * 0.25);
            const ringTh = lerp(w * 0.012, w * 0.03, gatedPower01) * (0.8 + Math.random() * 0.6);

            emitRingCluster({
              ringCenterX: nozzleX + driftX * 6,
              ringCenterY: nozzleY - 8,
              ringRadius,
              ringTh,
              power01: gatedPower01,
              ramp01,
              lowPower,
              blobs: ring,
              maxCount: quality.ringMax,
            });
          }
        }
      }

      // 3) Update physics (existing blobs only)
      stepPlume(plume, dt, nowSec, { w, h }, driftX, forceScale);
      stepBody(body, dt, nowSec, { w, h }, driftX, forceScale);
      stepDiffuse(diffuse, dt, nowSec, { w, h }, driftX, forceScale);
      // ambient은 press ramp에서만 “강하게 소용돌이” 치고, idle/초기에는 영향이 거의 없다.
      const ambientForceScale = isPressing ? forceScale * (0.45 + 0.85 * ramp01) : 0.0;
      stepAmbient(ambient, dt, nowSec, { w, h }, driftX, ambientForceScale);
      stepRing(ring, dt, nowSec, { w, h }, driftX, forceScale);

      // 4) Draw in correct layering order
      // Ambient -> Ring -> Plume -> Body -> Diffuse
      // base: source-over to avoid “glow wash”
      ctx.globalCompositeOperation = "source-over";
      drawAmbient(ctx, ambient, nowSec);
      drawRing(ctx, ring, nowSec);
      drawBody(ctx, body, nowSec);
      drawDiffuse(ctx, diffuse, nowSec);

      // plume core only: screen adds vapor-like “dense core” without overusing lighter
      ctx.globalCompositeOperation = "screen";
      ctx.globalAlpha = isPressing ? 0.45 + 0.55 * ramp01 : 1;
      drawPlume(ctx, plume, nowSec);
      ctx.globalAlpha = 1;

      // restore if needed by next frames
      ctx.globalCompositeOperation = "source-over";

      rafRef.current = requestAnimationFrame(step);
    };

    rafRef.current = requestAnimationFrame(step);

    return () => {
      mounted = false;
      window.removeEventListener("resize", resize);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [canvasRef, pressing, smokeMode, intensity, emitter, lowPower, quality]);
}

*/
