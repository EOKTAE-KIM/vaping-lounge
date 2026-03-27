import { create } from "zustand";
import type { TrickType } from "@/types/tricks";

type UIState = {
  chatOpen: boolean;
  setChatOpen: (open: boolean) => void;
  selectedTrick: TrickType;
  setSelectedTrick: (trick: TrickType) => void;
  trickRunNonce: number;
  bumpTrickRunNonce: () => void;
};

export const useUIStore = create<UIState>((set) => ({
  chatOpen: false,
  setChatOpen: (chatOpen) => set({ chatOpen }),
  selectedTrick: "none",
  setSelectedTrick: (selectedTrick) => set({ selectedTrick }),
  trickRunNonce: 0,
  bumpTrickRunNonce: () => set((s) => ({ trickRunNonce: s.trickRunNonce + 1 })),
}));

