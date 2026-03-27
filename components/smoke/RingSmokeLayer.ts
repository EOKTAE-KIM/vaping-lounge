import type { SmokeBlob } from "@/types/smoke";
import { drawSmokeBlob } from "@/components/smoke/renderSmokeBlob";
import { LAYER_RENDER_STYLES } from "@/components/smoke/layerStyles";
import { updateBlobPhysics } from "@/components/smoke/updateBlobPhysics";
import { rand, lerp } from "@/components/smoke/util";
import { valueNoise2D } from "@/lib/noise";

export function emitRingCluster(params: {
  ringCenterX: number;
  ringCenterY: number;
  ringRadius: number;
  ringTh: number;
  power01: number;
  ramp01: number;
  lowPower: boolean;
  blobs: SmokeBlob[];
  maxCount: number;
}) {
  if (params.blobs.length >= params.maxCount) return;
  const room = params.maxCount - params.blobs.length;

  const count = Math.min(
    room,
    Math.floor(lerp(params.lowPower ? 16 : 20, params.lowPower ? 26 : 34, params.power01) * (0.62 + params.ramp01 * 0.78))
  );
  if (count <= 0) return;

  const seed = 1000 + params.ringRadius * 0.2 + params.ringTh * 0.7 + params.power01 * 7;

  for (let j = 0; j < count; j++) {
    const frac = j / count;
    const angleBase = frac * Math.PI * 2;

    // break the ring: skip some angles based on noise threshold
    const gapN = valueNoise2D(Math.cos(angleBase) * 2.2 + seed, Math.sin(angleBase) * 2.2 + seed, seed);
    if (gapN < 0.18 + (1 - params.power01) * 0.12 && Math.random() < 0.7) continue;

    const angle = angleBase + rand(-0.10, 0.10) + valueNoise2D(angleBase * 3, seed, seed + 9.1) * 0.06;
    const localTh = params.ringTh * (0.55 + Math.random() * 0.95);
    const r = params.ringRadius + (Math.random() * 2 - 1) * localTh * 0.65 + (gapN - 0.5) * localTh * 0.22;

    const ex = Math.cos(angle) * r + rand(-localTh * 0.22, localTh * 0.22);
    const ey = Math.sin(angle) * r * 0.66 + rand(-localTh * 0.16, localTh * 0.16);

    const size = rand(params.lowPower ? 55 : 60, params.lowPower ? 115 : 130) * (0.78 + params.power01 * 0.58);
    const alpha = rand(0.10, params.lowPower ? 0.18 : 0.22) * (0.73 + params.ramp01 * 0.48) * (0.72 + gapN * 0.68);
    const density = rand(0.55, 1.05) * (0.8 + params.power01 * 0.4);

    const noiseOffsetX = Math.random() * 10000;
    const noiseOffsetY = Math.random() * 10000;
    const swirl = rand(-2.0, 2.0) * (0.6 + params.power01 * 0.7);

    // tangential velocity + upward
    const tangX = -Math.sin(angle);
    const tangY = Math.cos(angle);
    const speedT = rand(50, 95) * (0.45 + params.power01 * 0.75);
    const up = rand(90, 160) * (0.35 + params.power01 * 0.6);

    const vx = tangX * speedT + rand(-18, 18);
    const vy = -up * (0.45 + Math.random() * 0.55) + tangY * rand(-10, 10);

    const maxLife = rand(params.lowPower ? 1.1 : 1.25, params.lowPower ? 2.1 : 2.4) * (0.75 + params.power01 * 0.45);

    params.blobs.push({
      layerType: "ring",
      x: params.ringCenterX + ex,
      y: params.ringCenterY + ey,
      vx,
      vy,
      size,
      alpha,
      density,
      life: maxLife,
      maxLife,
      noiseOffsetX,
      noiseOffsetY,
      swirl,
    });
  }
}

export function stepRing(
  blobs: SmokeBlob[],
  dt: number,
  nowSec: number,
  bounds: { w: number; h: number },
  emitterDriftX: number,
  forceScale = 1
) {
  for (let i = blobs.length - 1; i >= 0; i--) {
    const b = blobs[i];
    b.life -= dt;
    if (b.life <= 0) {
      blobs.splice(i, 1);
      continue;
    }
    updateBlobPhysics(b, dt, nowSec, bounds, emitterDriftX, forceScale);
  }
}

export function drawRing(ctx: CanvasRenderingContext2D, blobs: SmokeBlob[], nowSec: number) {
  const style = LAYER_RENDER_STYLES.ring;
  for (let i = 0; i < blobs.length; i++) drawSmokeBlob(ctx, blobs[i], nowSec, style);
}

