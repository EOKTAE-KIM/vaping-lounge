/** WebGL2 GLSL 300 ES — 3D value noise + FBM (GPU에서만 계산) */

export const SMOKE_VOLUME_VERT = `#version 300 es
in vec2 a_position;
out vec2 v_uv;
void main() {
  v_uv = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

export const SMOKE_VOLUME_FRAG = `#version 300 es
precision highp float;

uniform vec2 u_resolution;
uniform float u_time;
uniform float u_intensity;
uniform float u_press_duration;
uniform vec2 u_nozzle;
uniform float u_aspect;
uniform float u_low_power;
uniform float u_visibility;
uniform float u_carry;
uniform vec4 u_ring_data0[6]; // center.xy, spawnSec, seed
uniform vec4 u_ring_data1[6]; // radius, thickness, speed, expansion
uniform vec4 u_ring_data2[6]; // dir.xy, dissipation, active

in vec2 v_uv;
out vec4 fragColor;

float hash3(vec3 p) {
  return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453123);
}

float noise3D(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float n000 = hash3(i);
  float n100 = hash3(i + vec3(1.0, 0.0, 0.0));
  float n010 = hash3(i + vec3(0.0, 1.0, 0.0));
  float n110 = hash3(i + vec3(1.0, 1.0, 0.0));
  float n001 = hash3(i + vec3(0.0, 0.0, 1.0));
  float n101 = hash3(i + vec3(1.0, 0.0, 1.0));
  float n011 = hash3(i + vec3(0.0, 1.0, 1.0));
  float n111 = hash3(i + vec3(1.0, 1.0, 1.0));
  float nx00 = mix(n000, n100, f.x);
  float nx10 = mix(n010, n110, f.x);
  float nx01 = mix(n001, n101, f.x);
  float nx11 = mix(n011, n111, f.x);
  float nxy0 = mix(nx00, nx10, f.y);
  float nxy1 = mix(nx01, nx11, f.y);
  return mix(nxy0, nxy1, f.z);
}

float fbm3(vec3 p) {
  float v = 0.0;
  float a = 0.52;
  vec3 q = p;
  for (int i = 0; i < 5; i++) {
    v += a * noise3D(q);
    q = q * 2.05 + vec3(0.14, 0.11, 0.1);
    a *= 0.5;
  }
  return v;
}

float ringDensity(vec2 uv, float timeSec) {
  float accum = 0.0;
  for (int i = 0; i < 6; i++) {
    vec4 d0 = u_ring_data0[i];
    vec4 d1 = u_ring_data1[i];
    vec4 d2 = u_ring_data2[i];
    if (d2.w < 0.5) continue;
    float age = timeSec - d0.z;
    if (age < 0.0 || age > 2.9) continue;

    vec2 dir = normalize(vec2(d2.x, d2.y));
    float travel = d1.z * age;
    vec2 center = d0.xy + dir * travel;
    float radius = d1.x + d1.w * age;
    float thickness = d1.y * (1.0 + age * 0.35);

    vec2 p = uv - center;
    float ang = atan(p.y, p.x);
    float breakup = noise3D(vec3(ang * 6.4 + d0.w, age * 1.9, d0.w * 0.21));
    float breakup2 = noise3D(vec3(ang * 11.2 - d0.w * 0.7, age * 2.6, d0.w * 0.33));
    float shell = abs(length(p) - radius);
    float thickVary = thickness * (0.58 + breakup * 0.78 + breakup2 * 0.34);
    float sdf = shell - thickVary;

    float annulus = 1.0 - smoothstep(0.0, thickness * 0.9, sdf);
    float hole = smoothstep(0.0, radius * 0.4, length(p));
    float edge = annulus * hole;
    float life = 1.0 - smoothstep(0.08, 3.2, age);

    // trailing wisp behind ring impulse (링 중심(p≈0)에서는 tail이 최대가 되어 ‘빛’처럼 보이므로 반지 방향에서만 유지)
    float behind = clamp(dot(p, -dir), 0.0, 1.0);
    float tail = exp(-behind * 6.8) * exp(-abs(dot(p, vec2(-dir.y, dir.x))) * 7.6);
    tail *= smoothstep(0.03, 0.85, age);
    tail *= 0.72 + 0.28 * breakup2;
    float r = length(p);
    float onRing = smoothstep(radius * 0.18, radius * 0.62, r);
    tail *= onRing;

    float earlyImpulse = 1.0 + 0.65 * exp(-age * 9.5);
    accum += edge * life * earlyImpulse * (0.62 + breakup * 0.52);
    accum += tail * life * 0.34;
  }
  return accum;
}

void main() {
  vec2 uv = v_uv;
  vec2 pn = u_nozzle;
  float vis = clamp(u_visibility, 0.0, 1.0);
  float carry = clamp(u_carry, 0.0, 1.75);
  float press = clamp(u_intensity / 1.5, 0.0, 1.0);
  float hold = clamp(u_press_duration / 6.0, 0.0, 1.0);

  vec2 p = (uv - vec2(0.5)) * vec2(u_aspect, 1.0);
  // 전체 시간 스케일: 실제 연기는 느리게 상승·회전 (꿀렁거림 완화)
  float tSlow = u_time * 0.38;
  float flowBoost = 1.0 + 0.22 * press + 0.14 * hold + 0.1 * carry;
  float tWarp = tSlow * flowBoost;
  vec2 warp = vec2(
    fbm3(vec3(p * 1.45 + vec2(0.0, tWarp * 0.012), tWarp * 0.034)),
    fbm3(vec3(p * 1.4 + vec2(4.3, tWarp * 0.011), tWarp * 0.034))
  ) - 0.5;
  float warpAmp = u_low_power > 0.5 ? 0.055 : 0.078;
  p += warp * warpAmp;

  // 느린 대형 소용돌이(표류 벡터는 시간 변화를 작게)
  float tDrift = tSlow * flowBoost;
  vec2 driftA = vec2(
    fbm3(vec3(p * 0.95 + vec2(0.6, 1.1), tDrift * 0.032)) - 0.5,
    fbm3(vec3(p * 0.92 + vec2(9.2, 3.4), tDrift * 0.03)) - 0.5
  );
  vec2 driftB = vec2(
    fbm3(vec3(p * 1.85 + vec2(4.0, 7.7), tDrift * 0.042)) - 0.5,
    fbm3(vec3(p * 1.82 + vec2(11.0, 1.2), tDrift * 0.04)) - 0.5
  );
  vec2 driftC = vec2(
    fbm3(vec3(p * 3.6 + vec2(2.3, 5.9), tDrift * 0.052)) - 0.5,
    fbm3(vec3(p * 3.55 + vec2(8.8, 6.1), tDrift * 0.05)) - 0.5
  );

  // 상승·완만한 횡류(주기적이라 장시간도 안정, 실제 연기의 큰 덩어리 움직임)
  vec2 buoy = vec2(
    0.09 * sin(tDrift * 0.22 + p.x * 0.85 + p.y * 0.4),
    -0.12 * sin(tDrift * 0.18 + p.x * 0.5) - 0.06 * press
  );
  p += buoy * 0.28;

  float f0 = 0.028 * flowBoost;
  float f1 = 0.048 * flowBoost;
  float f2 = 0.072 * flowBoost;
  float base = fbm3(vec3(p * 1.12 + driftA * tDrift * f0 * 1.15, tDrift * 0.028 * flowBoost));
  float mid = fbm3(vec3(p * 2.15 + driftB * tDrift * f1 * 1.05 + warp * 0.55, tDrift * 0.045 * flowBoost));
  float wispy = fbm3(vec3(p * 3.8 + driftC * tDrift * f2 * 0.88 + warp * 0.9, tDrift * 0.062 * flowBoost));

  float band = 1.0 - smoothstep(0.18, 0.82, abs(uv.y - 0.5));
  float veil = base * 0.56 + mid * 0.36 + wispy * 0.08;
  veil *= (0.62 + band * 0.48);

  vec2 dn = uv - pn;
  float disturb = exp(-dot(dn, dn) * 12.0) * (0.14 + 0.4 * press);
  disturb *= smoothstep(-0.2, 0.35, -dn.y);

  float dens = veil + disturb + carry * 0.16;
  dens *= 0.84 + hold * 0.24;

  float ring = ringDensity(uv, u_time);
  dens += ring;

  float a = smoothstep(0.24, 0.7, dens);
  a = pow(a, 0.98);
  a *= 0.78 + 0.26 * clamp(press + carry * 0.28, 0.0, 1.0);
  a *= u_low_power > 0.5 ? 0.78 : 1.0;
  a = clamp(a, 0.0, 0.9);
  a *= vis;

  vec3 hi = vec3(0.85, 0.88, 0.93);
  vec3 sh = vec3(0.68, 0.73, 0.82);
  vec3 col = mix(sh, hi, clamp(veil * 0.9 + ring * 0.5, 0.0, 1.0));
  col *= 0.9 + 0.1 * wispy;
  // non-premultiplied alpha 블렌딩(SRC_ALPHA, ONE_MINUS_SRC_ALPHA)에 맞춰 rgb는 원색으로 출력
  fragColor = vec4(col, a);
}
`;
