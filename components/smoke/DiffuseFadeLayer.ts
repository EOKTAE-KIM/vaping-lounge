import type { SmokeBlob } from "@/types/smoke";
import { drawSmokeBlob } from "@/components/smoke/renderSmokeBlob";
import { LAYER_RENDER_STYLES } from "@/components/smoke/layerStyles";
import { updateBlobPhysics } from "@/components/smoke/updateBlobPhysics";
import { lerp } from "@/components/smoke/util";

export function emitDiffuseCluster(params: {
  nozzleX: number;
  nozzleY: number;
  spreadX: number;
  spreadY: number;
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
    Math.floor(lerp(params.lowPower ? 3 : 4, params.lowPower ? 7 : 9, params.power01) * (0.28 + params.ramp01 * 0.88))
  );
  if (count <= 0) return;

  for (let i = 0; i < count; i++) {
    const ox = (Math.random() * 2 - 1) * params.spreadX * (0.85 + Math.random() * 0.7);
    const oy = Math.random() * params.spreadY * 0.55 + (Math.random() * 2 - 1) * 2;

    const size = lerp(55, params.lowPower ? 120 : 140, params.power01) * (0.77 + Math.random() * 0.36);
    const alpha = lerp(0.05, params.lowPower ? 0.13 : 0.15, params.power01) * (0.72 + params.ramp01 * 0.40);
    const density = lerp(0.45, 0.95, params.power01) * (0.72 + Math.random() * 0.72);

    const noiseOffsetX = Math.random() * 10000;
    const noiseOffsetY = Math.random() * 10000;
    const swirl = (Math.random() * 2 - 1) * lerp(0.7, 1.4, params.power01);

    const vx = (Math.random() * 2 - 1) * 48 + ox * 0.18;
    const vy = -lerp(30, 85, params.power01) * (0.35 + Math.random() * 0.65);

    const maxLife = lerp(1.9, 3.2, params.power01) * (0.8 + Math.random() * 0.25);

    params.blobs.push({
      layerType: "diffuse",
      x: params.nozzleX + ox,
      y: params.nozzleY + oy,
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

export function stepDiffuse(
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

export function drawDiffuse(ctx: CanvasRenderingContext2D, blobs: SmokeBlob[], nowSec: number) {
  const style = LAYER_RENDER_STYLES.diffuse;
  for (let i = 0; i < blobs.length; i++) drawSmokeBlob(ctx, blobs[i], nowSec, style);
}

