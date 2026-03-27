import type { SmokeBlob } from "@/types/smoke";
import { curlField, fbm2D } from "@/lib/noise";

type MotionParams = {
  flowStrength: number;
  buoyancy: number;
  dragPerSec: number;
  sideForce: number;
  swirlStrength: number;
  flowScale: number;
};

const MOTION: Record<SmokeBlob["layerType"], MotionParams> = {
  plume: { flowStrength: 72, buoyancy: 105, dragPerSec: 1.07, sideForce: 26, swirlStrength: 30, flowScale: 0.012 },
  body: { flowStrength: 62, buoyancy: 72, dragPerSec: 0.97, sideForce: 32, swirlStrength: 26, flowScale: 0.012 },
  diffuse: { flowStrength: 46, buoyancy: 38, dragPerSec: 0.86, sideForce: 22, swirlStrength: 20, flowScale: 0.012 },
  // ambient: 화면 전체를 휘몰아치는 “배경 볼륨” 느낌을 위해 더 강한 난류/좌우 힘을 준다.
  ambient: { flowStrength: 38, buoyancy: 24, dragPerSec: 0.70, sideForce: 18, swirlStrength: 16, flowScale: 0.012 },
  ring: { flowStrength: 55, buoyancy: 48, dragPerSec: 0.91, sideForce: 20, swirlStrength: 22, flowScale: 0.012 },
};

export function updateBlobPhysics(
  blob: SmokeBlob,
  dt: number,
  nowSec: number,
  bounds: { w: number; h: number },
  emitterDriftX: number,
  forceScale = 1
) {
  const p = MOTION[blob.layerType];
  const seed = blob.noiseOffsetX * 0.001 + blob.noiseOffsetY * 0.0007 + blob.size * 0.001;

  // flow field: curl-like so movement is curved (straight line forbidden)
  const flow = curlField(blob.x * p.flowScale, blob.y * p.flowScale, nowSec, seed);

  // extra turbulence via fbm
  const nSide = fbm2D(blob.x * 0.01, blob.y * 0.01, seed + nowSec * 0.12, 3) - 0.5;

  // apply forces
  blob.vx += (flow.vx * p.flowStrength + nSide * p.sideForce) * dt * forceScale + emitterDriftX * 14 * dt;
  blob.vy += flow.vy * p.flowStrength * dt * forceScale - p.buoyancy * dt * forceScale;

  // swirl: add rotational divergence (per-blob)
  const swirlK = blob.swirl * p.swirlStrength * dt * 0.001 * forceScale;
  blob.vx += flow.vy * swirlK;
  blob.vy -= flow.vx * swirlK;

  // drag
  const drag = Math.exp(-p.dragPerSec * dt);
  blob.vx *= drag;
  blob.vy *= drag;

  // integrate
  blob.x += blob.vx * dt;
  blob.y += blob.vy * dt;

  // clamp with padding
  blob.x = Math.max(-bounds.w * 0.25, Math.min(bounds.w * 1.25, blob.x));
  blob.y = Math.max(-bounds.h * 0.25, Math.min(bounds.h * 1.15, blob.y));
}

