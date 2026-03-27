export type SmokeStampSet = {
  veil: HTMLCanvasElement;
  core: HTMLCanvasElement;
  strand: HTMLCanvasElement;
};

function hash(n: number) {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

function makeStamp(size: number, seed: number, hardEdge = false) {
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const ctx = c.getContext("2d");
  if (!ctx) return c;

  const cx = size * 0.5;
  const cy = size * 0.5;
  const r = size * 0.48;

  for (let i = 0; i < 18; i++) {
    const t = (i / 18) * Math.PI * 2;
    const rr = r * (0.72 + hash(seed + i) * 0.34);
    const x = cx + Math.cos(t) * rr;
    const y = cy + Math.sin(t) * rr;
    if (i === 0) ctx.beginPath();
    else ctx.lineTo(x, y);
  }
  ctx.closePath();

  const g = ctx.createRadialGradient(cx, cy, size * (hardEdge ? 0.08 : 0.03), cx, cy, r);
  g.addColorStop(0, "rgba(255,255,255,0.18)");
  g.addColorStop(hardEdge ? 0.62 : 0.5, "rgba(255,255,255,0.22)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fill();

  ctx.globalCompositeOperation = "destination-out";
  for (let i = 0; i < 14; i++) {
    const x = cx + (hash(seed + i * 2.1) - 0.5) * size * 0.65;
    const y = cy + (hash(seed + i * 3.3) - 0.5) * size * 0.65;
    const rr = size * (0.04 + hash(seed + i * 5.1) * 0.08);
    const gg = ctx.createRadialGradient(x, y, 0, x, y, rr);
    gg.addColorStop(0, "rgba(0,0,0,0.24)");
    gg.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = gg;
    ctx.beginPath();
    ctx.arc(x, y, rr, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalCompositeOperation = "source-over";

  return c;
}

export function createSmokeStampSet(): SmokeStampSet {
  return {
    veil: makeStamp(120, 11),
    core: makeStamp(144, 29),
    strand: makeStamp(92, 53, true),
  };
}
