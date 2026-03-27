import type { SmokeBlob } from "@/types/smoke";
import { drawSmokeBlob } from "@/components/smoke/renderSmokeBlob";
import { LAYER_RENDER_STYLES } from "@/components/smoke/layerStyles";
import { updateBlobPhysics } from "@/components/smoke/updateBlobPhysics";
import { lerp } from "@/components/smoke/util";

// NOTE: util file will be added below (components/smoke/util.ts)

export function emitPlumeCluster(params: {
  nozzleX: number;
  nozzleY: number;
  spreadX: number; // px
  spreadY: number; // px
  power01: number; // 0..1
  ramp01: number; // press ramp 0..1
  lowPower: boolean;
  blobs: SmokeBlob[];
  maxCount: number;
}) {
  const { blobs } = params;
  if (blobs.length >= params.maxCount) return;

  const room = params.maxCount - blobs.length;
  const count = Math.min(
    room,
    // 초기 ramp-up에서 “갑자기 밝게 튀는” 걸 막기 위해 최소 배출량을 낮춘다.
    Math.floor(lerp(params.lowPower ? 4 : 5, params.lowPower ? 8 : 10, params.power01) * (0.28 + params.ramp01 * 0.88))
  );
  if (count <= 0) return;

  for (let i = 0; i < count; i++) {
    const ox = (Math.random() * 2 - 1) * params.spreadX * (0.35 + Math.random() * 0.65);
    const oy = -Math.random() * params.spreadY * (0.25 + Math.random() * 0.75);

    const size = lerp(26, params.lowPower ? 72 : 88, params.power01) * (0.85 + Math.random() * 0.35);
    // press 직후 깜빡임 방지: ramp01이 낮을 때 코어 alpha/density가 급상승하지 않게 한다.
    const alpha = lerp(0.12, params.lowPower ? 0.2 : 0.24, params.power01) * (0.38 + params.ramp01 * 0.60);
    const density = lerp(0.7, 1.15, params.power01) * (0.48 + params.ramp01 * 0.58) * (0.75 + Math.random() * 0.5);

    const noiseOffsetX = Math.random() * 10000;
    const noiseOffsetY = Math.random() * 10000;
    const swirl = (Math.random() * 2 - 1) * lerp(0.6, 1.2, params.power01);

    const vx = (Math.random() * 2 - 1) * 22 + ox * 0.7;
    const vy = -lerp(120, 185, params.power01) * (0.4 + Math.random() * 0.6);

    const maxLife = lerp(1.0, 1.55, params.power01) * (0.85 + Math.random() * 0.3);
    const life = maxLife;

    blobs.push({
      layerType: "plume",
      x: params.nozzleX + ox,
      y: params.nozzleY + oy,
      vx,
      vy,
      size,
      alpha,
      density,
      life,
      maxLife,
      noiseOffsetX,
      noiseOffsetY,
      swirl,
    });
  }
}

export function stepPlume(
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

export function drawPlume(ctx: CanvasRenderingContext2D, blobs: SmokeBlob[], nowSec: number) {
  const style = LAYER_RENDER_STYLES.plume;
  for (let i = 0; i < blobs.length; i++) drawSmokeBlob(ctx, blobs[i], nowSec, style);
}

