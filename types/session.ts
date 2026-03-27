import type { RoomId } from "./room";

export type UserSession = {
  nickname: string | null;
  roomId: RoomId;
  joinedAt: number; // epoch ms
  userId: string; // stable within the device
};

