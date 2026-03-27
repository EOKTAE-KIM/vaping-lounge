"use client";

import { useRef } from "react";
import type { EmitterPoint } from "@/store/usePressInteractionStore";
import type { SmokeMode } from "@/types/smokeMode";
import { useWebGLSmokeVolume } from "@/hooks/useWebGLSmokeVolume";

export function AmbientSmokeCanvas({
  lowPower,
  pressing,
  intensity,
  emitter,
  smokeMode,
}: {
  lowPower: boolean;
  pressing: boolean;
  intensity: number;
  emitter: EmitterPoint | null;
  smokeMode: SmokeMode;
}) {
  void smokeMode;
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  useWebGLSmokeVolume(canvasRef, {
    lowPower,
    pressing,
    intensity,
    emitter,
    smokeMode,
  });

  return (
    <div className="absolute inset-0 z-0 w-full h-full pointer-events-none" aria-hidden="true">
      <div
        className="pointer-events-none absolute inset-0 z-0 bg-black"
        style={{
          backgroundImage:
            "linear-gradient(180deg, rgba(8,9,12,0.35) 0%, transparent 18%, transparent 82%, rgba(6,7,10,0.3) 100%)",
        }}
      />
      {/* 상시 배경 연무 톤: 클릭 여부와 무관하게 공간감 유지 */}
      <div
        className="pointer-events-none absolute inset-0 z-0"
        style={{
          backgroundImage: [
            "radial-gradient(ellipse 130% 54% at 50% 44%, rgba(224,231,242,0.055) 0%, rgba(208,216,230,0.028) 34%, transparent 64%)",
            "radial-gradient(ellipse 96% 42% at 43% 52%, rgba(218,224,236,0.03) 0%, transparent 48%)",
            "radial-gradient(ellipse 96% 42% at 58% 48%, rgba(216,222,234,0.025) 0%, transparent 49%)",
          ].join(", "),
          opacity: 0.9,
        }}
      />
      {/* 배경 고정 포그 레이어 제거: 실제 연무는 shader density field에서만 렌더 */}
      <canvas
        ref={canvasRef}
        className="pointer-events-none absolute inset-0 z-[1] h-full w-full"
        aria-hidden="true"
      />
    </div>
  );
}

