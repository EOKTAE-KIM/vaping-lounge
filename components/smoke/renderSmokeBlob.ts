import type { SmokeBlob } from "@/types/smoke";
import { fbm2D, valueNoise2D } from "@/lib/noise";

export type SmokeRenderStyle = {
  // 색상 (순백 방지: 아주 약간 회청/청색 계열)
  coreRGB: [number, number, number];
  midRGB: [number, number, number];
  edgeRGB: [number, number, number];

  // 시간에 따른 확산/감쇠
  growth: number; // size growth factor
  alphaDecayPow: number;
  densityDecayPow: number;

  // 렌더 왜곡
  scaleXAmt: number;
  scaleYAmt: number;
  rotAmt: number;

  // 레이어별 디테일
  wispyEdgeAmt: number;
  secondLobeAmt: number;
};

function rgba(rgb: [number, number, number], a: number) {
  return `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${a})`;
}

export function drawSmokeBlob(ctx: CanvasRenderingContext2D, blob: SmokeBlob, nowSec: number, style: SmokeRenderStyle) {
  const maxLife = Math.max(0.0001, blob.maxLife);
  const t = 1 - blob.life / maxLife; // 0..1

  if (t >= 1) return;

  // size/alpha/density diffusion
  const sizeEff = blob.size * (1 + style.growth * t);
  const densityEff = blob.density * Math.pow(1 - t, style.densityDecayPow);
  const alphaEff =
    blob.alpha * Math.pow(1 - t, style.alphaDecayPow) * (0.6 + 0.4 * Math.min(1, densityEff)) * 0.88;

  if (alphaEff <= 0.002) return;

  // anisotropic distortion (no clipping; prevents “polygon patches”)
  const seed = blob.noiseOffsetX * 0.001 + blob.noiseOffsetY * 0.0007 + blob.size * 0.002;

  const nRot = valueNoise2D(blob.noiseOffsetX * 0.01, blob.noiseOffsetY * 0.01, seed) - 0.5;
  const nScaleX = valueNoise2D(blob.noiseOffsetX * 0.02 + nowSec * 0.12, blob.noiseOffsetY * 0.02, seed + 2.1) - 0.5;
  const nScaleY = valueNoise2D(blob.noiseOffsetX * 0.02, blob.noiseOffsetY * 0.02 + nowSec * 0.09, seed + 6.7) - 0.5;

  // velocity-driven anisotropy:
  // 구름처럼 “동글동글”한 느낌을 줄이고, 위쪽으로 흐르며 끊기는 위스프(담배연기 느낌)에 더 가깝게 만든다.
  const speed = Math.hypot(blob.vx, blob.vy);
  const speedK = Math.min(1, speed / 220);
  const dir = Math.atan2(blob.vy, blob.vx); // vy < 0 => 위쪽 방향

  const angle = nRot * style.rotAmt + blob.swirl * (t - 0.5) * 0.35 + dir * (0.10 + 0.14 * speedK) * (1 - t);
  const sx = 1 + nScaleX * style.scaleXAmt - speedK * 0.05;
  const sy = 1 + nScaleY * style.scaleYAmt + speedK * 0.12;

  // feathered gradient
  const rOuter = sizeEff;
  // core를 더 작게 잡아서 “구름”보다는 “담배연기 코어” 느낌에 맞춘다.
  const rCore = Math.max(1, rOuter * (0.115 + 0.06 * (1 - t)));

  // wisp offset (gives irregular silhouette without clip polygons)
  const wispN = fbm2D(blob.noiseOffsetX * 0.008, blob.noiseOffsetY * 0.008, seed + nowSec * 0.08, 3);
  const dx = (wispN - 0.5) * rOuter * style.wispyEdgeAmt * (0.75 + 0.35 * speedK);
  const dy =
    (valueNoise2D(blob.noiseOffsetX * 0.011 + nowSec * 0.06, blob.noiseOffsetY * 0.011, seed + 9.3) - 0.5) *
    rOuter *
    (style.wispyEdgeAmt * 0.65) *
    (0.85 + 0.25 * speedK);

  ctx.save();
  ctx.translate(blob.x, blob.y);
  ctx.rotate(angle);
  ctx.scale(sx, sy);

  const g1 = ctx.createRadialGradient(0, 0, rCore, 0, 0, rOuter);
  g1.addColorStop(0, rgba(style.coreRGB, alphaEff));
  g1.addColorStop(0.28, rgba(style.midRGB, alphaEff * 0.58));
  g1.addColorStop(0.68, rgba(style.edgeRGB, alphaEff * 0.18));
  g1.addColorStop(1, rgba(style.edgeRGB, 0));
  ctx.fillStyle = g1;
  ctx.beginPath();
  ctx.arc(0, 0, rOuter, 0, Math.PI * 2);
  ctx.fill();

  // second lobe (irregular edges)
  const rOuter2 = rOuter * (0.92 + 0.08 * (1 - t));
  const rCore2 = Math.max(1, rOuter2 * (0.12 + 0.07 * (1 - t)));
  const g2 = ctx.createRadialGradient(dx, dy, rCore2, dx, dy, rOuter2);
  g2.addColorStop(0, rgba(style.coreRGB, alphaEff * style.secondLobeAmt * 0.85));
  g2.addColorStop(0.35, rgba(style.midRGB, alphaEff * style.secondLobeAmt * 0.45));
  g2.addColorStop(1, rgba(style.edgeRGB, 0));
  ctx.fillStyle = g2;
  ctx.beginPath();
  ctx.arc(0, 0, rOuter2, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

