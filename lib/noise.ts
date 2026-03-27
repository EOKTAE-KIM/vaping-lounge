export function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

export function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

export function smoothstep(t: number) {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
}

// 0..1 deterministic-ish hash
export function hash2(ix: number, iy: number, seed: number) {
  const s = Math.sin(ix * 127.1 + iy * 311.7 + seed * 74.7) * 43758.5453123;
  return s - Math.floor(s);
}

export function valueNoise2D(x: number, y: number, seed: number) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const tx = x - xi;
  const ty = y - yi;

  const u = tx * tx * (3 - 2 * tx);
  const v = ty * ty * (3 - 2 * ty);

  const a = hash2(xi, yi, seed);
  const b = hash2(xi + 1, yi, seed);
  const c = hash2(xi, yi + 1, seed);
  const d = hash2(xi + 1, yi + 1, seed);

  const ab = lerp(a, b, u);
  const cd = lerp(c, d, u);
  return lerp(ab, cd, v);
}

// fbm (fractal brownian motion) using valueNoise2D
export function fbm2D(x: number, y: number, seed: number, octaves = 4) {
  let amp = 0.5;
  let freq = 1.0;
  let sum = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * valueNoise2D(x * freq, y * freq, seed + i * 17.13);
    freq *= 2;
    amp *= 0.5;
  }
  return sum; // roughly 0..1
}

// pseudo-curl vector field via finite differences of valueNoise2D
export function curlField(x: number, y: number, t: number, seed: number) {
  // scale affects structure size
  const scale = 0.01;
  const eps = 0.75;

  const tt = t * 0.25;
  const nx1 = fbm2D((x + eps) * scale, y * scale + tt, seed, 3);
  const nx2 = fbm2D((x - eps) * scale, y * scale + tt, seed, 3);
  const ny1 = fbm2D(x * scale + 10.2, (y + eps) * scale + tt, seed, 3);
  const ny2 = fbm2D(x * scale + 10.2, (y - eps) * scale + tt, seed, 3);

  // derivative-like differences
  const dx = nx1 - nx2;
  const dy = ny1 - ny2;

  // curl-like perpendicular vector
  let vx = dy;
  let vy = -dx;
  const m = Math.hypot(vx, vy) || 1;
  vx /= m;
  vy /= m;
  return { vx, vy };
}

