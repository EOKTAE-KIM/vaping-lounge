import type { SmokeBlob } from "@/types/smoke";
import { drawSmokeBlob } from "@/components/smoke/renderSmokeBlob";
import { LAYER_RENDER_STYLES } from "@/components/smoke/layerStyles";
import { updateBlobPhysics } from "@/components/smoke/updateBlobPhysics";
import { lerp } from "@/components/smoke/util";

export function emitBodyCluster(params: {
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
    Math.floor(lerp(params.lowPower ? 5 : 7, params.lowPower ? 12 : 18, params.power01) * (0.58 + params.ramp01 * 0.75))
  );
  if (count <= 0) return;

  for (let i = 0; i < count; i++) {
    // start slightly above nozzle and expand sideways
    const ox = (Math.random() * 2 - 1) * params.spreadX * (0.6 + Math.random() * 0.8);
    const oy = -Math.random() * params.spreadY * (0.3 + Math.random() * 0.8);

    const size = lerp(34, params.lowPower ? 92 : 110, params.power01) * (0.87 + Math.random() * 0.36);
    const alpha = lerp(0.07, params.lowPower ? 0.16 : 0.19, params.power01) * (0.82 + params.ramp01 * 0.50);
    const density = lerp(0.6, 1.25, params.power01) * (0.72 + Math.random() * 0.62);

    const noiseOffsetX = Math.random() * 10000;
    const noiseOffsetY = Math.random() * 10000;
    const swirl = (Math.random() * 2 - 1) * lerp(0.9, 1.9, params.power01);

    const vx = (Math.random() * 2 - 1) * 34 + ox * 0.35;
    const vy = -lerp(70, 130, params.power01) * (0.45 + Math.random() * 0.55);

    const maxLife = lerp(1.6, 2.55, 0.35 + params.power01 * 0.65) * (0.85 + Math.random() * 0.25);

    params.blobs.push({
      layerType: "body",
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

export function stepBody(
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

export function drawBody(ctx: CanvasRenderingContext2D, blobs: SmokeBlob[], nowSec: number) {
  const style = LAYER_RENDER_STYLES.body;
  for (let i = 0; i < blobs.length; i++) drawSmokeBlob(ctx, blobs[i], nowSec, style);
}

