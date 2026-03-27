export const layerCount = 3 as const;

// Ambient smoke: 화면 전체를 “분위기”로 채우기 위한 3층 파라미터
export const ambientDensity = {
  // 총 입자수는 화면 면적에 따라 스케일(단, 과부하 방지 위해 캡)
  totalParticlesLow: 160,
  totalParticlesHigh: 250,
  layerFractions: {
    far: 0.35,
    mid: 0.40,
    near: 0.25,
  },
  // 스폰 스파이크 방지(프레임당 최대 추가 수)
  spawnMaxPerFrame: 6,
} as const;

// 전체 흐름 속도 스케일 (px/s 계열로 최종 변환)
export const flowSpeed = {
  far: 0.20,
  mid: 0.25,
  near: 0.31,
} as const;

// 레이어별 알파 범위(매우 옅게 보이도록)
export const opacityRange = {
  far: [0.006, 0.020] as const,
  mid: [0.009, 0.030] as const,
  near: [0.012, 0.045] as const,
} as const;

// 난류/찢김에 해당하는 힘(속도 변화 및 찢김 느낌 강화용)
export const turbulenceAmount = {
  far: 0.14,
  mid: 0.26,
  near: 0.44,
} as const;

// drift 방향은 완전히 고정하지 않고 천천히 변하는 “방향 완만한 이동”
export const driftDirection = {
  baseAngleDeg: 12,
  angleWanderSpeed: 0.006, // rad/sec (더 느리게)
  driftStrength: 0.14,
} as const;

// particle life 및 respawn 전략
export const respawnStrategy = {
  lifeRangeSec: {
    far: [22.0, 38.0] as const,
    mid: [18.0, 32.0] as const,
    near: [14.0, 28.0] as const,
  },
  // 화면 밖으로 나가면 자연스럽게 제거(그리고 다음 스폰으로 교체)
  offscreenPaddingFrac: 0.18,
  // 감쇠(속도가 과하게 유지되지 않게)
  dragPerSec: {
    far: 0.26,
    mid: 0.30,
    near: 0.34,
  },
} as const;

// --------------------------------------------
// Interaction presets (foreground, 추가 반응)
// --------------------------------------------
export const interactionNormalPreset = {
  // background(ambient) 대비 “약한 일반 추가 연기” 느낌
  powerScale: 0.42, // emit 함수에 들어갈 power01 스케일
  emissionAccMul: 0.48, // normalEmitAcc 누적량 스케일
  maxTotalCapMul: 0.48,
} as const;

export const interactionDonutPreset = {
  // 도넛 링은 전경으로 보이되 압도적이지 않게
  powerScale: 0.60,
  ringSystemCapMul: 0.52,
  ringParticlePerSystemMul: 0.55,
  maxWispTailCapMul: 0.55,
} as const;

