import { clamp, lerp, fbm2D } from "@/lib/noise";
import type { SmokeParticleLike } from "@/components/smoke/utils/renderSmokeParticle";
import { donutSmokePreset } from "@/components/smoke/smokePresets";
import { ringBreakN, smokeTurbulenceVec2 } from "@/components/smoke/utils/noise";

type QualityLevel = "low" | "medium" | "high";

function rand(min: number, max: number) {
  return min + Math.random() * (max - min);
}

export type RingParticle = SmokeParticleLike & {
  theta0: number;
  radialOffset: number;
  gapPhase: number;
  alphaBase: number;
};

export type RingSystem = {
  bornAtSec: number;
  seed: number;
  centerX0: number;
  centerY0: number;
  minDim: number;

  ringRadiusBasePx: number;
  ringThicknessPx: number;
  forwardVelocity: number;
  expansionRate: number;
  edgeNoise: number;
  ringBreakupRate: number;
  trailingSmokeAmount: number;
  power01: number;

  particles: RingParticle[];
  trailing: SmokeParticleLike[]; // wisp tail
  prevCenterX: number;
  prevCenterY: number;
  tailAcc: number;
  systemLife: number;
};

export function emitDonutRingSystem(params: {
  ringSystems: RingSystem[];
  maxSystems: number;
  nozzleX: number;
  nozzleY: number;
  driftX: number;
  power01: number;
  ramp01: number;
  nowSec: number;
  qualityLevel: QualityLevel;
  bounds: { w: number; h: number };
  seed: number;
  ringParticleCount: number;
}) {
  if (params.ringSystems.length >= params.maxSystems) return;

  const { w, h } = params.bounds;
  const minDim = Math.min(w, h);

  // ringRadius/ringThickness는 "preset base * minDim * power"로 스케일
  const ringRadiusBasePx = minDim * donutSmokePreset.ringRadius * (0.85 + 0.35 * params.power01);
  const ringThicknessPx = minDim * donutSmokePreset.ringThickness * (0.65 + 0.65 * params.power01);

  // 앞으로(위로) 이동: forwardVelocity는 px/s
  const forwardVelocity = donutSmokePreset.forwardVelocity * (0.78 + 0.45 * params.power01);
  const expansionRate = donutSmokePreset.expansionRate * (0.75 + 0.35 * params.power01);
  const edgeNoise = donutSmokePreset.edgeNoise * (0.7 + 0.6 * params.power01);
  const ringBreakupRate = donutSmokePreset.ringBreakupRate * (0.75 + 0.55 * params.power01) * (0.85 + 0.25 * params.ramp01);
  const trailingSmokeAmount = donutSmokePreset.trailingSmokeAmount * (0.45 + 0.55 * params.power01);

  const systemLife = lerp(1.05, 1.65, params.power01) * (0.85 + 0.25 * params.ramp01);

  // ring은 입에서 시작. 중심은 중심이 비어 보이되 완전한 구멍은 금지.
  // y는 위(-)로 시작되도록 nozzleY에서 약간 올린다.
  const centerX0 = params.nozzleX + params.driftX * 10;
  const centerY0 = params.nozzleY - minDim * 0.03 + rand(-minDim * 0.01, minDim * 0.01);

  const seed = params.seed;

  const particles: RingParticle[] = [];
  const trailing: SmokeParticleLike[] = [];

  // 각도 샘플: 완전한 원/균일 배치 금지 => gap으로 일부 스킵
  // density bias: outer edge 쪽에 더 많은 입자를 둠.
  const countTarget = Math.max(24, Math.floor(params.ringParticleCount * (0.85 + params.ramp01 * 0.25)));

  for (let i = 0; i < countTarget; i++) {
    const frac = i / countTarget;
    const thetaBase = frac * Math.PI * 2;
    const thetaJ = thetaBase + rand(-0.12, 0.12) + fbm2D(Math.cos(thetaBase) * 3.0 + seed, Math.sin(thetaBase) * 3.0, seed + 9.1, 4) * 0.08;

    // 초기 gap: 링 형태가 0.1~0.3초는 분명하고 이후 찢김.
    const gapN = ringBreakN(thetaJ, 0, seed) - 0.5;
    const gapThreshold = -0.08 + (1 - params.power01) * 0.06 + rand(-0.02, 0.02);
    if (gapN < gapThreshold && Math.random() < 0.65) continue;

    // radialOffset bias: outer edge 밀도↑
    const u = Math.pow(Math.random(), 0.42 + 0.18 * (1 - params.power01)); // outer 쪽으로 더 몰림
    const radialOffset = (u - 0.5) * ringThicknessPx * (0.92 + rand(-0.12, 0.22));

    // 크기/알파는 outer 쪽이 더 진함
    const outerT = clamp((radialOffset + ringThicknessPx * 0.5) / ringThicknessPx, 0, 1);
    const alphaBase = rand(0.12, 0.22) * (0.55 + 0.45 * params.ramp01) * (0.65 + 0.65 * outerT);

    const sizeBase = lerp(minDim * 0.010, minDim * 0.016, outerT) * (0.85 + params.power01 * 0.45);
    const size = sizeBase * (0.8 + rand(-0.12, 0.3));

    const softness = lerp(0.55, 0.92, 0.6 + (1 - outerT) * 0.4);
    const stretch = rand(1.25, 2.2) * (0.85 + outerT * 0.75);

    // ring edge 입자 회전: 접선 방향 + 약간의 틀어짐
    const rot = thetaJ + Math.PI / 2 + rand(-0.45, 0.45);

    // "직선 이동 금지" 위해 초기 vx/vy에도 노이즈를 섞는다.
    const velT = forwardVelocity / Math.max(18, ringRadiusBasePx);
    const vx = -Math.sin(thetaJ) * forwardVelocity * 0.07 + Math.cos(thetaJ) * velT * rand(-30, 30);
    const vy = -forwardVelocity * 0.18 + Math.cos(thetaJ) * velT * rand(-20, 20);

    const kind: SmokeParticleLike["kind"] = outerT > 0.55 ? "soft" : "wisp";

    // 탄생 시점 위치(중심은 비어 보이도록 radialOffset 분포로 결정됨)
    const rNow = ringRadiusBasePx + radialOffset;
    const squashY = 0.64;
    const x = centerX0 + Math.cos(thetaJ) * rNow;
    const y = centerY0 + Math.sin(thetaJ) * rNow * squashY;

    const gapPhase = seed + i * 3.77 + rand(-10, 10);

    particles.push({
      kind,
      x,
      y,
      vx,
      vy,
      size,
      alpha: alphaBase,
      alphaBase,
      life: systemLife * rand(0.75, 1.05),
      maxLife: systemLife * rand(0.75, 1.05),
      turbulenceSeed: seed + i * 19.1 + rand(0, 999),
      stretch,
      rotation: rot,
      softness,
      theta0: thetaJ,
      radialOffset,
      gapPhase,
    });
  }

  // ring 뒤쪽에 약한 tail이 필요하면, 아주 소량 초기 tail도 생성
  const initialTailCount = Math.floor(trailingSmokeAmount * 5);
  for (let i = 0; i < initialTailCount; i++) {
    const n = fbm2D(i * 0.25 + seed, params.nowSec * 0.1, seed + 77.7, 3);
    const ang = (n - 0.5) * 1.2; // 중심 주변에서 조금만
    const x = centerX0 + Math.sin(ang) * ringThicknessPx * 0.25 * rand(-1, 1);
    const y = centerY0 + rand(-ringThicknessPx * 0.2, ringThicknessPx * 0.35);
    const t = smokeTurbulenceVec2(x, y, params.nowSec, seed + 401 + i, 0.75);

    trailing.push({
      kind: "wisp",
      x,
      y,
      vx: t.vx * 85 + rand(-25, 25),
      vy: t.vy * 75 - forwardVelocity * 0.08 + rand(-10, 10),
      size: minDim * rand(0.004, 0.009) * (0.75 + params.power01 * 0.6),
      alpha: rand(0.05, 0.11) * (0.45 + params.ramp01 * 0.6),
      life: rand(0.65, 1.05),
      maxLife: rand(0.65, 1.05),
      turbulenceSeed: seed + 900 + i * 31.2,
      stretch: rand(2.2, 3.9),
      rotation: rand(-Math.PI, Math.PI),
      softness: rand(0.7, 0.98),
    });
  }

  params.ringSystems.push({
    bornAtSec: params.nowSec,
    seed,
    centerX0,
    centerY0,
    minDim,
    ringRadiusBasePx,
    ringThicknessPx,
    forwardVelocity,
    expansionRate,
    edgeNoise,
    ringBreakupRate,
    trailingSmokeAmount,
    power01: params.power01,
    particles,
    trailing,
    prevCenterX: centerX0,
    prevCenterY: centerY0,
    tailAcc: 0,
    systemLife,
  });
}

