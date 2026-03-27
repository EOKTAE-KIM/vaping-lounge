import type { RoomId } from "./room";
import type { TrickType } from "./tricks";

export type SmokeActionOrigin =
  | { kind: "tap"; strength: number }
  | { kind: "longPress"; strength: number }
  | { kind: "swipe"; strength: number; dx: number; dy: number };

export type SmokeAction = {
  id: string;
  roomId: RoomId;
  createdAt: number; // epoch ms
  userId: string;
  type: TrickType;
  strength: number; // 0.5 ~ 2.0 정도
  origin: SmokeActionOrigin;
};

// --------------------------------------------
// Smoke engine (blob-based) types
// --------------------------------------------

export type SmokeLayerType = "plume" | "body" | "diffuse" | "ambient" | "ring";

export type SmokeBlob = {
  layerType: SmokeLayerType;
  x: number;
  y: number;
  vx: number;
  vy: number;

  size: number; // initial size (px), 30~120 typical, ambient 100~300
  alpha: number; // 0..1 center intensity (feather handles outer fade)
  density: number; // 0..1+ affects alpha/edge softness

  life: number; // remaining seconds
  maxLife: number; // initial seconds

  noiseOffsetX: number;
  noiseOffsetY: number;
  swirl: number; // per-blob rotation variance
};

