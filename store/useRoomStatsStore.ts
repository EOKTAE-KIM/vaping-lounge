import { create } from "zustand";
import type { RoomId } from "@/types/room";
import type { RoomStats } from "@/types/stats";

type RoomStatsState = {
  currentRoomId: RoomId;
  onlineCount: number;
  totalSmokeActionsToday: number;
  mySmokeActionsToday: number;
  setRoomId: (roomId: RoomId) => void;
  setStats: (stats: Omit<RoomStats, "roomId"> & { roomId: RoomId }) => void;
};

export const useRoomStatsStore = create<RoomStatsState>((set) => ({
  currentRoomId: "lounge",
  onlineCount: 1,
  totalSmokeActionsToday: 0,
  mySmokeActionsToday: 0,
  setRoomId: (roomId) => set({ currentRoomId: roomId }),
  setStats: (stats) =>
    set({
      currentRoomId: stats.roomId,
      onlineCount: stats.onlineCount,
      totalSmokeActionsToday: stats.totalSmokeActionsToday,
      mySmokeActionsToday: stats.mySmokeActionsToday,
    }),
}));

