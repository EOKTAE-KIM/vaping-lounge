"use client";

import { useEffect, useMemo, useRef } from "react";
import type { RefObject } from "react";
import { fbm2D, curlField, lerp } from "@/lib/noise";
import type { SmokeParticleLike } from "@/components/smoke/utils/renderSmokeParticle";
import { renderSmokeParticle } from "@/components/smoke/utils/renderSmokeParticle";
import {
  ambientDensity,
  driftDirection,
  flowSpeed,
  opacityRange,
  respawnStrategy,
  turbulenceAmount,
} from "@/features/smoke/smokePresets";

type AmbientLayerId = "far" | "mid" | "near";

type AmbientLayerSpec = {
  id: AmbientLayerId;
  seed: number;
  flowScale: number;
  speedPxBase: number; // px/s baseline (multiplied by flowSpeed[id])
  upwardBiasPx: number; // small rise to keep veil alive
  blend: "source-over" | "screen" | "lighter";
};

function rand(min: number, max: number) {
  return min + Math.random() * (max - min);
}

function clamp01(n: number) {
  return Math.max(0, Math.min(1, n));
}

function softnessForKind(kind: SmokeParticleLike["kind"]) {
  if (kind === "core") return rand(0.25, 0.58);
  if (kind === "soft") return rand(0.45, 0.82);
  // wispy는 더 얇고 tenuous하게(밀도/알파가 과하게 뭉치지 않게)
  return rand(0.76, 0.99);
}

function baseSizeForLayer(layer: AmbientLayerId) {
  // veil: 너무 작으면 점처럼 보이므로 “덩이감”을 위해 최소 크기 확보
  // 참조 이미지처럼 “덩이진 연무 덩어리”가 보이도록 크게
  if (layer === "far") return { min: 180, max: 340 };
  if (layer === "mid") return { min: 120, max: 260 };
  return { min: 80, max: 190 };
}

function alphaForLayer(layer: AmbientLayerId) {
  const [aMin, aMax] = opacityRange[layer];
  return { min: aMin, max: aMax };
}

function sampleSpawnPoint(w: number, h: number, layer: AmbientLayerId, seed: number) {
  // weighted fullscreen spawn:
  // 40%: 상단 1/3
  // 25%: 좌/우 가장자리
  // 20%: 중앙 상부
  // 15%: 랜덤 전체
  const padX = w * 0.06;
  const padY = h * 0.06;
  const r = Math.random();

  let x = w * 0.5;
  let y = h * 0.2;

  if (r < 0.4) {
    // top third (soft veil가 상단/중앙 위주로 보이도록 약간 오프스크린 허용)
    y = lerp(-h * 0.08, h * 0.33, Math.pow(Math.random(), 0.78));
    x = rand(-padX, w + padX);
  } else if (r < 0.65) {
    // edges: left/right + slightly upper bias
    const isLeft = Math.random() < 0.5;
    x = isLeft ? rand(-padX * 1.1, padX * 0.35) : rand(w - padX * 0.35, w + padX * 1.1);
    y = lerp(h * 0.10, h * 0.62, Math.pow(Math.random(), 0.85));
  } else if (r < 0.85) {
    // center upper: narrow-ish around the middle
    const centerT = Math.pow(Math.random(), 0.9);
    x = lerp(w * 0.34, w * 0.66, centerT);
    y = lerp(h * 0.05, h * 0.42, Math.pow(Math.random(), 0.8));
  } else {
    // random everywhere
    x = rand(-padX * 0.7, w + padX * 0.7);
    y = rand(-padY * 0.4, h + padY * 0.4);
  }

  // layer에 따라 “중앙 쪽으로 당김”을 다르게(near가 더 중앙 집중)
  const centerPull = layer === "far" ? 0.92 : layer === "mid" ? 0.78 : 0.62;
  x = w * 0.5 + (x - w * 0.5) * centerPull;

  // 밀도 패치(비균일) 만들기 위한 샘플 값
  const densityN = fbm2D((x / w) * 3.2, (y / h) * 2.6, seed + 123.45, 3);
  const density01 = clamp01(densityN);

  return { x, y, density01 };
}

export function useAmbientSmokeEngine(
  canvasRef: RefObject<HTMLCanvasElement | null>,
  {
    lowPower,
    pressing,
    intensity,
  }: {
    lowPower: boolean;
    pressing: boolean;
    intensity: number; // 0..1.5
  }
) {
  const layersRef = useRef<Record<AmbientLayerId, SmokeParticleLike[]>>({
    far: [],
    mid: [],
    near: [],
  });

  const pressingRafMountedRef = useRef(true);
  const smokeSeedRef = useRef<number>(424242);

  const canvasRectRef = useRef<DOMRect | null>(null);
  const lastAtRef = useRef<number>(0);
  const rafRef = useRef<number | null>(null);

  const lowPowerRef = useRef(lowPower);
  const pressingRef = useRef(pressing);
  const intensityRef = useRef(intensity);
  useEffect(() => {
    lowPowerRef.current = lowPower;
  }, [lowPower]);
  useEffect(() => {
    pressingRef.current = pressing;
  }, [pressing]);
  useEffect(() => {
    intensityRef.current = intensity;
  }, [intensity]);

  const layersSpec = useMemo<AmbientLayerSpec[]>(() => {
    // baseFlowScale는 far/mid/near가 같은 flow이라도 다른 “구조 크기”를 보이게 한다.
    return [
      { id: "far", seed: 10101, flowScale: 0.0031, speedPxBase: 7.5, upwardBiasPx: 1.8, blend: "source-over" },
      { id: "mid", seed: 20202, flowScale: 0.0045, speedPxBase: 9.5, upwardBiasPx: 1.5, blend: "source-over" },
      { id: "near", seed: 30303, flowScale: 0.0062, speedPxBase: 12, upwardBiasPx: 1.2, blend: "source-over" },
    ];
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    pressingRafMountedRef.current = true;

    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    let mounted = true;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      canvasRectRef.current = rect;

      const dprCap = lowPowerRef.current ? 1.35 : 1.8;
      const dprRaw = window.devicePixelRatio || 1;
      const dpr = Math.max(1, Math.min(dprCap, dprRaw));

      canvas.width = Math.floor(rect.width * dpr);
      canvas.height = Math.floor(rect.height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    resize();
    window.addEventListener("resize", resize);

    // 초기 스폰: 진입 시 바로 “배경 분위기”가 보이도록
    const init = () => {
      const rect = canvasRectRef.current;
      const w = rect ? rect.width : canvas.clientWidth;
      const h = rect ? rect.height : canvas.clientHeight;

      const area = w * h;
      const baseArea = 640 * 960;
      const areaFactor = Math.sqrt(area / baseArea);

      const total = Math.round(
        (lowPowerRef.current ? ambientDensity.totalParticlesLow : ambientDensity.totalParticlesHigh) * areaFactor
      );
      const totalClamped = Math.max(80, Math.min(lowPowerRef.current ? 180 : 280, total));

      const targets: Record<AmbientLayerId, number> = {
        far: Math.round(totalClamped * ambientDensity.layerFractions.far),
        mid: Math.round(totalClamped * ambientDensity.layerFractions.mid),
        near: Math.round(totalClamped * ambientDensity.layerFractions.near),
      };

      // 한번 초기화하고 채운다.
      layersRef.current.far.splice(0, layersRef.current.far.length);
      layersRef.current.mid.splice(0, layersRef.current.mid.length);
      layersRef.current.near.splice(0, layersRef.current.near.length);

      for (const spec of layersSpec) {
        const arr = layersRef.current[spec.id];
        const target = targets[spec.id];
        for (let i = 0; i < target; i++) {
          const p = spawnAmbientParticle(spec.id, w, h, spec.seed, smokeSeedRef.current, layersSpec, 0);
          if (!p) continue;
          arr.push(p);
        }
      }
    };

    const pickKindForLayerWithPress = (layer: AmbientLayerId, pressBoost01: number) => {
      // pressBoost01가 커질수록 “코어 대비 wispy(찢어진 얇은 결)” 비중↑
      const pb = clamp01(pressBoost01);
      const r = Math.random();

      if (layer === "far") {
        const coreT = 0.06 - 0.02 * pb;
        const softT = coreT + (0.36 - 0.12 * pb);
        if (r < coreT) return "core" as const;
        if (r < softT) return "soft" as const;
        return "wisp" as const;
      }

      if (layer === "mid") {
        const coreT = 0.16 - 0.05 * pb;
        const softT = coreT + (0.56 - 0.25 * pb);
        if (r < coreT) return "core" as const;
        if (r < softT) return "soft" as const;
        return "wisp" as const;
      }

      // near
      const coreT = 0.26 - 0.06 * pb;
      const softT = coreT + (0.52 - 0.22 * pb);
      if (r < coreT) return "core" as const;
      if (r < softT) return "soft" as const;
      return "wisp" as const;
    };

    const spawnAmbientParticle = (
      layer: AmbientLayerId,
      w: number,
      h: number,
      seed: number,
      smokeSeed: number,
      allSpecs: AmbientLayerSpec[],
      pressBoost01: number
    ): SmokeParticleLike | null => {
      const kinds = pickKindForLayerWithPress(layer, pressBoost01);
      const spawn = sampleSpawnPoint(w, h, layer, seed + 7.77);
      const anchorX = spawn.x;
      const anchorY = spawn.y;
      const density01 = spawn.density01;

      // “한 점에서 바로 튀는” 느낌을 줄이기 위해,
      // 스폰 위치를 로컬 cloud sheet / billow 덩어리로 퍼뜨린다.
      const sheetSpreadX = lerp(w * 0.03, w * 0.085, Math.pow(density01, 0.75)) * (layer === "far" ? 0.95 : 1.0);
      const sheetSpreadY = lerp(h * 0.015, h * 0.05, Math.pow(density01, 0.8)) * (layer === "far" ? 0.85 : 1.0);
      const x = anchorX + rand(-sheetSpreadX, sheetSpreadX);
      const y =
        anchorY + rand(-sheetSpreadY * (layer === "near" ? 0.7 : 1.0), sheetSpreadY * (layer === "near" ? 0.7 : 1.0));

      // density가 높은 곳은 더 오래/조금 더 진하게(=연기 농도 차)
      const lifeRange = respawnStrategy.lifeRangeSec[layer];
      const lifeBase = lerp(lifeRange[0], lifeRange[1], Math.pow(density01, 0.75));

      const a = alphaForLayer(layer);
      // 클릭 시 “담배연기 같은 결”이 보이도록 alpha를 약간만 올린다.
      // ambient은 발광 점이 아니라 “얇은 veil”로 쌓여야 하므로 알파 부스트를 크게 줄인다.
      const alphaBoost = 1 + 0.06 * clamp01(pressBoost01);
      const kindAlphaMul = kinds === "core" ? 1.0 : kinds === "soft" ? 0.92 : 0.78;
      const alpha =
        lerp(a.min, a.max, Math.pow(density01, 0.65)) * rand(0.85, 1.12) * alphaBoost * kindAlphaMul;

      const sizeRange = baseSizeForLayer(layer);
      const sizeN = lerp(0.85, 1.25, density01);
      const size = rand(sizeRange.min, sizeRange.max) * (layer === "near" ? sizeN : lerp(0.92, sizeN, 0.75));

      const spec = allSpecs.find((s) => s.id === layer)!;

      // 초기 이동: 너무 빨라 보이지 않게 “거의 정지”에 가깝게 아주 약하게만 흐름을 탄다.
      const tForFlow = 0.015 * (seed % 1000);
      // flow 샘플은 anchor 기준으로 잡아 같은 덩어리가 같은 방향성을 갖게 한다.
      const f = curlField(anchorX * spec.flowScale, anchorY * spec.flowScale, tForFlow, seed + 99.9);
      const kindBaseStretch = kinds === "core" ? rand(1.1, 1.65) : kinds === "soft" ? rand(1.25, 2.15) : rand(1.7, 3.3);

      // wispy density는 더 뻗어 보이게
      const stretchBoost = 1 + 0.22 * clamp01(pressBoost01);
      const wispyStretchBoost = kinds === "wisp" ? 1.35 : 1.0;
      const stretch =
        kindBaseStretch *
        wispyStretchBoost *
        lerp(0.88, 1.10, density01) *
        (layer === "far" ? 0.92 : 0.98) *
        stretchBoost;

      const driftAngle = ((driftDirection.baseAngleDeg * Math.PI) / 180) + Math.sin((seed + x + y) * 0.0001) * 0.25;
      const driftX = Math.cos(driftAngle);
      const driftY = Math.sin(driftAngle);

      const speedPxBase = spec.speedPxBase * flowSpeed[layer];
      const speedBoost = 1 + 0.22 * clamp01(pressBoost01);
      const speed = speedPxBase * rand(0.35, 0.75) * (0.75 + 0.25 * (1 - density01)) * speedBoost;

      const upward = spec.upwardBiasPx * rand(0.45, 1.0);

      // y는 canvas에서 아래로 증가 => 위로 가려면 vy가 음수
      const vx = f.vx * speed * 0.22 + driftX * speed * 0.06 + rand(-0.9, 0.9);
      const vy = f.vy * speed * 0.22 + driftY * speed * 0.04 - upward * 0.18 + rand(-0.7, 0.7);

      const softness = softnessForKind(kinds);
      // rotation은 매우 완만하게(갑작스런 찢김/움직임 느낌 감소)
      const rotBoost = 1 + 0.45 * clamp01(pressBoost01);
      const rotRand = kinds === "wisp" ? 0.28 : 0.42;
      const rotation = Math.atan2(vy, vx) + rand(-rotRand, rotRand) * (kinds === "wisp" ? 0.65 : 0.45) * rotBoost;

      // turbulenceSeed는 렌더 feather/tear에 쓰이므로, 스폰별로 충분히 분산되게.
      const turbulenceSeed = seed + smokeSeed * 0.001 + x * 0.02 + y * 0.03 + rand(-500, 500);

      // life를 늘려 alpha fade 템포도 함께 늦춘다.
      const life = Math.max(10, lifeBase * 1.12);

      return {
        kind: kinds,
        x,
        y,
        vx,
        vy,
        size,
        alpha,
        life,
        maxLife: life,
        turbulenceSeed,
        stretch,
        rotation,
        softness,
      };
    };

    init();
    lastAtRef.current = performance.now();

    const step = (now: number) => {
      if (!mounted) return;

      const dtMs = Math.max(0, now - lastAtRef.current);
      lastAtRef.current = now;
      const dt = Math.min(0.05, dtMs / 1000);
      if (dt <= 0) {
        rafRef.current = requestAnimationFrame(step);
        return;
      }

      const rect = canvasRectRef.current;
      const w = rect ? rect.width : canvas.clientWidth;
      const h = rect ? rect.height : canvas.clientHeight;
      const nowSec = now / 1000;

      // persistence: 매 프레임을 완전 지우지 않고 아주 약하게만 감쇠
      // (이렇게 해야 “공간 전체가 휘몰아치는” 분위기가 더 자연스럽게 누적된다.)
      ctx.globalCompositeOperation = "source-over";
      const press01 = clamp01(intensityRef.current / 1.5);
      const pressBoost01 = pressingRef.current ? 0.35 + 0.65 * press01 : 0;

      // 클릭 시에는 “역동적인 소용돌이/결”이 보이도록 잔상(persistence)을 조금 더 남긴다.
      const fadeAlphaBase = lowPowerRef.current ? 0.06 : 0.05;
      const fadeAlpha = Math.max(0.03, fadeAlphaBase * (1 - 0.25 * pressBoost01));
      ctx.fillStyle = `rgba(0,0,0,${fadeAlpha})`;
      ctx.fillRect(0, 0, w, h);

      // atmosphere: simulation time is slowed down significantly
      const motionScaleBase = lowPowerRef.current ? 0.28 : 0.30;
      const motionScale = motionScaleBase * (1 + 0.75 * pressBoost01);
      const simDt = dt * motionScale;
      const simNowSec = nowSec * motionScale;

      // 밀도 유지용 target 재계산(리스케일이 자주 일어나는 환경에서 안정성)
      const area = w * h;
      const baseArea = 640 * 960;
      const areaFactor = Math.sqrt(area / baseArea);
      const total = Math.round(
        (lowPowerRef.current ? ambientDensity.totalParticlesLow : ambientDensity.totalParticlesHigh) * areaFactor
      );
      const totalClamped = Math.max(80, Math.min(lowPowerRef.current ? 180 : 280, total));
      const targets: Record<AmbientLayerId, number> = {
        far: Math.round(totalClamped * ambientDensity.layerFractions.far),
        mid: Math.round(totalClamped * ambientDensity.layerFractions.mid),
        near: Math.round(totalClamped * ambientDensity.layerFractions.near),
      };

      const paddingX = w * respawnStrategy.offscreenPaddingFrac;
      const paddingY = h * respawnStrategy.offscreenPaddingFrac;

      // drift 방향은 시간이 지나며 조금씩 변하게(전체 “흐르는 방향”이 완전 고정되지 않게)
      const driftAngleBase = (driftDirection.baseAngleDeg * Math.PI) / 180;
      const driftAngleWander =
        Math.sin(simNowSec * driftDirection.angleWanderSpeed) * 0.26 * (1 + 0.55 * pressBoost01);
      const driftAngle = driftAngleBase + driftAngleWander;
      const driftVec = { x: Math.cos(driftAngle), y: Math.sin(driftAngle) };

      for (const spec of layersSpec) {
        const arr = layersRef.current[spec.id];

        // 1) update / cull
        for (let i = arr.length - 1; i >= 0; i--) {
          const p = arr[i];
          p.life -= simDt;
          if (p.life <= 0) {
            arr.splice(i, 1);
            continue;
          }

          const ageT = 1 - p.life / Math.max(0.0001, p.maxLife); // 0..1

          const t = simNowSec * 0.12 + spec.seed * 0.0002 + p.turbulenceSeed * 0.00001;
          const flow = curlField(p.x * spec.flowScale, p.y * spec.flowScale, t, spec.seed);

          const nTurb =
            fbm2D(p.x * 0.012, p.y * 0.012, p.turbulenceSeed + simNowSec * 0.035, 3) - 0.5;

          const drag = Math.exp(-respawnStrategy.dragPerSec[spec.id] * simDt);

          const speedPx = spec.speedPxBase * flowSpeed[spec.id];
          const turbK = turbulenceAmount[spec.id];

          const flowK = (0.16 + 0.12 * ageT) * (1 + 0.45 * pressBoost01);
          p.vx =
            p.vx * drag +
            flow.vx * speedPx * flowK +
            driftVec.x * speedPx * driftDirection.driftStrength * 0.02 +
            nTurb * 3.1 * turbK * simDt * (1 + 0.65 * pressBoost01);
          p.vy =
            p.vy * drag +
            flow.vy * speedPx * flowK +
            driftVec.y * speedPx * driftDirection.driftStrength * 0.012 +
            (-spec.upwardBiasPx * (0.12 + 0.20 * (1 - ageT))) * (1 + 0.55 * pressBoost01) +
            nTurb * 2.2 * turbK * simDt * (1 + 0.55 * pressBoost01);

          p.x += p.vx * simDt;
          p.y += p.vy * simDt;

          if (p.x < -paddingX || p.x > w + paddingX || p.y < -paddingY || p.y > h + paddingY) {
            arr.splice(i, 1);
            continue;
          }
        }

        // 2) spawn to target (respawnStrategy: 항상 유지)
        const need = targets[spec.id] - arr.length;
        if (need > 0) {
          const extraBurst = Math.round(ambientDensity.spawnMaxPerFrame * 0.9 * pressBoost01);
          const burstCap = ambientDensity.spawnMaxPerFrame + extraBurst;
          const burst = Math.min(need, burstCap);
          for (let k = 0; k < burst; k++) {
            const p = spawnAmbientParticle(spec.id, w, h, spec.seed + k * 77, smokeSeedRef.current, layersSpec, pressBoost01);
            if (!p) continue;
            arr.push(p);
          }
        }

        // 3) render: far->mid->near 순서가 유지되도록 이 루프 순서를 spec 배열 순서로 고정
        ctx.globalCompositeOperation = spec.blend;
        for (let i = 0; i < arr.length; i++) {
          // layer별 알파를 추가로 미세 조절(너무 하얗게 덮이지 않게)
          const baseLayerAlphaScale = spec.id === "far" ? 0.80 : spec.id === "mid" ? 0.92 : 1.0;
          const pressAlphaScale = spec.id === "near" || spec.id === "mid" ? 1 + 0.06 * pressBoost01 : 1;
          const layerAlphaScale = baseLayerAlphaScale * pressAlphaScale;
          // renderSmokeParticle 내부 alphaEff는 p.alpha에서 나오므로, p.alpha를 직접 바꾸지 않고
          // alphaScale을 p.alpha에 반영하기 위해 임시로 계산
          const p = arr[i];
          const originalAlpha = p.alpha;
          p.alpha = originalAlpha * layerAlphaScale;
          renderSmokeParticle(ctx, p, simNowSec, smokeSeedRef.current, lowPowerRef.current ? "low" : "medium");
          p.alpha = originalAlpha;
        }
      }

      rafRef.current = requestAnimationFrame(step);
    };

    rafRef.current = requestAnimationFrame(step);

    return () => {
      mounted = false;
      pressingRafMountedRef.current = false;
      window.removeEventListener("resize", resize);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [canvasRef, layersSpec]);
}

