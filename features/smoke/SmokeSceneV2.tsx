"use client";

import { useEffect, useMemo, useRef } from "react";
import type { SmokeMode } from "@/types/smokeMode";
import type { EmitterPoint } from "@/store/usePressInteractionStore";

type BlobLayer = "ambient" | "plume" | "turbulent" | "diffuse" | "donut";

type SmokeBlob = {
  layer: BlobLayer;
  x: number;
  y: number;
  vx: number;
  vy: number;
  // size (px) - 연기 덩어리(부피) 크기
  size: number;
  // alpha (0..1) - 중심 강도(외곽은 feather gradient에서 0으로 감)
  alpha: number;
  // density (0..1+) - blob “농도”
  density: number;
  // noiseOffset - blob마다 다른 흐름/형상 노이즈
  noiseOffset: number;
  // life/age (seconds)
  life: number;
  age: number;
};

// donut 전용 파티클(링을 점/블러 스프라이트로 그리던 방식)은 제거하고,
// donut은 “링 = blob cluster”로만 생성/렌더링한다.

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

// 빠른 value noise (0..1)
function hash2(ix: number, iy: number, seed: number) {
  // deterministic-ish
  const s = Math.sin(ix * 127.1 + iy * 311.7 + seed * 74.7) * 43758.5453123;
  return s - Math.floor(s);
}

function valueNoise2D(x: number, y: number, seed: number) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const tx = x - xi;
  const ty = y - yi;

  const u = tx * tx * (3 - 2 * tx);
  const v = ty * ty * (3 - 2 * ty);

  const a = hash2(xi, yi, seed);
  const b = hash2(xi + 1, yi, seed);
  const c = hash2(xi, yi + 1, seed);
  const d = hash2(xi + 1, yi + 1, seed);

  const ab = lerp(a, b, u);
  const cd = lerp(c, d, u);
  return lerp(ab, cd, v);
}

// pseudo-curl noise: divergence-ish reduction + turbulence feel
function curlField(x: number, y: number, t: number, seed: number) {
  const eps = 0.85;
  const scale = 0.0085; // lower = larger flow structures
  const ts = t * 0.15;

  // noise gradients
  const nx1 = valueNoise2D((x + eps) * scale, y * scale + ts, seed);
  const nx2 = valueNoise2D((x - eps) * scale, y * scale + ts, seed);
  const ny1 = valueNoise2D(x * scale + 13.7, (y + eps) * scale + ts, seed);
  const ny2 = valueNoise2D(x * scale + 13.7, (y - eps) * scale + ts, seed);

  const dx = nx1 - nx2;
  const dy = ny1 - ny2;

  // curl-like vector
  let vx = dy;
  let vy = -dx;

  const m = Math.hypot(vx, vy) || 1;
  vx /= m;
  vy /= m;
  return { vx, vy };
}

// (기존 텍스처 기반 스프라이트 렌더링은 “점/글로우 파티클” 느낌을 유발할 수 있어서 제거)

export function SmokeSceneV2({
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

  const blobsRef = useRef<SmokeBlob[]>([]);

  const pressingRef = useRef(pressing);
  const smokeModeRef = useRef(smokeMode);
  const intensityRef = useRef(intensity);
  const emitterRef = useRef<EmitterPoint | null>(emitter);

  const lastFrameAtRef = useRef<number>(0);
  const smokePowerRef = useRef(0); // press power (0..1.5)
  const pressAgeRef = useRef(0);
  const activeAccRef = useRef(0);
  const donutAccRef = useRef(0);

  const canvasRectRef = useRef<DOMRect | null>(null);

  // SSR/CSR에서도 값이 달라져 hydration mismatch가 일어나는 걸 피하기 위해 상수 seed 사용
  const smokeSeedRef = useRef<number>(1337);

  const quality = useMemo(() => {
    return {
      dprCap: lowPower ? 1.25 : 2.0,
      // entity caps (요구: 최대 120~200)
      maxBlobs: lowPower ? 140 : 200,

      // AmbientSmokeLayer: “빈 화면 방지”를 위한 항상 존재하는 큰 덩어리
      ambientTarget: lowPower ? 12 : 16,
      ambientBurstMin: lowPower ? 2 : 3,
      ambientBurstMax: lowPower ? 4 : 5,

      // power ramp & tail
      pressRiseDelay: 0.18, // 150~300ms 목표
      pressRiseTime: 0.22, // 이후 밀도 상승
      pressDecayTime: lowPower ? 1.05 : 1.3,

      // trail fade (작게 할수록 잔상 길어져 “연무 volume” 유리)
      frameFadeBase: lowPower ? 0.055 : 0.04,
      frameFadeTail: lowPower ? 0.01 : 0.008,

      // movement/buoyancy (핵심: 소음 기반 흔들림 + 위로 퍼짐)
      buoyancyAmbient: lowPower ? 10 : 14,
      buoyancyActive: lowPower ? 44 : 58,
      flowStrengthAmbient: lowPower ? 12 : 16,
      flowStrengthActive: lowPower ? 38 : 46,

      // diffusion/render
      growthAmbient: 0.55,
      growthActive: 0.95,
      alphaDecayPowAmbient: 1.15,
      alphaDecayPowActive: 1.65,
      densityDecayPowAmbient: 1.0,
      densityDecayPowActive: 1.35,
      shapePointsAmbient: 10,
      shapePointsActive: 12,
      shapeJitter: lowPower ? 0.26 : 0.30,
      ellipseYAambient: 0.62,
      ellipseYActive: 0.66,
      clipMargin: 1.12,

      // emission spread (요구: nozzle x ± 5~15px, y는 nozzle 주변)
      emissionConeXMin: 5,
      emissionConeXMax: 15,
      emissionConeYMin: 4,
      emissionConeYMax: 14,

      // press cluster emission (요구: 기존 대비 3~5배 밀도 증가)
      pressClusterRate: lowPower ? 6.5 : 9.0, // clusters/sec at power=1
      pressClusterBlobsMin: lowPower ? 5 : 7,
      pressClusterBlobsMax: lowPower ? 9 : 12,

      // donut ring: ring = blob cluster (완벽한 원/균일 배치 금지)
      donutClusterRate: lowPower ? 6.0 : 8.0,
      donutClusterBlobsMin: lowPower ? 9 : 12,
      donutClusterBlobsMax: lowPower ? 15 : 20,
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
      if (!canvasRectRef.current) canvasRectRef.current = canvas.getBoundingClientRect();
      const rect = canvas.getBoundingClientRect();
      canvasRectRef.current = rect;
      const dpr = Math.max(1, Math.min(quality.dprCap, window.devicePixelRatio || 1));
      canvas.width = Math.floor(rect.width * dpr);
      canvas.height = Math.floor(rect.height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    const drawBlob = (b: SmokeBlob) => {
      const t01 = b.life <= 0 ? 1 : b.age / b.life;
      if (t01 >= 1) return;

      // diffusion: size up, alpha/density down
      const growthK = b.layer === "ambient" ? quality.growthAmbient : quality.growthActive;
      const sizeEff = b.size * (1 + growthK * t01);

      const densityEff = b.density * Math.pow(1 - t01, b.layer === "ambient" ? quality.densityDecayPowAmbient : quality.densityDecayPowActive);
      const alphaEffBase = b.alpha * Math.pow(1 - t01, b.layer === "ambient" ? quality.alphaDecayPowAmbient : quality.alphaDecayPowActive);
      const alphaEff = alphaEffBase * (0.55 + 0.45 * clamp(densityEff, 0, 1));

      if (alphaEff <= 0.002) return;

      // radial gradient feather (outer alpha -> 0)
      const rOuter = sizeEff;
      const rInner = Math.max(1, rOuter * (0.18 + 0.18 * clamp(densityEff, 0, 1)));
      const g = ctx.createRadialGradient(0, 0, rInner, 0, 0, rOuter);
      g.addColorStop(0, `rgba(245,250,255,${alphaEff})`);
      g.addColorStop(0.38, `rgba(220,232,250,${alphaEff * 0.55})`);
      g.addColorStop(0.72, `rgba(185,205,235,${alphaEff * 0.16})`);
      g.addColorStop(1, `rgba(245,250,255,0)`);

      // “단순 원” 방지: 노이즈 기반으로 polygon clip을 찢어서 부피 덩어리처럼 보이게
      const points = b.layer === "ambient" ? quality.shapePointsAmbient : quality.shapePointsActive;
      const ellipseY = b.layer === "ambient" ? quality.ellipseYAambient : quality.ellipseYActive;
      const shapeJ = quality.shapeJitter * (0.65 + 0.45 * (1 - t01));
      const wobRot =
        (valueNoise2D(b.noiseOffset * 0.01, b.age * 0.06, b.noiseOffset) - 0.5) * (b.layer === "ambient" ? 0.28 : 0.55);

      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(wobRot);

      const clipRMax = rOuter * quality.clipMargin;

      ctx.beginPath();
      for (let i = 0; i <= points; i++) {
        const a = (i / points) * Math.PI * 2;
        const nx = Math.cos(a);
        const ny = Math.sin(a);
        const n = valueNoise2D(
          nx * 2.7 + b.noiseOffset * 0.004 + b.age * 0.02,
          ny * 2.7 + b.noiseOffset * 0.004,
          b.noiseOffset
        ) - 0.5;

        const ra = clamp(rOuter * (0.86 + n * shapeJ), rOuter * 0.72, clipRMax);
        const px = Math.cos(a) * ra;
        const py = Math.sin(a) * ra * (ellipseY * (0.92 + n * 0.18));
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.clip();

      ctx.fillStyle = g;
      // clip 내부만 그려지므로 fillRect로 빠르게 area 채우기
      ctx.fillRect(-rOuter * 1.15, -rOuter * 1.15, rOuter * 2.3, rOuter * 2.3);
      ctx.restore();
    };

    const emitBlob = (
      layer: BlobLayer,
      originX: number,
      originY: number,
      spreadX: number,
      spreadY: number,
      basePower01: number
    ) => {
      const list = blobsRef.current;
      if (list.length >= quality.maxBlobs) return;

      const noiseOffset = Math.random() * 10000 + smokeSeedRef.current * 0.001;

      // “큰 덩어리” 단위 크기 (요구 범위: 30~120px, ambient은 100~300)
      const size =
        layer === "ambient"
          ? rand(100, 300)
          : layer === "plume"
            ? rand(30, 95) * (0.85 + basePower01 * 0.55)
            : layer === "turbulent"
              ? rand(40, 120) * (0.82 + basePower01 * 0.6)
              : layer === "diffuse"
                ? rand(55, 120) * (0.78 + basePower01 * 0.7)
                : rand(40, 120) * (0.8 + basePower01 * 0.7);

      // center alpha: active 0.15~0.25, ambient 0.03~0.08
      const alpha =
        layer === "ambient"
          ? rand(0.03, 0.08)
          : layer === "plume"
            ? rand(0.15, 0.25) * (0.82 + basePower01 * 0.35)
            : layer === "turbulent"
              ? rand(0.13, 0.23) * (0.8 + basePower01 * 0.4)
              : layer === "diffuse"
                ? rand(0.12, 0.20) * (0.85 + basePower01 * 0.45)
                : rand(0.12, 0.24) * (0.82 + basePower01 * 0.38);

      const density =
        layer === "ambient"
          ? rand(0.28, 0.55)
          : layer === "plume"
            ? rand(0.65, 1.0)
            : layer === "turbulent"
              ? rand(0.6, 0.95)
              : layer === "diffuse"
                ? rand(0.45, 0.85)
                : rand(0.5, 1.0);

      // initial velocity: upward + sideways jitter (straight 이동 방지용으로 noise가 나중에 더 강하게 작동)
      const initUp =
        layer === "ambient" ? rand(6, 16) : layer === "plume" ? rand(95, 155) : layer === "turbulent" ? rand(70, 135) : layer === "diffuse" ? rand(55, 115) : rand(60, 125);
      const initSide =
        layer === "ambient"
          ? rand(-10, 10)
          : layer === "plume"
            ? rand(-50, 50)
            : layer === "turbulent"
              ? rand(-65, 65)
              : layer === "diffuse"
                ? rand(-70, 70)
                : rand(-55, 55);

      const vx = initSide + (Math.random() * 2 - 1) * 22 + (spreadX ? initSide * (spreadX / 120) * 0.1 : 0);
      const vy = -initUp + (Math.random() * 2 - 1) * 14;

      const life =
        layer === "ambient"
          ? rand(9, 15)
          : layer === "plume"
            ? rand(1.0, 1.7)
            : layer === "turbulent"
              ? rand(1.2, 2.0)
              : layer === "diffuse"
                ? rand(1.4, 2.6)
                : rand(1.1, 2.4);

      const b: SmokeBlob = {
        layer,
        x: originX + (Math.random() * 2 - 1) * spreadX,
        y: originY + (Math.random() * 2 - 1) * spreadY,
        vx,
        vy,
        size,
        alpha,
        density,
        noiseOffset,
        life,
        age: 0,
      };

      list.push(b);
    };

    // main loop
    const step = (now: number) => {
      if (!mounted) return;

      const dtMs = lastFrameAtRef.current ? now - lastFrameAtRef.current : 16;
      lastFrameAtRef.current = now;
      const dt = Math.min(0.05, dtMs / 1000);

      const rect = canvasRectRef.current;
      const canvasW = rect ? rect.width : canvas.clientWidth;
      const canvasH = rect ? rect.height : canvas.clientHeight;

      const isPressingNow = pressingRef.current;
      const modeNow = smokeModeRef.current;
      const iNow = intensityRef.current;

      // smokePower with press rise delay + release tail
      if (isPressingNow) {
        pressAgeRef.current += dt;
        const riseAfter = pressAgeRef.current - quality.pressRiseDelay;
        const riseT = riseAfter <= 0 ? 0 : riseAfter / quality.pressRiseTime;
        const t01 = smoothstep(riseT);
        const powerTarget = clamp(iNow / 1.5, 0, 1) * (0.1 + 0.9 * t01) + 0.05;
        const k = 1 - Math.exp(-dt * 9);
        smokePowerRef.current = lerp(smokePowerRef.current, powerTarget, k);
      } else {
        pressAgeRef.current = 0;
        const k = Math.exp(-dt / quality.pressDecayTime);
        smokePowerRef.current *= k;
      }

      const power = clamp(smokePowerRef.current, 0, 1.5);
      const power01 = power / 1.5;

      const nowSec = now / 1000;

      // trail fade: 작은 값 => 더 오래 남아서 “연무 volume”가 쌓임
      const fade = quality.frameFadeBase + (1 - power01) * quality.frameFadeTail;
      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = `rgba(0,0,0,${fade})`;
      ctx.fillRect(0, 0, canvasW, canvasH);

      // emitter origin: behind nozzle slightly
      const e = emitterRef.current;
      const originX = e ? e.clientX - (rect ? rect.left : 0) : canvasW * 0.5;
      const originY = e ? e.clientY - (rect ? rect.top : 0) : canvasH * 0.28;
      const nozzleX = originX;
      const nozzleY = originY + canvasH * 0.06;

      const list = blobsRef.current;

      // AmbientSmokeLayer: 항상 뒤에 큰 볼륨 레이어가 존재해야 함
      let ambientCount = 0;
      for (let i = list.length - 1; i >= 0; i--) {
        if (list[i].layer === "ambient") ambientCount++;
      }

      if (ambientCount < quality.ambientTarget) {
        const need = quality.ambientTarget - ambientCount;
        const burstCount = Math.min(need, Math.floor(rand(quality.ambientBurstMin, quality.ambientBurstMax)));

        // 좌/우에서 들어오는 큰 blob: ring/line 느낌 없이 덩어리로 채움
        for (let i = 0; i < burstCount; i++) {
          const left = valueNoise2D(nowSec * 0.08 + i * 0.17, smokeSeedRef.current * 0.001, smokeSeedRef.current) - 0.5 > 0;
          const x = left ? rand(canvasW * 0.04, canvasW * 0.32) : rand(canvasW * 0.68, canvasW * 0.96);
          const y = nozzleY - canvasH * rand(0.06, 0.14) + rand(-canvasH * 0.02, canvasH * 0.02);

          // Ambient은 spread가 작아도 “큰 size” 자체가 덩어리량을 만든다.
          emitBlob("ambient", x, y, canvasW * 0.01, canvasH * 0.01, 0.2);
        }
      }

      // Active emission: press 중 여러 blob을 동시에 생성 (cone 시작)
      if (power > 0.02) {
        const isAfterRise = pressAgeRef.current > quality.pressRiseDelay + 0.02;

        // (요구: 3~5배 밀도 증가) => cluster event rate를 더 높게
        activeAccRef.current += dt * quality.pressClusterRate * power01 * (isAfterRise ? 1.0 : 0.6);

        const coneX = lerp(quality.emissionConeXMin, quality.emissionConeXMax, power01);
        // y는 “노즐 근처”에 두고, 약간만 퍼짐
        const coneY = lerp(quality.emissionConeYMin, quality.emissionConeYMax, power01) * 0.25 + 1.2;

        while (activeAccRef.current >= 1) {
          activeAccRef.current -= 1;
          if (blobsRef.current.length >= quality.maxBlobs) break;

          // 한 이벤트에서 여러 개 blob을 “동시에” 생성 => 덩어리 겹침
          const baseBlobN = Math.floor(rand(quality.pressClusterBlobsMin, quality.pressClusterBlobsMax) * (0.85 + power01 * 0.9));
          const plumeN = Math.floor(baseBlobN * (isAfterRise ? 0.38 : 0.62));
          const turbN = Math.floor(baseBlobN * (isAfterRise ? 0.42 : 0.28));
          const diffN = Math.max(1, baseBlobN - plumeN - turbN);

          // plume (좁고 빠르게)
          for (let i = 0; i < plumeN; i++) {
            if (blobsRef.current.length >= quality.maxBlobs) break;
            emitBlob(
              "plume",
              nozzleX,
              nozzleY,
              coneX * (0.35 + Math.random() * 0.22),
              coneY * (0.18 + Math.random() * 0.22),
              power01
            );
          }

          // turbulent (더 넓게)
          for (let i = 0; i < turbN; i++) {
            if (blobsRef.current.length >= quality.maxBlobs) break;
            emitBlob(
              "turbulent",
              nozzleX,
              nozzleY - canvasH * 0.005,
              coneX * (0.7 + Math.random() * 0.25),
              coneY * (0.35 + Math.random() * 0.25),
              power01
            );
          }

          // diffuse (바깥 덩어리, 더 크게 퍼져 사라짐)
          for (let i = 0; i < diffN; i++) {
            if (blobsRef.current.length >= quality.maxBlobs) break;
            emitBlob(
              "diffuse",
              nozzleX,
              nozzleY + canvasH * 0.01,
              coneX * (0.95 + Math.random() * 0.35),
              coneY * (0.45 + Math.random() * 0.35),
              power01
            );
          }
        }
      }

      // Donut mode: “링을 파티클로 그리지 말고” 링=blob cluster로 생성
      if (modeNow === "donut") {
        const donutPower = power01 * (pressingRef.current ? 1 : 0.85);
        if (donutPower > 0.02) {
          donutAccRef.current += dt * quality.donutClusterRate * donutPower;

          while (donutAccRef.current >= 1) {
            donutAccRef.current -= 1;
            if (blobsRef.current.length >= quality.maxBlobs) break;

            const ringCenterX = nozzleX + rand(-12, 12);
            const ringCenterY = nozzleY - canvasH * 0.02 + rand(-canvasH * 0.01, canvasH * 0.01);
            const ringR = lerp(canvasW * 0.055, canvasW * 0.095, power01) * (0.9 + Math.random() * 0.25);
            const ringTh = lerp(canvasW * 0.012, canvasW * 0.03, power01) * (0.75 + Math.random() * 0.6);

            const candidate = Math.floor(rand(quality.donutClusterBlobsMin, quality.donutClusterBlobsMax) * (0.75 + power01 * 0.7));

            // uniform spacing 금지: 랜덤 각도 샘플 + gap noise로 일부는 스킵
            let created = 0;
            let guard = 0;
            while (created < candidate && guard < candidate * 6) {
              guard++;
              const a = Math.random() * Math.PI * 2;

              const gapN =
                valueNoise2D(Math.cos(a) * 1.7 + power01 * 2.2, Math.sin(a) * 1.7 + power01 * 2.2, smokeSeedRef.current * 0.001) - 0.5;
              if (gapN < -0.1 && Math.random() < 0.6) continue;

              const radial = ringR + (Math.random() + Math.random() - 1) * ringTh * 0.55 + gapN * ringTh * 0.25;
              const ex = Math.cos(a) * radial + rand(-ringTh * 0.18, ringTh * 0.18);
              const ey = Math.sin(a) * radial * 0.66 + rand(-ringTh * 0.12, ringTh * 0.12);

              if (blobsRef.current.length >= quality.maxBlobs) break;
              emitBlob("donut", ringCenterX + ex, ringCenterY + ey, ringTh * 0.18, ringTh * 0.14, power01);
              created++;
            }
          }
        }
      }

      // Update (movement) - renderer는 아래에서 layer 별로 수행
      for (let idx = list.length - 1; idx >= 0; idx--) {
        const b = list[idx];
        b.age += dt;
        if (b.age >= b.life) {
          list.splice(idx, 1);
          continue;
        }

        const t01 = b.life <= 0 ? 1 : b.age / b.life;
        const seed = b.noiseOffset;

        // noise 기반 흐름 + 좌/우 흔들림 (직선 이동 방지)
        const flow = curlField(b.x, b.y, nowSec + t01 * 0.12, seed);
        const side =
          valueNoise2D(b.x * 0.01 + nowSec * 0.13, b.y * 0.01 + seed * 0.001, seed) - 0.5;

        const flowStrength = b.layer === "ambient" ? quality.flowStrengthAmbient : quality.flowStrengthActive;
        const buoy = b.layer === "ambient" ? quality.buoyancyAmbient : quality.buoyancyActive;

        const layerK =
          b.layer === "plume" ? 1.0 : b.layer === "turbulent" ? 0.82 : b.layer === "diffuse" ? 0.68 : 0.78;

        // 곡선/요동이 생기도록 age 기반으로 힘을 바꾼다.
        const spreadK = 0.35 + 0.65 * t01;
        b.vx += flow.vx * flowStrength * dt * (0.55 + 0.8 * t01) + side * dt * (14 + 20 * spreadK);
        b.vy += flow.vy * flowStrength * dt * (0.45 + 0.65 * t01);

        // 위로 올라가면서 점점 퍼짐
        b.vy -= buoy * layerK * dt * (0.6 + 0.55 * (1 - t01));
        b.vx += side * dt * 6 * t01;

        // drag
        const dragPerSec = b.layer === "ambient" ? 0.65 : 0.9;
        const drag = Math.exp(-dragPerSec * dt);
        b.vx *= drag;
        b.vy *= drag;

        b.x += b.vx * dt;
        b.y += b.vy * dt;

        // keep center mass behind device (soft clamp)
        b.x = clamp(b.x, -canvasW * 0.25, canvasW * 1.25);
        b.y = clamp(b.y, -canvasH * 0.25, canvasH * 1.15);
      }

      // Render: 반드시 겹쳐야 한다 => Ambient 먼저, 그다음 active 덩어리들
      ctx.globalCompositeOperation = "screen";
      for (let i = 0; i < list.length; i++) {
        if (list[i].layer === "ambient") drawBlob(list[i]);
      }

      ctx.globalCompositeOperation = "lighter";
      for (let i = 0; i < list.length; i++) {
        if (list[i].layer !== "ambient") drawBlob(list[i]);
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

function rand(min: number, max: number) {
  return min + Math.random() * (max - min);
}

