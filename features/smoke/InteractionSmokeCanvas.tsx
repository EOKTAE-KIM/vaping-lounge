"use client";

import type { EmitterPoint } from "@/store/usePressInteractionStore";
import type { SmokeMode } from "@/types/smokeMode";

export function InteractionSmokeCanvas({
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
  // 기존 particle/ring 기반 상호작용 캔버스는 더 이상 사용하지 않습니다.
  // 연기 렌더링은 `AmbientSmokeCanvas` + `TrickOverlay`만 담당합니다.
  void pressing;
  void smokeMode;
  void intensity;
  void emitter;
  void lowPower;
  return null;
}

