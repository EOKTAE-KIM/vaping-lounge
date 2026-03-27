import { fbm2D } from "@/lib/noise";
import { clamp } from "@/lib/noise";
import { smokeQualityDefaults } from "@/components/smoke/smokePresets";

type SmokeParticleKind = "core" | "soft" | "wisp";

export type SmokeParticleLike = {
  kind: SmokeParticleKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  alpha: number;
  life: number;
  maxLife: number;
  turbulenceSeed: number;
  stretch: number;
  rotation: number;
  softness: number;
};

type StampKind = SmokeParticleKind;
type StampCache = Record<StampKind, HTMLCanvasElement[]>;

function smoothstep(t: number) {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
}

function makeStampTexture(size: number, seed: number, kind: StampKind) {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return canvas;

  const img = ctx.createImageData(size, size);
  const data = img.data;

  // 회색-청회 계열(순백 금지)
  const rgbByKind: Record<StampKind, [number, number, number]> = {
    core: [200, 225, 246],
    soft: [178, 205, 236],
    wisp: [155, 186, 216],
  };
  const [r0, g0, b0] = rgbByKind[kind];

  // 기본 타원(이미 원이 아닌 형태로 준비: 회전/스케일로 더 변형)
  const baseAspectX = kind === "wisp" ? 1.85 : kind === "soft" ? 1.55 : 1.35;
  const baseAspectY = kind === "wisp" ? 0.72 : kind === "soft" ? 0.82 : 0.88;

  // 중심부 "밀도" 및 가장자리 "feather" 차등
  const sharpness = kind === "core" ? 5.2 : kind === "soft" ? 4.0 : 3.0;
  const edgeFeather = kind === "core" ? 0.26 : kind === "soft" ? 0.30 : 0.35;

  // stamp 내부 구멍/끊김을 위한 노이즈는 "가장자리 영역"에서 더 강하게.
  const holePower = kind === "wisp" ? 2.2 : 1.6;

  // 채도/alpha 기준 (최종 렌더에서 또 곱해짐)
  const kindAlpha = kind === "core" ? 1.0 : kind === "soft" ? 0.72 : 0.48;

  const s2 = (size * 0.5) * 0.98;
  const cx = size * 0.5;
  const cy = size * 0.5;

  const seedA = seed * 0.001 + 10.21;
  const seedB = seed * 0.002 + 33.77;

  for (let py = 0; py < size; py++) {
    const ny0 = (py + 0.5 - cy) / s2;
    for (let px = 0; px < size; px++) {
      const nx0 = (px + 0.5 - cx) / s2;

      // 타원 거리(회전/스케일로 더 변형되지만 베이스부터 비원형)
      const nx = nx0 * baseAspectX;
      const ny = ny0 / baseAspectY;
      const d = Math.hypot(nx, ny); // 0..~1.2

      // feathered alpha: exp + smoothstep 혼합
      const base = Math.exp(-d * d * sharpness);
      const edgeT = 1 - smoothstep((d - 0.55) / edgeFeather);

      // 가장자리에서 더 "찢어지는" 느낌을 위해 hole mask를 섞는다.
      const nEdge = fbm2D(nx0 * 2.2 + seedA, ny0 * 2.0 + seedB, seed + 1.234, 3); // 0..1-ish
      const holeN = Math.pow(clamp(nEdge, 0, 1), holePower);

      // "가장자리 영역일수록" alpha를 깎아 불규칙한 테어(edge breakup)를 만든다.
      const edgeZone = smoothstep((d - 0.42) / 0.30); // 0..1, d가 클수록 edgeZone 증가
      let a = base * (0.65 + 0.35 * edgeT) * (0.75 + 0.25 * holeN);
      a *= 1 - edgeZone * (0.18 + 0.42 * (1 - holeN));

      // 미세 wisp 꼬임(방향성): nx/ny의 부호 조합으로 anisotropic 텍스처 차이를 준다.
      const dir = Math.sin((nx0 * 1.7 - ny0 * 2.2 + seed * 0.01) + nEdge * 3.1);
      a *= 0.82 + 0.22 * Math.abs(dir);

      a = clamp(a, 0, 1) * kindAlpha;

      const idx = (py * size + px) * 4;
      data[idx + 0] = r0;
      data[idx + 1] = g0;
      data[idx + 2] = b0;
      data[idx + 3] = Math.round(255 * a);
    }
  }

  ctx.putImageData(img, 0, 0);
  return canvas;
}

type QualityLevel = "low" | "medium" | "high";

const cache = new Map<string, StampCache>();

function getQualityStampParams(qualityLevel: QualityLevel) {
  if (qualityLevel === "low") {
    return {
      size: smokeQualityDefaults.stampSizeLow,
      variants: smokeQualityDefaults.stampVariantsLow,
    };
  }
  if (qualityLevel === "medium") {
    return {
      size: smokeQualityDefaults.stampSizeMedium,
      variants: smokeQualityDefaults.stampVariantsMedium,
    };
  }
  return {
    size: smokeQualityDefaults.stampSizeHigh,
    variants: smokeQualityDefaults.stampVariantsHigh,
  };
}

function getStampCache(qualityLevel: QualityLevel, smokeSeed: number): StampCache {
  const { size, variants } = getQualityStampParams(qualityLevel);
  const key = `${qualityLevel}:${size}:${variants}:${Math.floor(smokeSeed)}`;
  const existing = cache.get(key);
  if (existing) return existing;

  const mkArr = (kind: StampKind) => {
    const arr: HTMLCanvasElement[] = [];
    for (let i = 0; i < variants; i++) {
      arr.push(makeStampTexture(size, smokeSeed + i * 997 + (kind === "core" ? 11 : kind === "soft" ? 31 : 53), kind));
    }
    return arr;
  };

  const created: StampCache = {
    core: mkArr("core"),
    soft: mkArr("soft"),
    wisp: mkArr("wisp"),
  };
  cache.set(key, created);
  return created;
}

/**
 * smoke 파티클을 타원/회전/feathered alpha 기반으로 그린다.
 *
 * 렌더링은 stamp 텍스처를 재사용해 비용을 줄이고,
 * 개별 파티클의 `stretch/rotation/softness`와
 * `life`에 따른 alpha 커브로 "유체처럼" 이어지는 느낌을 만든다.
 */
export function renderSmokeParticle(
  ctx: CanvasRenderingContext2D,
  p: SmokeParticleLike,
  nowSec: number,
  smokeSeed: number,
  qualityLevel: QualityLevel
) {
  const stamps = getStampCache(qualityLevel, smokeSeed);

  const ageT = 1 - p.life / Math.max(0.0001, p.maxLife); // 0..1
  if (ageT >= 1) return;

  // 종류별 성장/감쇠: "몇 초 동안 끊기지 않고 흐르듯" 만들기
  const growth = p.kind === "core" ? 0.78 : p.kind === "soft" ? 1.05 : 1.25;
  const alphaPow = p.kind === "core" ? 1.25 : p.kind === "soft" ? 1.55 : 1.85;
  const densityBias = 0.74 + 0.26 * (1 - p.softness); // softness↑면 더 얇게 찢어짐 느낌

  const sizeEff = p.size * (1 + growth * ageT * (0.72 + 0.28 * (1 - p.softness)));
  const alphaBase = p.alpha * Math.pow(1 - ageT, alphaPow) * densityBias;
  if (alphaBase <= 0.001) return;

  // 경계 feather modulation: 텍스처 + per-particle seed 기반으로
  // 가장자리가 일정하지 않게 만들어 반복 원형 느낌을 줄인다.
  const tearN = fbm2D(p.x * 0.006 + nowSec * 0.11, p.y * 0.006 - nowSec * 0.07, p.turbulenceSeed + 3.21, 2);
  const tear = 0.75 + 0.45 * tearN; // 0.75..1.2-ish

  const alphaEff = clamp(alphaBase * tear, 0, 0.95);
  if (alphaEff <= 0.002) return;

  const variants = stamps[p.kind].length;
  const idx = Math.floor((p.turbulenceSeed + ageT * 17.0) * 0.35) % variants;
  const tex = stamps[p.kind][(idx + variants) % variants];

  // 회전/늘림 섞기: stamp는 원형이 아니라 타원형이지만
  // particle stretch로 더 "늘어진 베일" 느낌을 강하게 만든다.
  const rot = p.rotation + (p.vx * 0.0012 - p.vy * 0.0006) * (0.7 + 0.6 * ageT);
  const sx = p.stretch;
  const sy = 1;

  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(rot);
  ctx.scale(sx, sy);
  ctx.globalAlpha = alphaEff;
  // stamp 크기를 기준으로 "원하지 않는 원형 덩어리"가 되지 않도록
  // stamp는 sizeEff로 균일 스케일만 하고 stretch는 ctx.scale로 분리
  ctx.drawImage(tex, -sizeEff * 0.5, -sizeEff * 0.5, sizeEff, sizeEff);
  ctx.restore();
}

export function getQualityFrameFade(qualityLevel: QualityLevel) {
  if (qualityLevel === "low") return smokeQualityDefaults.frameFadeBaseLow;
  if (qualityLevel === "medium") return smokeQualityDefaults.frameFadeBaseMedium;
  return smokeQualityDefaults.frameFadeBaseHigh;
}

