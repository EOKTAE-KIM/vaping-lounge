import type { RoomId } from "./room";

export type ChatMessage = {
  id: string;
  roomId: RoomId;
  nickname: string;
  text: string;
  createdAt: number; // epoch ms
  kind: "message" | "system";
};

export type ChatEvent =
  | { kind: "message"; message: ChatMessage }
  | { kind: "presence"; roomId: RoomId; onlineCount: number }
  | {
      kind: "usage";
      roomId: RoomId;
      totalSmokeActionsToday: number;
      mySmokeActionsToday: number;
    };

