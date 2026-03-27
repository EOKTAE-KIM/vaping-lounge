import type { RoomId } from "./room";

export type RoomStats = {
  roomId: RoomId;
  onlineCount: number;
  totalSmokeActionsToday: number;
  mySmokeActionsToday: number;
};

