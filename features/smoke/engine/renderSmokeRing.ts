import type { SmokeStampSet } from "@/features/smoke/engine/renderSmokeStamp";

export type SmokeRing = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  thickness: number;
  lifeMs: number;
  ageMs: number;
  seed: number;
  swirl: number;
};

function noise1(seed: number) {
  const x = Math.sin(seed * 91.7 + 19.3) * 43758.5453;
  return x - Math.floor(x);
}

export function renderSmokeRing(
  ctx: CanvasRenderingContext2D,
  stamps: SmokeStampSet,
  ring: SmokeRing
) {
  const t = Math.min(1, ring.ageMs / ring.lifeMs);
  const impulse = 1 - Math.min(1, ring.ageMs / 220);
  const alive = 1 - t;
  const edgeAlpha = (0.72 + impulse * 0.34) * alive;
  const segCount = 96;

  for (let i = 0; i < segCount; i++) {
    const a = (i / segCount) * Math.PI * 2;
    const jitter = (noise1(ring.seed + i * 0.37 + t * 9) - 0.5) * ring.thickness * (0.9 + t * 1.5);
    const rr = ring.radius + jitter;
    const x = ring.x + Math.cos(a + ring.swirl * t) * rr;
    const y = ring.y + Math.sin(a + ring.swirl * t) * rr * 0.88;
    const s = ring.thickness * (0.92 + noise1(ring.seed + i * 1.21) * 0.7);
    const alpha = edgeAlpha * (0.54 + noise1(ring.seed + i * 2.1) * 0.5);

    ctx.globalAlpha = Math.max(0, alpha);
    ctx.drawImage(stamps.strand, x - s * 0.5, y - s * 0.5, s, s * 0.92);
  }

  // keep center hollow, but not perfectly clean
  ctx.save();
  ctx.globalCompositeOperation = "destination-out";
  const holeR = ring.radius * 0.52;
  const gg = ctx.createRadialGradient(ring.x, ring.y, holeR * 0.2, ring.x, ring.y, holeR);
  gg.addColorStop(0, "rgba(0,0,0,0.72)");
  gg.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = gg;
  ctx.beginPath();
  ctx.arc(ring.x, ring.y, holeR, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // trailing smoke strands behind the ring
  const tailCount = 42;
  for (let i = 0; i < tailCount; i++) {
    const tt = i / Math.max(1, tailCount - 1);
    const tx = ring.x - ring.vx * 0.08 * i + (noise1(ring.seed + i * 3.7) - 0.5) * 20;
    const ty = ring.y - ring.vy * 0.08 * i + (noise1(ring.seed + i * 5.4) - 0.5) * 15;
    const s = ring.thickness * (0.95 + tt * 1.35);
    ctx.globalAlpha = Math.max(0, 0.24 * (1 - tt) * alive);
    ctx.drawImage(stamps.veil, tx - s * 0.5, ty - s * 0.5, s * 1.15, s * 0.86);
  }
}
