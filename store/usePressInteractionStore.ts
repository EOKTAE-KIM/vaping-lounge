import { create } from "zustand";
import type { SmokeMode } from "@/types/smokeMode";

export type EmitterPoint = {
  clientX: number;
  clientY: number;
  rawClientX?: number;
  rawClientY?: number;
  // 좌우 미세 드리프트(사용자 손 위치에 반응)
  driftX: number; // -1 ~ 1
};

type PressInteractionState = {
  isPressing: boolean;
  smokeIntensity: number; // 0 ~ 1.5 정도
  smokeMode: SmokeMode;
  emitter: EmitterPoint | null;
  setIsPressing: (isPressing: boolean) => void;
  setSmokeIntensity: (value: number) => void;
  setSmokeMode: (mode: SmokeMode) => void;
  setEmitter: (emitter: EmitterPoint | null) => void;
  reset: () => void;
};

export const usePressInteractionStore = create<PressInteractionState>((set) => ({
  isPressing: false,
  smokeIntensity: 0,
  smokeMode: "normal",
  emitter: null,
  setIsPressing: (isPressing) => set({ isPressing }),
  setSmokeIntensity: (smokeIntensity) => set({ smokeIntensity }),
  setSmokeMode: (smokeMode) => set({ smokeMode }),
  setEmitter: (emitter) => set({ emitter }),
  reset: () =>
    set({
      isPressing: false,
      smokeIntensity: 0,
      smokeMode: "normal",
      emitter: null,
    }),
}));

