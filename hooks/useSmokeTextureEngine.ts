"use client";

import type { RefObject } from "react";
import { useEffect, useMemo, useRef } from "react";
import type { EmitterPoint } from "@/store/usePressInteractionStore";
import type { SmokeMode } from "@/types/smokeMode";
import { clamp, fbm2D, lerp, smoothstep } from "@/lib/noise";

type SmokeLayerId = "veil" | "mid" | "dense";

type SmokeTextureEngineOptions = {
  kind: "ambient" | "trick";
  pressing: boolean;
  smokeMode: SmokeMode;
  intensity: number; // 0..1.5-ish
  emitter: EmitterPoint | null;
  lowPower: boolean;
};

type LayerSpec = {
  id: SmokeLayerId;
  color: [number, number, number];
  opacityMax: number; // 0..1, per-layer max alpha multiplier
  threshold: number; // density -> alpha threshold
  softRange: number; // how wide threshold band is
  tearFreq: number;
  tearSpeed: number;
  chunkFreq: number;
  chunkSpeed: number;
  warpFreq: number;
  warpSpeed: number;
  baseFreq: number;
  baseSpeed: number;
  detailFreq: number;
  detailSpeed: number;
  sourceWidthBase: number; // plume width in normalized coords
  sourceLenBase: number; // plume length in normalized coords
  driftXScale: number; // how much layer allows lateral drift
  flowSpeed: number; // noise time scaling for that layer
};

const clamp01 = (n: number) => clamp(n, 0, 1);

function smoothstep01FromRange(t: number) {
  // clamp -> smoothstep
  return smoothstep(clamp01(t));
}

function vecNorm(x: number, y: number) {
  const m = Math.hypot(x, y) || 1;
  return { x: x / m, y: y / m };
}

function makeAlphaTextureBuffers(size: number) {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  const img = ctx.createImageData(size, size);
  return { canvas, ctx, img, data: img.data };
}

/** putImageData 직후 stride 경계를 부드럽게(메인 draw 블러와 중복되지 않게 약하게). */
function softenTextureCanvas(
  off: NonNullable<ReturnType<typeof makeAlphaTextureBuffers>>,
  size: number,
  blurPx: string
) {
  const tmp = document.createElement("canvas");
  tmp.width = size;
  tmp.height = size;
  const tctx = tmp.getContext("2d");
  if (!tctx) return;
  tctx.imageSmoothingEnabled = true;
  (tctx as CanvasRenderingContext2D & { imageSmoothingQuality?: string }).imageSmoothingQuality = "high";
  tctx.filter = blurPx;
  tctx.drawImage(off.canvas, 0, 0, size, size);
  off.ctx.clearRect(0, 0, size, size);
  off.ctx.filter = "none";
  off.ctx.drawImage(tmp, 0, 0);
}

/** 가우시안에 가깝게 이중 패스(사진형 부드러운 연무) */
function softenTextureCanvasTwice(
  off: NonNullable<ReturnType<typeof makeAlphaTextureBuffers>>,
  size: number,
  a: string,
  b: string
) {
  softenTextureCanvas(off, size, a);
  softenTextureCanvas(off, size, b);
}

function densityToAlpha(density01: number, threshold: number, softRange: number) {
  // density in [0..1], threshold in [0..1], softRange ~ 0.05..0.15
  const t = (density01 - threshold) / Math.max(0.0001, softRange);
  return smoothstep01FromRange(t);
}

export function useSmokeTextureEngine(
  canvasRef: RefObject<HTMLCanvasElement | null>,
  { kind, pressing, smokeMode, intensity, emitter, lowPower }: SmokeTextureEngineOptions
) {
  const mountedRef = useRef(false);
  const rafRef = useRef<number | null>(null);
  const lastAtRef = useRef<number>(0);

  const layersOffscreenRef = useRef<Record<SmokeLayerId, ReturnType<typeof makeAlphaTextureBuffers> | null>>({
    veil: null,
    mid: null,
    dense: null,
  });

  const texSizeRef = useRef(0);
  const lastRebuildAtRef = useRef(0);
  const rebuildLayerIndexRef = useRef(0);
  const rectRef = useRef<{ w: number; h: number; left: number; top: number }>({ w: 0, h: 0, left: 0, top: 0 });
  const prevPressingRef = useRef(false);
  /** 누르고 있는 누적 시간(초) — 강도가 상한에 도달한 뒤에도 연기가 계속 쌓이게 스케일에 사용 */
  const pressDurationSecRef = useRef(0);
  const lastStepAtMsRef = useRef(0);

  const emitterRef = useRef<EmitterPoint | null>(emitter);
  emitterRef.current = emitter;
  useEffect(() => {
    emitterRef.current = emitter;
  }, [emitter]);

  const pressingRef = useRef(pressing);
  pressingRef.current = pressing;
  useEffect(() => {
    pressingRef.current = pressing;
  }, [pressing]);

  const intensityRef = useRef(intensity);
  intensityRef.current = intensity;
  useEffect(() => {
    intensityRef.current = intensity;
  }, [intensity]);

  const smokeModeRef = useRef(smokeMode);
  smokeModeRef.current = smokeMode;
  useEffect(() => {
    smokeModeRef.current = smokeMode;
  }, [smokeMode]);

  const lowPowerRef = useRef(lowPower);
  lowPowerRef.current = lowPower;
  useEffect(() => {
    lowPowerRef.current = lowPower;
  }, [lowPower]);

  const opts = useMemo(() => {
    // CPU 비용은 대부분 (texSize² × 픽셀당 noise) 이므로 상한·갱신 주기를 보수적으로 둔다.
    // 도넛 모드에서 Ambient+Trick 이 동시에 돌아가므로 기본값은 여유 있게(끊김 완화).
    const ambient = {
      veilOpacity: lowPower ? 0.12 : 0.15,
      midOpacity: lowPower ? 0.15 : 0.18,
      denseOpacity: lowPower ? 0.17 : 0.21,
      texSize: lowPower ? 100 : 124,
      rebuildMs: lowPower ? 380 : 330,
      fadeIdle: lowPower ? 0.06 : 0.055,
      fadePress: lowPower ? 0.038 : 0.032,
      drawPaddingFrac: 0.08,
      drawScaleX: 1.14,
      drawScaleY: 1.18,
    };

    const trick = {
      veilOpacity: lowPower ? 0.07 : 0.08,
      midOpacity: lowPower ? 0.10 : 0.11,
      denseOpacity: lowPower ? 0.11 : 0.13,
      texSize: lowPower ? 88 : 104,
      rebuildMs: lowPower ? 350 : 310,
      fadeIdle: 0.085,
      fadePress: lowPower ? 0.052 : 0.044,
      drawPaddingFrac: 0.10,
      drawScaleX: 1.16,
      drawScaleY: 1.12,
    };

    return kind === "ambient" ? ambient : trick;
  }, [kind, lowPower]);

  const texQuality = useMemo(() => {
    // 픽셀 단위 procedural 생성 비용이 크므로 화면 크기에 맞춰 해상도를 자동으로 내린다.
    // (upperCap = opts.texSize) — 너무 작으면 전체 화면 draw 시 "사각 타일"이 보이므로 하한·비율을 확보.
    return {
      min: kind === "ambient" ? 84 : 64,
      max: opts.texSize,
      scale: kind === "ambient" ? 0.114 : 0.082,
    };
  }, [kind, opts.texSize]);

  const layersSpec = useMemo<LayerSpec[]>(() => {
    const photoreal = kind === "ambient";
    // 배경 전체: 사진처럼 밝은 그레이스케일 연기(중앙 밀도↑, 가장자리 페더)
    const veil: LayerSpec = {
      id: "veil",
      color: photoreal ? [238, 242, 250] : [195, 210, 218],
      opacityMax: opts.veilOpacity * (photoreal ? 1.12 : 1),
      threshold: photoreal ? 0.42 : 0.55,
      softRange: photoreal ? 0.165 : 0.11,
      tearFreq: photoreal ? 9.2 : 9.5,
      tearSpeed: photoreal ? 0.078 : 0.08,
      chunkFreq: photoreal ? 3.5 : 3.4,
      chunkSpeed: photoreal ? 0.058 : 0.06,
      warpFreq: photoreal ? 1.75 : 1.8,
      warpSpeed: photoreal ? 0.082 : 0.09,
      baseFreq: photoreal ? 2.1 : 2.2,
      baseSpeed: photoreal ? 0.055 : 0.065,
      detailFreq: photoreal ? 5.2 : 5.0,
      detailSpeed: photoreal ? 0.095 : 0.1,
      sourceWidthBase: 0.24,
      sourceLenBase: 0.65,
      driftXScale: 0.26,
      flowSpeed: 0.85,
    };

    const mid: LayerSpec = {
      id: "mid",
      color: photoreal ? [224, 232, 244] : [186, 202, 220],
      opacityMax: opts.midOpacity * (photoreal ? 1.1 : 1),
      threshold: photoreal ? 0.38 : 0.5,
      softRange: photoreal ? 0.135 : 0.09,
      tearFreq: photoreal ? 10.5 : 12.0,
      tearSpeed: photoreal ? 0.1 : 0.11,
      chunkFreq: photoreal ? 3.9 : 4.1,
      chunkSpeed: photoreal ? 0.072 : 0.075,
      warpFreq: photoreal ? 1.9 : 2.0,
      warpSpeed: photoreal ? 0.095 : 0.105,
      baseFreq: photoreal ? 2.45 : 2.5,
      baseSpeed: photoreal ? 0.075 : 0.085,
      detailFreq: photoreal ? 6.0 : 6.0,
      detailSpeed: photoreal ? 0.11 : 0.12,
      sourceWidthBase: 0.2,
      sourceLenBase: 0.55,
      driftXScale: 0.4,
      flowSpeed: 1.0,
    };

    const dense: LayerSpec = {
      id: "dense",
      color: photoreal ? [218, 226, 242] : [182, 197, 212],
      opacityMax: opts.denseOpacity * (photoreal ? 1.08 : 1),
      threshold: photoreal ? 0.34 : 0.45,
      softRange: photoreal ? 0.118 : 0.075,
      tearFreq: photoreal ? 12.0 : 14.0,
      tearSpeed: photoreal ? 0.12 : 0.14,
      chunkFreq: photoreal ? 4.4 : 4.8,
      chunkSpeed: photoreal ? 0.088 : 0.1,
      warpFreq: photoreal ? 2.05 : 2.2,
      warpSpeed: photoreal ? 0.105 : 0.12,
      baseFreq: photoreal ? 2.85 : 2.9,
      baseSpeed: photoreal ? 0.095 : 0.11,
      detailFreq: photoreal ? 6.8 : 7.0,
      detailSpeed: photoreal ? 0.13 : 0.14,
      sourceWidthBase: 0.165,
      sourceLenBase: 0.5,
      driftXScale: 0.58,
      flowSpeed: 1.1,
    };

    return [veil, mid, dense];
  }, [kind, opts.denseOpacity, opts.midOpacity, opts.veilOpacity]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    ctx.imageSmoothingEnabled = true;
    (ctx as CanvasRenderingContext2D & { imageSmoothingQuality?: string }).imageSmoothingQuality = "high";

    mountedRef.current = true;

    let offscreenReady = false;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      rectRef.current = { w: rect.width, h: rect.height, left: rect.left, top: rect.top };
      const dprRaw = window.devicePixelRatio || 1;
      // 연기 레이어는 풀 DPR보다 낮은 DPR로도 충분하고, fill/draw 비용이 크게 줄어든다.
      const dprCap = lowPower ? 1.0 : 1.15;
      const dpr = Math.max(1, Math.min(dprCap, dprRaw));
      canvas.width = Math.floor(rect.width * dpr);
      canvas.height = Math.floor(rect.height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // texture size only depends on lowPower/kind
      const minDim = Math.max(1, Math.min(rect.width, rect.height));
      const targetTex = Math.max(texQuality.min, Math.min(texQuality.max, Math.round(minDim * texQuality.scale)));
      if (!offscreenReady || texSizeRef.current !== targetTex) {
        texSizeRef.current = targetTex;
        offscreenReady = true;

        for (const s of layersSpec) {
          layersOffscreenRef.current[s.id] = makeAlphaTextureBuffers(targetTex);
        }
      }
    };

    resize();
    // Ambient·Trick 이 동시에 켜질 때(도넛) 텍스처 재생성이 같은 프레임에 겹치지 않게 약간 어긋난다.
    lastRebuildAtRef.current =
      performance.now() - (kind === "trick" ? opts.rebuildMs * 0.42 : 0);
    window.addEventListener("resize", resize);

    const rebuildOneLayer = (
      spec: LayerSpec,
      li: number,
      nowSec: number,
      rectLeft: number,
      rectTop: number,
      w: number,
      h: number
    ) => {
      const currentEmitter = emitterRef.current;

      // nozzle position in normalized screen coords (0..1)
      const nozzleXNorm =
        currentEmitter && w > 0 ? clamp01((currentEmitter.clientX - rectLeft) / Math.max(0.0001, w)) : 0.5;
      const nozzleYNorm =
        currentEmitter && h > 0 ? clamp01((currentEmitter.clientY - rectTop) / Math.max(0.0001, h)) : 0.28;

      const driftX = currentEmitter ? clamp(currentEmitter.driftX, -1, 1) : 0;
      const baseDir = vecNorm(driftX * 0.6, -1);

      // power: 0..1 (clamp), then press gates it.
      const intensity01 = clamp01(intensityRef.current / 1.5);
      const power01 = pressingRef.current ? intensity01 : 0;
      const pressBoost = pressingRef.current ? lerp(0.22, 1.0, Math.pow(power01, 0.85)) : 0.0;
      const holdSec = pressDurationSecRef.current;
      const spreadMul = 1 + 0.38 * clamp01(holdSec / 5);

      const off = layersOffscreenRef.current[spec.id];
      if (!off || !off.data) return;

      const size = texSizeRef.current;
      const { data } = off;

      const t = nowSec * (0.55 + 0.85 * spec.flowSpeed);
      const seed = 10000 + li * 1337 + Math.floor(intensity01 * 100) + (pressingRef.current ? 1 : 0) * 17;

        const layerDirX =
          baseDir.x * spec.driftXScale +
          (smokeModeRef.current !== "normal" && kind === "trick" ? driftX * 0.1 : 0);
        const layerDir = vecNorm(layerDirX, baseDir.y);

        const warpAmt = 0.06 + 0.1 * pressBoost + 0.04 * clamp01(holdSec / 6);

        const trickDonutMul = kind === "trick" && smokeModeRef.current === "donut" ? 1.55 : 1;
        const sourceWidth =
          spec.sourceWidthBase *
          (0.75 + 0.65 * pressBoost) *
          spreadMul *
          (kind === "trick" ? 0.82 * trickDonutMul : 1);
        const sourceLen =
          spec.sourceLenBase *
          (0.65 + 0.72 * pressBoost) *
          (1.05 + 0.2 * clamp01(holdSec / 4));

      // stride 3은 업스케일 시 눈에 띄는 사각 타일을 만든다. 2로 유지하고 스무딩·블러로 부드럽게 한다.
      const stride = 2;
      for (let y = 0; y < size; y += stride) {
        const py = (y + 0.5) / size;
        for (let x = 0; x < size; x += stride) {
          const px = (x + 0.5) / size;

          // Domain warp (noise-based): irregular but no radial-distance blobs.
          const w1 = fbm2D(px * spec.warpFreq + t * spec.warpSpeed, py * spec.warpFreq - t * spec.warpSpeed, seed + 1, 1);
          const w2 = fbm2D(px * spec.warpFreq * 1.13 - t * spec.warpSpeed, py * spec.warpFreq * 0.97 + t * spec.warpSpeed, seed + 7, 1);
          const ux = px + (w1 - 0.5) * warpAmt;
          const uy = py + (w2 - 0.5) * warpAmt;

          const adv = t * spec.baseSpeed * (0.10 + 0.50 * pressBoost);
          const nBase = fbm2D(
            ux * spec.baseFreq + adv,
            uy * spec.baseFreq - adv,
            seed + 21,
            kind === "ambient" ? 3 : 1
          );
          const nDetail = fbm2D(ux * spec.detailFreq - adv * 0.7, uy * spec.detailFreq + adv * 0.7, seed + 33, kind === "ambient" ? 2 : 1);
          const nChunk = fbm2D(ux * spec.chunkFreq + t * spec.chunkSpeed, uy * spec.chunkFreq - t * spec.chunkSpeed, seed + 55, kind === "ambient" ? 2 : 1);

          let density = kind === "ambient"
            ? nBase * 0.5 + nDetail * 0.32 + nChunk * 0.18
            : nBase * 0.63 + nDetail * 0.22 + nChunk * 0.15;

          // Ambient: 누를 때만 전체 연무 띠(+ 노즐 플룸과 합성)
          if (kind === "ambient") {
            const bandCenter = 0.46 + 0.028 * Math.sin(t * 0.1 + seed * 0.0007);
            const bandBreath = 0.42 + 0.09 * fbm2D(t * 0.06, 0.41 + li * 0.12, seed + 280, 1);
            const dBand = Math.abs(uy - bandCenter) / Math.max(0.06, bandBreath * 0.52);
            const edgeTurb = fbm2D(ux * 4.8 + t * 0.012, uy * 5.2 - t * 0.03, seed + 512, 2);
            let bandCore = Math.pow(smoothstep(clamp01(1 - dBand / 1.08)), 1.12);
            bandCore *= 0.78 + 0.22 * edgeTurb;
            const billow = fbm2D(ux * 3.4 + t * 0.014, uy * 4.2 - t * 0.038, seed + 401, 2);
            const bandDensity = bandCore * (0.4 + 0.45 * billow) * (0.82 + 0.18 * nChunk);

            const upperBlend = clamp01((0.24 - uy) / 0.22) * clamp01((uy - 0.04) / 0.14);
            const upperHaze = upperBlend * (0.12 + 0.14 * nDetail);

            const lowerBlend = clamp01((uy - 0.76) / 0.22) * clamp01((0.96 - uy) / 0.14);
            const lowerHaze = lowerBlend * (0.1 + 0.12 * nBase);

            const sideDist = Math.abs(ux - 0.5);
            const sideFill = clamp01((0.12 - sideDist) / 0.1) * 0.08 * (0.55 + 0.45 * nDetail);

            const bandGain = 0.78 + 0.32 * pressBoost + 0.2 * clamp01(holdSec / 4);
            density = clamp01(
              (density * (0.38 + 0.62 * (1 - 0.35 * bandCore)) + bandDensity * 0.92 * bandGain + upperHaze + lowerHaze + sideFill) *
                (0.88 + 0.2 * clamp01(holdSec / 3.5))
            );
          }

          // Source term: distance to a flow axis (line-based, not radial).
          const dx = ux - nozzleXNorm;
          const dy = uy - nozzleYNorm;
          const along = dx * layerDir.x + dy * layerDir.y;
          const perp = dx * -layerDir.y + dy * layerDir.x;

          const along01 = clamp01(along / Math.max(0.0001, sourceLen));
          const side01 = clamp01(1 - Math.abs(perp) / Math.max(0.0001, sourceWidth));
          const sourceGate = along > 0 ? smoothstep(along01) * smoothstep(side01) : 0;

          if (pressBoost > 0) {
            const sNoise = fbm2D(
              ux * (1.6 + 1.2 * pressBoost) + t * 0.16,
              uy * (1.4 + 0.9 * pressBoost) - t * 0.12,
              seed + 99,
              1
            );
            const plumeGain = 1 + 0.42 * clamp01(holdSec / 4);
            density +=
              sourceGate *
              (0.14 + 0.38 * pressBoost) *
              plumeGain *
              (0.65 + 0.75 * (sNoise - 0.15));

            if (smokeModeRef.current === "donut" && kind === "trick") {
              const ang = (t * 0.95 + sNoise * 2.0) * Math.PI * 0.52;
              const sideWarp = clamp01(
                1 - (Math.abs(perp + Math.sin(ang) * sourceWidth * 0.28) / Math.max(0.0001, sourceWidth)) * (0.84 + 0.28 * sNoise)
              );

              // 레퍼런스 형태: 굵은 원형 링 + 뒤로 찢어지는 연무 꼬리
              const spacing = 0.23;
              const travel = t * (0.5 + 0.22 * pressBoost);
              const packetCoord = along01 - travel;
              const nearestCenter = Math.round(packetCoord / spacing) * spacing;
              const packetDist = Math.abs(packetCoord - nearestCenter);
              const packetMask = Math.exp(-Math.pow(packetDist / Math.max(0.0001, spacing * 0.3), 2.0));

              const shellRadius = sourceWidth * (1.08 + 0.12 * sNoise);
              const shell = Math.exp(
                -Math.pow((Math.abs(perp) - shellRadius) / Math.max(0.0001, sourceWidth * 0.18), 2.0)
              );
              const core = Math.exp(-Math.pow(Math.abs(perp) / Math.max(0.0001, sourceWidth * 0.42), 2.0));
              const donutBody = clamp01(shell - core * 0.93);

              const trailAxis = clamp01(1 - Math.abs(perp) / Math.max(0.0001, sourceWidth * 0.95));
              const tailGate = clamp01((nearestCenter + spacing * 0.48 - along01) / (spacing * 1.8));
              const tailNoise = fbm2D(
                ux * (6.8 + 2.2 * pressBoost) + t * 0.21,
                uy * (5.4 + 1.6 * pressBoost) - t * 0.17,
                seed + 141,
                1
              );
              const tailStrand = Math.pow(clamp01(tailNoise * 1.25 - 0.2), 1.35);

              density += sourceGate * 0.1 * (0.7 + 0.6 * sideWarp) * pressBoost;
              density += sourceGate * donutBody * packetMask * (0.72 + 0.36 * pressBoost);
              density += sourceGate * trailAxis * tailGate * tailStrand * (0.22 + 0.24 * pressBoost);
            } else if (smokeModeRef.current === "dragon" && kind === "trick") {
              // 용의 몸통처럼 S자 흐름을 강조: 주축을 따라 리지(ridge)를 여러 개 겹친다.
              const bodyWave = Math.sin(along * 24.0 - t * 7.2 + sNoise * 4.0);
              const neckWave = Math.sin(along * 12.5 - t * 4.1 + 1.2);
              const ridge = clamp01(1 - Math.abs(perp - bodyWave * sourceWidth * 0.42) / Math.max(0.0001, sourceWidth * 0.78));
              const ridge2 = clamp01(1 - Math.abs(perp + neckWave * sourceWidth * 0.24) / Math.max(0.0001, sourceWidth * 0.66));
              const jaw = clamp01(1 - Math.abs(perp - sourceWidth * 0.62) / Math.max(0.0001, sourceWidth * 0.95));
              const headGate = smoothstep(clamp01((along01 - 0.72) / 0.22));
              density += sourceGate * (0.13 + 0.14 * ridge + 0.1 * ridge2) * (0.7 + 0.6 * pressBoost);
              density += headGate * jaw * 0.11 * (0.7 + 0.3 * sNoise) * pressBoost;
            }
          }

          const holdGrow = 1 + 0.52 * Math.pow(clamp01(holdSec / 4), 0.9);
          density = clamp01(density * holdGrow);

          let a = densityToAlpha(density, spec.threshold, spec.softRange);

          const distToTh = Math.abs(density - spec.threshold);
          const edgeBand = clamp01(1 - distToTh / Math.max(0.0001, spec.softRange * 1.8));
          const tearN = clamp01(fbm2D(ux * spec.tearFreq + t * spec.tearSpeed, uy * spec.tearFreq - t * spec.tearSpeed, seed + 77, 1));
          const tear = 0.35 + 0.65 * Math.pow(tearN, 1.6);
          // ambient: 찢김(tear)이 과하면 타일+노이즈 느낌으로 읽힘 → 약하게
          a *=
            kind === "ambient"
              ? 1 - edgeBand * (0.08 + 0.14 * tear)
              : 1 - edgeBand * (0.28 + 0.42 * tear);

          const patchN = clamp01(nChunk * 0.55 + nDetail * 0.45);
          a *=
            kind === "ambient"
              ? 0.82 + 0.42 * Math.pow(patchN, 1.05)
              : 0.7 + 0.55 * Math.pow(patchN, 1.25);

          if (kind === "ambient") {
            const ac = clamp01(a);
            a = 1 - Math.pow(1 - ac, 1.1);
          }

          const opacityPressScale =
            kind === "ambient"
              ? lerp(0.24, 1.0, pressBoost) * (0.94 + 0.14 * clamp01(holdSec / 4))
              : lerp(0.45, 1.0, pressBoost);
          const opacityLayerScale = spec.opacityMax * opacityPressScale;
          const alphaMultiplier = kind === "trick" ? 0.65 + 0.55 * pressBoost : 0.55 + 0.65 * pressBoost;
          a *= opacityLayerScale * alphaMultiplier;

          a = Math.min(a, spec.opacityMax * 1.08);

          const aByte = Math.round(255 * clamp01(a));
          const densForShade = clamp01(density);
          const shade =
            kind === "ambient"
              ? clamp(0.58 + 0.42 * Math.pow(densForShade, 0.62) + 0.1 * (nDetail - 0.5), 0.5, 1.12)
              : 1;
          const r = Math.round(clamp(spec.color[0] * shade, 0, 255));
          const g = Math.round(clamp(spec.color[1] * shade, 0, 255));
          const b = Math.round(clamp(spec.color[2] * shade, 0, 255));
          for (let oy = 0; oy < stride && y + oy < size; oy++) {
            for (let ox = 0; ox < stride && x + ox < size; ox++) {
              const idx = ((y + oy) * size + (x + ox)) * 4;
              data[idx + 0] = r;
              data[idx + 1] = g;
              data[idx + 2] = b;
              data[idx + 3] = aByte;
            }
          }
        }
      }

      off.ctx.putImageData(off.img, 0, 0);
      if (kind === "ambient") {
        if (lowPowerRef.current) {
          softenTextureCanvas(off, size, "blur(0.75px)");
        } else {
          softenTextureCanvasTwice(off, size, "blur(0.95px)", "blur(0.55px)");
        }
      } else {
        softenTextureCanvas(
          off,
          size,
          lowPowerRef.current ? "blur(0.8px)" : "blur(0.5px)"
        );
      }
    };

    const step = (now: number) => {
      if (!mountedRef.current) return;
      lastAtRef.current = now;

      const rr = rectRef.current;
      const w = rr.w || canvas.clientWidth;
      const h = rr.h || canvas.clientHeight;
      const rectLeft = rr.left;
      const rectTop = rr.top;
      const nowSec = now / 1000;

      const intensity01 = clamp01(intensityRef.current / 1.5);
      const isPressing = pressingRef.current;
      const pressedNow = isPressing && !prevPressingRef.current;

      const dtMs =
        lastStepAtMsRef.current > 0 ? Math.min(120, Math.max(0, now - lastStepAtMsRef.current)) : 0;
      lastStepAtMsRef.current = now;
      if (isPressing) {
        pressDurationSecRef.current += dtMs / 1000;
      } else {
        pressDurationSecRef.current = 0;
      }

      if (!isPressing && prevPressingRef.current) {
        for (const s of layersSpec) {
          const off = layersOffscreenRef.current[s.id];
          if (off?.data) {
            off.data.fill(0);
            off.ctx.putImageData(off.img, 0, 0);
          }
        }
      }

      // 짧은 클릭에서도 트릭(도넛/드래곤)이 바로 보이도록 press 시작 프레임에 즉시 텍스처를 준비한다.
      if (pressedNow) {
        for (let li = 0; li < layersSpec.length; li++) {
          rebuildOneLayer(layersSpec[li], li, nowSec, rectLeft, rectTop, w, h);
        }
        lastRebuildAtRef.current = now;
      }
      prevPressingRef.current = isPressing;

      // 연기는 포인터다운 중에만 — idle 은 빠르게 검게 정리(잔상·그라데이션 착시 제거)
      if (!isPressing) {
        if (kind === "trick") {
          // 트릭은 투명 캔버스에서 알파만 천천히 깎아 잔상이 오래 남게 한다.
          ctx.globalCompositeOperation = "destination-out";
          const trickFade = lowPowerRef.current ? 0.01 : 0.008;
          ctx.fillStyle = `rgba(0,0,0,${trickFade})`;
          ctx.fillRect(0, 0, w, h);
          ctx.globalCompositeOperation = "source-over";
        } else {
          ctx.globalCompositeOperation = "source-over";
          const fadeClear = lowPowerRef.current ? 0.16 : 0.12;
          ctx.fillStyle = `rgba(0,0,0,${fadeClear})`;
          ctx.fillRect(0, 0, w, h);
        }
        rafRef.current = requestAnimationFrame(step);
        return;
      }

      // 길게 누를수록 잔상을 더 남겨 화면에 연기가 쌓이는 느낌(강도 상한 이후에도 유지)
      const holdSec = pressDurationSecRef.current;
      const fade = lerp(opts.fadeIdle, opts.fadePress, Math.pow(intensity01, 0.72));
      const fadeEff = fade * lerp(1, 0.5, clamp01(holdSec / 5.5));

      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = `rgba(0,0,0,${fadeEff})`;
      ctx.fillRect(0, 0, w, h);

      // rebuild textures on interval (time-sliced): 매번 레이어 1개만 갱신한다.
      const minDim = Math.max(1, Math.min(w, h));
      const largeBoost = minDim >= 900 ? (lowPowerRef.current ? 1.45 : 1.2) : 1;
      const intensityBoost = 1 - 0.22 * clamp01(intensity01) - 0.12 * clamp01(holdSec / 5);
      const rebuildInterval = opts.rebuildMs * largeBoost * Math.max(0.62, intensityBoost);
      if (now - lastRebuildAtRef.current >= rebuildInterval) {
        const li = rebuildLayerIndexRef.current % layersSpec.length;
        rebuildLayerIndexRef.current = (li + 1) % layersSpec.length;
        rebuildOneLayer(layersSpec[li], li, nowSec, rectLeft, rectTop, w, h);
        lastRebuildAtRef.current = now;
      }

      const drawPad = opts.drawPaddingFrac * Math.min(w, h);
      const isDonutTrick = kind === "trick" && smokeModeRef.current === "donut";
      const drawW = w * opts.drawScaleX * (isDonutTrick ? 1.22 : 1);
      const drawH = h * opts.drawScaleY * (isDonutTrick ? 1.18 : 1);

      const currentEmitter = emitterRef.current;
      const driftX = currentEmitter ? clamp(currentEmitter.driftX, -1, 1) : 0;

      for (let li = 0; li < layersSpec.length; li++) {
        const spec = layersSpec[li];
        const off = layersOffscreenRef.current[spec.id];
        if (!off || !off.canvas) continue;

        const t = nowSec * (0.9 + li * 0.13);
        const wobX =
          Math.sin(t * (0.55 + li * 0.14) + li * 10.1) * (drawW * 0.014 + drawPad * 0.016);
        const wobY =
          Math.cos(t * (0.48 + li * 0.12) + li * 6.3) * (drawH * 0.011 + drawPad * 0.014);
        const side = driftX * spec.driftXScale * (drawW * 0.022);

        const dx = -drawPad + wobX + side;
        const dy = -drawPad + wobY - li * 0.5;

        if (kind === "trick" && smokeModeRef.current !== "donut" && smokeModeRef.current !== "dragon") continue;

        if (kind === "ambient") {
          ctx.globalCompositeOperation = li === 0 ? "source-over" : "screen";
          ctx.globalAlpha = li === 0 ? 1 : li === 1 ? 0.72 : 0.62;
        } else {
          // 도넛/용 트릭은 밝은 합성으로 고리 윤곽을 또렷하게 보이게 한다.
          ctx.globalCompositeOperation = "screen";
          ctx.globalAlpha = smokeModeRef.current === "donut" ? 1.18 : 1.0;
        }
        ctx.filter =
          kind === "ambient"
            ? lowPowerRef.current
              ? "blur(0.7px)"
              : "blur(0.5px)"
            : smokeModeRef.current === "donut"
              ? lowPowerRef.current
                ? "blur(0.38px)"
                : "blur(0.2px)"
              : lowPowerRef.current
                ? "blur(0.65px)"
                : "blur(0.4px)";
        ctx.drawImage(off.canvas, dx, dy, drawW, drawH);
        ctx.filter = "none";
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = "source-over";
      }

      if (kind === "ambient") {
        const denseOff = layersOffscreenRef.current.dense;
        if (denseOff?.canvas) {
          const t = nowSec * (0.9 + 2 * 0.13);
          const wobX = Math.sin(t * (0.55 + 2 * 0.14) + 20.1) * (drawW * 0.012 + drawPad * 0.014);
          const wobY = Math.cos(t * (0.48 + 2 * 0.12) + 16.3) * (drawH * 0.014 + drawPad * 0.012);
          const side = driftX * layersSpec[2].driftXScale * (drawW * 0.02);
          const dx = -drawPad + wobX + side;
          const dy = -drawPad + wobY - 1;
          ctx.globalCompositeOperation = "screen";
          ctx.globalAlpha = lowPowerRef.current ? 0.14 : 0.2;
          ctx.filter = lowPowerRef.current ? "blur(1.1px)" : "blur(0.85px)";
          ctx.drawImage(denseOff.canvas, dx, dy, drawW * 1.02, drawH * 1.02);
          ctx.filter = "none";
          ctx.globalAlpha = 1;
          ctx.globalCompositeOperation = "source-over";
        }
      }

      rafRef.current = requestAnimationFrame(step);
    };

    rafRef.current = requestAnimationFrame(step);

    return () => {
      mountedRef.current = false;
      window.removeEventListener("resize", resize);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvasRef, layersSpec, opts.fadeIdle, opts.fadePress, opts.rebuildMs, opts.texSize, kind]);

  // caller must render the canvas element itself
  return null;
}

