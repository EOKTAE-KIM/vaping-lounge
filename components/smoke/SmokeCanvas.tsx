"use client";

import { useRef } from "react";
import type { SmokeMode } from "@/types/smokeMode";
import type { EmitterPoint } from "@/store/usePressInteractionStore";
import { useSmokeEngine } from "@/hooks/useSmokeEngine";

export function SmokeCanvas({
  pressing,
  smokeMode,
  intensity,
  emitter,
  lowPower,
}: {
  pressing: boolean;
  smokeMode: SmokeMode;
  intensity: number;
  emitter: EmitterPoint | null;
  lowPower: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useSmokeEngine(canvasRef, { pressing, smokeMode, intensity, emitter, lowPower });

  return <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none" aria-hidden="true" />;
}

