import { lerp, clamp } from "@/lib/noise";
import type { SmokeParticleLike } from "@/components/smoke/utils/renderSmokeParticle";
import { normalSmokePreset } from "@/components/smoke/smokePresets";
import { smokeTurbulenceVec2 } from "@/components/smoke/utils/noise";

type QualityLevel = "low" | "medium" | "high";

function rand(min: number, max: number) {
  return min + Math.random() * (max - min);
}

/**
 * normal smoke: core(중심) + soft(외곽) + wisp(찢어진 잔흐름) 3레이어를
 * "같은 스트림에서" 연속적으로 배출하도록 설계한다.
 */
export function emitNormalSmoke(params: {
  particles: SmokeParticleLike[];
  maxTotal: number;
  nozzleX: number;
  nozzleY: number;
  driftX: number;
  power01: number;
  ramp01: number;
  qualityLevel: QualityLevel;
  nowSec: number;
  streamSeed: number;
  spawnCount: number;
}) {
  const { particles, maxTotal } = params;
  if (particles.length >= maxTotal) return;

  const canAdd = Math.min(params.spawnCount, maxTotal - particles.length);
  if (canAdd <= 0) return;

  const spreadT = clamp(0.25 + 0.75 * params.ramp01, 0, 1);
  const spreadX = lerp(2.8, 13.5, spreadT) * (0.7 + 0.3 * params.power01);
  const spreadY = lerp(1.5, 8.5, spreadT) * (0.65 + 0.35 * params.power01);

  const vRange = normalSmokePreset.initialVelocityRange;
  // quality가 낮으면 “층 수”를 줄여 silhoutte는 유지하되
  // 얇게 찢어지는 stray wisp는 상대적으로 줄인다.
  let kindCore = normalSmokePreset.coreLayerRatio;
  let kindSoft = normalSmokePreset.softLayerRatio;
  let kindWisp = normalSmokePreset.wispRatio;
  if (params.qualityLevel === "low") {
    kindSoft *= 0.92;
    kindWisp *= 0.58;
  } else if (params.qualityLevel === "medium") {
    kindWisp *= 0.82;
  }
  const sum = kindCore + kindSoft + kindWisp;
  kindCore /= sum;
  kindSoft /= sum;
  kindWisp /= sum;

  for (let i = 0; i < canAdd; i++) {
    // streamSeed로 묶어서 "패턴 반복"을 약화
    const pSeed = params.streamSeed + i * 31.7 + (Math.random() * 1000 + 1) * 0.001;
    const noise = smokeTurbulenceVec2(params.nozzleX, params.nozzleY, params.nowSec, pSeed, 0.9);
    const flowAng = Math.atan2(noise.vy, noise.vx);

    // kind 샘플
    const r = Math.random();
    let kind: SmokeParticleLike["kind"];
    if (r < kindCore) kind = "core";
    else if (r < kindCore + kindSoft) kind = "soft";
    else kind = "wisp";

    // 초기 배출: 코어는 얇고 밀도, wisp는 얇고 찢김(작고 stretch↑)
    const sizeBase =
      kind === "core"
        ? rand(6.5, 10.5)
        : kind === "soft"
          ? rand(9.0, 14.0)
          : rand(5.5, 8.5);

    const size = sizeBase * (0.78 + 0.55 * params.power01);
    const softness = kind === "core" ? rand(0.25, 0.55) : kind === "soft" ? rand(0.45, 0.78) : rand(0.68, 0.95);

    const stretch = kind === "core" ? rand(1.08, 1.55) : kind === "soft" ? rand(1.25, 1.9) : rand(2.15, 3.7);

    // alpha는 "두껍게 뭉치기"보다 thin/streak를 우선
    const alpha =
      kind === "core"
        ? rand(0.16, 0.30) * (0.55 + 0.45 * params.power01) * (0.7 + 0.3 * params.ramp01)
        : kind === "soft"
          ? rand(0.10, 0.20) * (0.55 + 0.45 * params.power01) * (0.55 + 0.45 * params.ramp01)
          : rand(0.05, 0.12) * (0.5 + 0.5 * params.power01) * (0.55 + 0.45 * params.ramp01);

    // 초기 속도는 위로 + 약간 옆으로.
    // linear motion처럼 보이지 않게 작은 jitter를 넣되,
    // flowAng가 만드는 방향 편향도 함께 반영한다.
    const vxJ = rand(vRange.vxMin, vRange.vxMax) * (kind === "wisp" ? 0.95 : 0.75);
    const vyJ = rand(vRange.vyMin, vRange.vyMax) * (kind === "core" ? 1.0 : kind === "soft" ? 0.92 : 0.85);

    const vx = vxJ + params.driftX * normalSmokePreset.driftAmount * 0.33 + Math.cos(flowAng) * rand(-20, 20);
    const vy = vyJ + Math.sin(flowAng) * rand(10, 26);

    const maxLifeBase = kind === "core" ? rand(0.65, 1.1) : kind === "soft" ? rand(0.75, 1.25) : rand(0.6, 1.05);
    // dissipationRate가 커질수록 빠르게 사라지는 느낌
    const diss = normalSmokePreset.dissipationRate;
    const maxLife = maxLifeBase * (0.95 + 0.2 * (1 - params.power01)) * (kind === "wisp" ? 1.04 : 1.0) / (0.92 + 0.08 * diss);

    // 회전/방향: stamp가 "베일처럼" 흐르려면 속도 방향을 따르되, 약간 틀어진 각이 필요
    const rotation = flowAng + rand(-0.6, 0.6) + (kind === "wisp" ? rand(-0.9, 0.9) : 0);

    const px = params.nozzleX + rand(-spreadX, spreadX) + params.driftX * rand(0, 4);
    const py = params.nozzleY + rand(-spreadY, spreadY) + rand(-1.2, 2.4) * (kind === "core" ? 0.55 : 1.0);

    particles.push({
      kind,
      x: px,
      y: py,
      vx,
      vy,
      size,
      alpha,
      life: maxLife,
      maxLife,
      turbulenceSeed: pSeed,
      stretch,
      rotation,
      softness,
    });
  }
}

