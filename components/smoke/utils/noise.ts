import { curlField, fbm2D } from "@/lib/noise";

export type Vec2 = { vx: number; vy: number };

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

/**
 * 연기 파티클용 turbulence/velocity field.
 *
 * - `curlField`로 순환 성분을 주고(직선 이동 방지),
 * - `fbm2D`로 미세 난류를 보강해서
 * - layer/kind에 따라 흐름 체감을 다르게 만들 수 있도록
 *   최종 반환은 "방향벡터" + 약한 강도 modulation을 포함한다.
 */
export function smokeTurbulenceVec2(x: number, y: number, tSec: number, seed: number, strength = 1): Vec2 {
  const s = 0.012 + strength * 0.002;
  // curlField는 이미 정규화된 느낌의 방향 벡터
  const c = curlField(x * s, y * s, tSec, seed);

  // 난류 강도 modulation (0.65..1.25 정도)
  const n = fbm2D(x * 0.008, y * 0.008, seed + 7.77, 4);
  const amp = 0.78 + 0.46 * clamp(n, 0, 1);

  // 약간 더 "살아있는" drift를 위해 sin 기반 편향을 섞는다.
  const drift = Math.sin((x + y) * 0.003 + seed * 0.001 + tSec * 0.7) * 0.18;

  return {
    vx: c.vx * amp + drift,
    vy: c.vy * amp - drift * 0.35,
  };
}

/**
 * ring breakup/edge density를 위한 "각도-시간" 잡음.
 * - 링은 완전한 기하학 원처럼 보이면 안 되므로
 *   각도별로 alpha/생존율이 천천히 달라지도록 만든다.
 */
export function ringBreakN(angleRad: number, ageSec: number, seed: number) {
  // -1..1에 가까운 값(0..1로 정규화)
  const n1 = fbm2D(Math.cos(angleRad) * 2.2 + ageSec * 0.35, Math.sin(angleRad) * 1.9 + seed * 0.001, seed + 31.0, 4);
  const n2 = fbm2D(Math.cos(angleRad) * 3.4 + seed * 0.01, Math.sin(angleRad) * 2.6, seed + 11.0, 3);
  return 0.5 + 0.25 * (n1 - 0.5) + 0.25 * (n2 - 0.5);
}

