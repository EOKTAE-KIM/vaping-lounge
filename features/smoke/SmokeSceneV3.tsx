"use client";

import type { SmokeMode } from "@/types/smokeMode";
import type { EmitterPoint } from "@/store/usePressInteractionStore";
import { SmokeCanvas } from "@/components/smoke/SmokeCanvas";

export function SmokeSceneV3({
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
  return <SmokeCanvas pressing={pressing} smokeMode={smokeMode} intensity={intensity} emitter={emitter} lowPower={lowPower} />;
}

