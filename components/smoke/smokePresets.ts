export const normalSmokePreset = {
  // 초당 배출률(quality=high일 때 기준). power/ramp에 따라 스케일됨.
  emissionRate: 165,
  // 초기 속도 범위(px/s). y는 위로(-)가 기본.
  initialVelocityRange: {
    vxMin: -55,
    vxMax: 55,
    vyMin: -260,
    vyMax: -190,
  },
  // 좌우 미세 드리프트(-1~1 emitter.driftX는 별도로 곱해짐)
  driftAmount: 46,
  // 감쇠(수명/드래그/난류 강도에 함께 사용)
  dissipationRate: 1.0,
  // 3레이어 비율(코어/소프트/잔연)
  coreLayerRatio: 0.50,
  softLayerRatio: 0.32,
  wispRatio: 0.18,
} as const;

export const donutSmokePreset = {
  // ring 중심 반지름(px 비율을 min(canvasSize)로 스케일)
  ringRadius: 0.075,
  // ring 두께(px 비율)
  ringThickness: 0.018,
  // ring이 앞으로(위로) 나가는 속도(px/s)
  forwardVelocity: 320,
  // ring 반지름이 커지는 속도(px/s)
  expansionRate: 190,
  // 링 가장자리 살아있음(각도/반지름 난류 흔들림 강도)
  edgeNoise: 1.0,
  // 링이 찢어지는 속도(값이 클수록 더 빨리/자주 끊김)
  ringBreakupRate: 1.25,
  // 링 뒤에 따라붙는 약한 꼬리 연기 양(0..1-ish)
  trailingSmokeAmount: 0.48,
} as const;

export const smokeQualityDefaults = {
  // stamp texture 해상도(값이 클수록 디테일↑, 비용↑)
  stampSizeLow: 48,
  stampSizeMedium: 64,
  stampSizeHigh: 80,

  // stamp 변형(반복 패턴 완화)
  stampVariantsLow: 2,
  stampVariantsMedium: 3,
  stampVariantsHigh: 4,

  // 파티클 캡(모바일에서 프레임 유지)
  // total cap은 quality에 따라 useSmokeEngine에서 분배
  normalCoreCapLow: 52,
  normalCoreCapMedium: 74,
  normalCoreCapHigh: 92,

  normalSoftCapLow: 74,
  normalSoftCapMedium: 118,
  normalSoftCapHigh: 160,

  normalWispCapLow: 44,
  normalWispCapMedium: 72,
  normalWispCapHigh: 104,

  ringSystemCapLow: 4,
  ringSystemCapMedium: 5,
  ringSystemCapHigh: 6,

  ringParticleCapLow: 110,
  ringParticleCapMedium: 160,
  ringParticleCapHigh: 220,

  // 링 파티클 생성밀도(각도 샘플링 기반)
  ringParticlePerSystemLow: 85,
  ringParticlePerSystemMedium: 125,
  ringParticlePerSystemHigh: 165,

  // 프레임 persistence(배경을 지우는 fade)
  // "opacity fade만"이 아니라 파티클 life/alpha도 존재하지만,
  // 잔상이 너무 남으면 "안개"처럼 뭉개질 수 있어 상한을 둠.
  frameFadeBaseLow: 0.058,
  frameFadeBaseMedium: 0.048,
  frameFadeBaseHigh: 0.040,
} as const;

