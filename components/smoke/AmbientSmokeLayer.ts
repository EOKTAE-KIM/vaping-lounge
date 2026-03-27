import type { SmokeBlob } from "@/types/smoke";
import { drawSmokeBlob } from "@/components/smoke/renderSmokeBlob";
import { LAYER_RENDER_STYLES } from "@/components/smoke/layerStyles";
import { updateBlobPhysics } from "@/components/smoke/updateBlobPhysics";
import { lerp, rand } from "@/components/smoke/util";

export function emitAmbient(params: {
  blobs: SmokeBlob[];
  targetCount: number;
  nozzleX: number;
  nozzleY: number;
  w: number;
  h: number;
  power01: number;
  lowPower: boolean;
  // 노즐에서 시작해서 점점 더 넓은 영역으로 퍼지기 위한 스폰 분산
  spawnSpreadX: number;
  spawnSpreadY: number;
}) {
  if (params.blobs.length >= params.targetCount) return;

  const need = params.targetCount - params.blobs.length;
  const burst = Math.min(need, Math.floor(lerp(params.lowPower ? 1 : 2, params.lowPower ? 3 : 4, params.power01) * (0.95 + params.power01 * 0.35)));
  for (let i = 0; i < burst; i++) {
    // 노즐에서 시작해서 점점 넓게 퍼지는 “배경 볼륨” 스폰
    // (x/y를 완전 균일하게 뿌리지 않고, 시간/파워에 따라 spawnSpread로 자연스럽게 확산)
    const x2 = params.nozzleX + (Math.random() * 2 - 1) * params.spawnSpreadX;
    const y2 =
      params.nozzleY +
      (Math.random() * 2 - 1) * params.spawnSpreadY * 0.85 +
      rand(-params.h * 0.04, params.h * 0.08) * (0.22 + params.power01 * 0.65);

    // ambient이 너무 크게 뭉치면 “구름”처럼 보이기 때문에 크기/알파를 낮추고 더 촘촘하게 만든다.
    const size = rand(params.lowPower ? 95 : 105, params.lowPower ? 210 : 235) * (0.85 + params.power01 * 0.22);
    const alpha = rand(0.015, params.lowPower ? 0.055 : 0.065) * (0.80 + params.power01 * 0.28);
    const density = rand(0.22, 0.52) * (0.78 + params.power01 * 0.35);

    const noiseOffsetX = Math.random() * 10000;
    const noiseOffsetY = Math.random() * 10000;
    const swirl = (Math.random() * 2 - 1) * lerp(1.0, 1.8, params.power01);

    // ambient은 천천히 흐르되, 좌우 소용돌이로 배경 전체를 휩쓸어 “진짜 연무”를 만든다.
    const vx = rand(-30, 30) * (0.25 + params.power01 * 0.70);
    const vy = -rand(params.lowPower ? 18 : 22, params.lowPower ? 34 : 40) * (0.30 + params.power01 * 0.45);

    const maxLife = rand(params.lowPower ? 8.0 : 9.0, params.lowPower ? 13.0 : 15.0);

    params.blobs.push({
      layerType: "ambient",
      x: x2,
      y: y2,
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

export function stepAmbient(
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

export function drawAmbient(ctx: CanvasRenderingContext2D, blobs: SmokeBlob[], nowSec: number) {
  const style = LAYER_RENDER_STYLES.ambient;
  for (let i = 0; i < blobs.length; i++) drawSmokeBlob(ctx, blobs[i], nowSec, style);
}

