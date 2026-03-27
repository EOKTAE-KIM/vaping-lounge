import type { RoomId } from "./room";
import type { ChatEvent } from "./chat";
import type { UserSession } from "./session";

export type ChatRealtimeClient = {
  connect: (args: { roomId: RoomId; nickname: string; session: UserSession }) => Promise<void>;
  disconnect: () => Promise<void>;
  sendMessage: (text: string) => Promise<void>;
  subscribe: (handler: (event: ChatEvent) => void) => () => void;
};

