"use client";

import { useRef } from "react";
import type { EmitterPoint } from "@/store/usePressInteractionStore";
import type { SmokeMode } from "@/types/smokeMode";
import { useSmokeTextureEngine } from "@/hooks/useSmokeTextureEngine";

export function TrickOverlay({
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
  // 훅은 항상 같은 순서로 호출되어야 함 — smokeMode 분기는 훅 아래에서만 처리
  useSmokeTextureEngine(canvasRef, {
    kind: "trick",
    pressing: smokeMode === "donut" || smokeMode === "dragon" ? pressing : false,
    smokeMode,
    intensity,
    emitter,
    lowPower,
  });

  // 도넛/용 트릭 잔상이 release 후에도 보이도록 캔버스는 항상 유지한다.
  // 도넛/용 트릭은 기기 레이어에 가려지지 않게 앞쪽에 렌더링한다.
  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 z-[11] w-full h-full pointer-events-none mix-blend-screen opacity-95"
      aria-hidden="true"
    />
  );
}

