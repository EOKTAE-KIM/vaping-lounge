import { create } from "zustand";
import type { SmokeAction } from "@/types/smoke";
import type { RoomId } from "@/types/room";

type SmokeStoreState = {
  lastAction: SmokeAction | null;
  setLastAction: (action: SmokeAction) => void;
  roomId: RoomId;
  setRoomId: (roomId: RoomId) => void;
};

export const useSmokeStore = create<SmokeStoreState>((set) => ({
  lastAction: null,
  setLastAction: (action) => set({ lastAction: action }),
  roomId: "lounge",
  setRoomId: (roomId) => set({ roomId }),
}));

