export type SmokeQuality = "low" | "high";

export type SmokePreset = {
  maxVeil: number;
  maxStrands: number;
  maxRings: number;
  veilSpawnPerSec: number;
  strandSpawnPerSec: number;
  pressBoost: number;
  ringLifeMs: number;
};

export const normalSmokePreset: Record<SmokeQuality, SmokePreset> = {
  low: {
    maxVeil: 90,
    maxStrands: 70,
    maxRings: 4,
    veilSpawnPerSec: 14,
    strandSpawnPerSec: 10,
    pressBoost: 1.1,
    ringLifeMs: 2400,
  },
  high: {
    maxVeil: 150,
    maxStrands: 130,
    maxRings: 7,
    veilSpawnPerSec: 22,
    strandSpawnPerSec: 17,
    pressBoost: 1.45,
    ringLifeMs: 3000,
  },
};

export const smokeRingPreset = {
  spawnCooldownMs: 170,
  impulseMs: 220,
  baseRadius: 22,
  expansionPerSec: 36,
  thickness: 8,
};
