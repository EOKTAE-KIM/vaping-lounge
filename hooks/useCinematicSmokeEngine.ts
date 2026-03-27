"use client";

import type { RefObject } from "react";
import { useEffect, useRef } from "react";
import type { EmitterPoint } from "@/store/usePressInteractionStore";
import type { SmokeMode } from "@/types/smokeMode";
import { createSmokeStampSet } from "@/features/smoke/engine/renderSmokeStamp";
import { normalSmokePreset, smokeRingPreset } from "@/features/smoke/engine/smokePresets";
import { renderSmokeRing, type SmokeRing } from "@/features/smoke/engine/renderSmokeRing";

type Props = {
  lowPower: boolean;
  pressing: boolean;
  intensity: number;
  emitter: EmitterPoint | null;
  smokeMode: SmokeMode;
};

type Wisp = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  lifeMs: number;
  ageMs: number;
  size: number;
  alpha: number;
  rot: number;
  spin: number;
  stretch: number;
  strand: boolean;
};

function rand(seed: number) {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

export function useCinematicSmokeEngine(canvasRef: RefObject<HTMLCanvasElement | null>, props: Props) {
  const propsRef = useRef(props);
  propsRef.current = props;

  const rafRef = useRef<number | null>(null);
  const lastMsRef = useRef(0);
  const wispsRef = useRef<Wisp[]>([]);
  const ringsRef = useRef<SmokeRing[]>([]);
  const seedRef = useRef(1);
  const lastRingMsRef = useRef(0);
  const prevPressRef = useRef(false);
  const lastReleaseMsRef = useRef(0);
  const activatedRef = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;
    const stamps = createSmokeStampSet();
    const preset = normalSmokePreset[propsRef.current.lowPower ? "low" : "high"];

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dprRaw = window.devicePixelRatio || 1;
      const dpr = Math.max(1, Math.min(propsRef.current.lowPower ? 1 : 1.2, dprRaw));
      canvas.width = Math.max(1, Math.floor(rect.width * dpr));
      canvas.height = Math.max(1, Math.floor(rect.height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    const spawnWisp = (dtSec: number, strand: boolean, ambientWide: boolean) => {
      const rect = canvas.getBoundingClientRect();
      const em = propsRef.current.emitter;
      const centerX = rect.width * 0.5;
      const centerY = rect.height * 0.46;
      const localX = em ? em.clientX - rect.left : centerX;
      const localY = em ? em.clientY - rect.top : centerY;
      // 배경형 연무는 emitter 편향을 거의 제거해 화면 전역에서 발생
      const bias = ambientWide ? 0.04 : 0.42;
      const baseX = centerX * (1 - bias) + localX * bias;
      const baseY = centerY * (1 - bias) + localY * bias;
      const s = ++seedRef.current;
      const spreadX = ambientWide ? rect.width * (strand ? 0.72 : 0.9) : strand ? 130 : 210;
      const spreadY = ambientWide ? rect.height * (strand ? 0.44 : 0.62) : strand ? 72 : 108;
      const x = baseX + (rand(s * 0.7) - 0.5) * spreadX;
      const y = baseY + (rand(s * 1.3) - 0.5) * spreadY;
      const intensity = Math.max(0.2, Math.min(1.2, propsRef.current.intensity / 1.3));
      wispsRef.current.push({
        x,
        y,
        vx: (rand(s * 2.1) - 0.5) * (ambientWide ? (strand ? 6 : 9) : strand ? 8 : 13),
        vy: -(ambientWide ? 8 : 14) - rand(s * 2.9) * (ambientWide ? 7 : 11) - intensity * (ambientWide ? 5 : 10),
        lifeMs: (strand ? 3400 : 4200) + rand(s * 3.1) * 1700,
        ageMs: 0,
        size: (strand ? 20 : 34) + rand(s * 4.3) * (strand ? 28 : 52),
        alpha: (strand ? 0.1 : 0.075) + rand(s * 5.1) * 0.08,
        rot: rand(s * 6.2) * Math.PI * 2,
        spin: (rand(s * 7.4) - 0.5) * 0.6,
        stretch: strand ? 1.95 + rand(s * 8.7) * 1.35 : 1.05 + rand(s * 9.3) * 0.45,
        strand,
      });
      const cap = strand ? preset.maxStrands : preset.maxVeil;
      const list = wispsRef.current.filter((w) => w.strand === strand);
      if (list.length > cap) {
        // drop oldest in that layer
        let drop = list.length - cap;
        wispsRef.current = wispsRef.current.filter((w) => {
          if (w.strand !== strand) return true;
          if (drop > 0) {
            drop--;
            return false;
          }
          return true;
        });
      }
      void dtSec;
    };

    const spawnRing = (now: number) => {
      if (now - lastRingMsRef.current < smokeRingPreset.spawnCooldownMs) return;
      lastRingMsRef.current = now;
      const rect = canvas.getBoundingClientRect();
      const em = propsRef.current.emitter;
      const s = ++seedRef.current;
      const cx = (em ? em.clientX - rect.left : rect.width * 0.5) + (rand(s) - 0.5) * 24;
      const cy = (em ? em.clientY - rect.top : rect.height * 0.45) + (rand(s * 1.7) - 0.5) * 18;
      const dirX = (em?.driftX ?? 0) * 36 + (rand(s * 2.7) - 0.5) * 20;
      const dirY = -66 - rand(s * 3.1) * 24;
      ringsRef.current.push({
        x: cx,
        y: cy,
        vx: dirX,
        vy: dirY,
        radius: smokeRingPreset.baseRadius + 8 + rand(s * 3.9) * 14,
        thickness: smokeRingPreset.thickness + 3 + rand(s * 4.7) * 6,
        ageMs: 0,
        lifeMs: preset.ringLifeMs,
        seed: s,
        swirl: (rand(s * 6.3) - 0.5) * 0.9,
      });
      if (ringsRef.current.length > preset.maxRings) ringsRef.current.shift();
    };

    const step = (now: number) => {
      const dtMs = lastMsRef.current > 0 ? Math.min(48, Math.max(0, now - lastMsRef.current)) : 16;
      lastMsRef.current = now;
      const dtSec = dtMs / 1000;
      const p = propsRef.current;
      const rect = canvas.getBoundingClientRect();
      const intensity01 = Math.max(0, Math.min(1, p.intensity / 1.3));

      if (p.pressing) {
        const veilRate = preset.veilSpawnPerSec * (0.58 + intensity01 * preset.pressBoost * 0.72);
        const strandRate = preset.strandSpawnPerSec * (0.92 + intensity01 * preset.pressBoost);
        let veilToSpawn = veilRate * dtSec;
        let strandToSpawn = strandRate * dtSec;
        while (veilToSpawn > 0) {
          if (Math.random() < veilToSpawn) spawnWisp(dtSec, false, true);
          veilToSpawn -= 1;
        }
        while (strandToSpawn > 0) {
          if (Math.random() < strandToSpawn) spawnWisp(dtSec, true, true);
          strandToSpawn -= 1;
        }
      }

      const mode = p.smokeMode;
      if (p.pressing) activatedRef.current = true;
      if (!p.pressing && prevPressRef.current) lastReleaseMsRef.current = now;
      if (p.pressing && mode === "donut") spawnRing(now);
      if (p.pressing && mode === "dragon" && now - lastRingMsRef.current > 320) spawnRing(now);
      prevPressRef.current = p.pressing;

      // 클릭 후 최소 3초 유지, 이후 서서히 감쇠
      ctx.globalCompositeOperation = "source-over";
      let clearAlpha = 0.08;
      if (!activatedRef.current) clearAlpha = 1;
      else if (p.pressing) clearAlpha = 0.055;
      else {
        const sinceRelease = now - lastReleaseMsRef.current;
        if (sinceRelease < 3000) clearAlpha = 0.018;
        else {
          const after = Math.min(1, (sinceRelease - 3000) / 2400);
          clearAlpha = 0.018 + after * 0.115;
        }
      }
      ctx.fillStyle = `rgba(0,0,0,${clearAlpha})`;
      ctx.fillRect(0, 0, rect.width, rect.height);

      if (activatedRef.current) {
        // 전역 바닥 띠를 만들지 않도록 화면 전역에 얇은 연무만 분산 배치
        for (let i = 0; i < 12; i++) {
          const nx = ((i / 12) * rect.width + Math.sin(now * 0.00019 + i * 0.61) * 28 + rect.width) % rect.width;
          const ny = rect.height * (0.22 + (i % 6) * 0.11) + Math.cos(now * 0.00016 + i * 0.47) * 10;
          const s = rect.width * (0.12 + ((i * 5) % 7) * 0.018);
          ctx.globalCompositeOperation = "source-over";
          ctx.globalAlpha = 0.035;
          ctx.drawImage(stamps.veil, nx - s * 0.5, ny - s * 0.5, s, s * 0.66);
        }
      }

      const nextWisps: Wisp[] = [];
      for (const w of wispsRef.current) {
        w.ageMs += dtMs;
        if (w.ageMs >= w.lifeMs) continue;
        const life = 1 - w.ageMs / w.lifeMs;
        const flowX = Math.sin((w.y + now * 0.03) * 0.01) * 6 + Math.cos((w.x - now * 0.02) * 0.008) * 3;
        const flowY = Math.cos((w.x + now * 0.04) * 0.009) * 2;
        w.vx += flowX * dtSec * 0.5;
        w.vy += flowY * dtSec * 0.28;
        w.x += w.vx * dtSec;
        w.y += w.vy * dtSec;
        w.rot += w.spin * dtSec;
        w.vx *= 0.986;
        w.vy *= 0.992;

        const a = w.alpha * life * (w.strand ? 0.88 : 0.66);
        const s = w.size * (0.8 + (1 - life) * 0.6);
        ctx.save();
        ctx.translate(w.x, w.y);
        ctx.rotate(w.rot);
        ctx.scale(w.stretch, 1);
        ctx.globalCompositeOperation = "source-over";
        ctx.globalAlpha = Math.max(0, a);
        const stamp = w.strand ? stamps.strand : life > 0.55 ? stamps.core : stamps.veil;
        ctx.drawImage(stamp, -s * 0.5, -s * 0.5, s, s);
        ctx.restore();
        nextWisps.push(w);
      }
      wispsRef.current = nextWisps;

      const nextRings: SmokeRing[] = [];
      for (const ring of ringsRef.current) {
        ring.ageMs += dtMs;
        if (ring.ageMs >= ring.lifeMs) continue;
        const t = ring.ageMs / ring.lifeMs;
        const impulse = Math.max(0, 1 - ring.ageMs / smokeRingPreset.impulseMs);
        ring.radius += smokeRingPreset.expansionPerSec * dtSec * (0.48 + impulse * 0.62);
        ring.x += ring.vx * dtSec * (0.6 + impulse * 0.8);
        ring.y += ring.vy * dtSec * (0.65 + impulse * 0.8);
        ring.vx *= 0.985;
        ring.vy *= 0.985;
        renderSmokeRing(ctx, stamps, ring);
        nextRings.push(ring);
      }
      ringsRef.current = nextRings;

      rafRef.current = requestAnimationFrame(step);
    };

    rafRef.current = requestAnimationFrame(step);
    return () => {
      window.removeEventListener("resize", resize);
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, [canvasRef]);
}
