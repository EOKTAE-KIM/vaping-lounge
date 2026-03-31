import type { ChatRealtimeClient } from "@/types/chatProvider";
import type { RoomId } from "@/types/room";

import { createMockChatClient } from "./providers/mockChatProvider";
import { createSseChatProvider } from "./providers/sseChatProvider";

/**
 * - 기본: SSE (`/api/chat/stream`, `/api/chat/send`) — 같은 Next 서버에 붙은 기기끼리 실시간 공유
 * - `NEXT_PUBLIC_CHAT_TRANSPORT=mock` 이면 로컬 전용 mock
 */
export function getChatClient(): ChatRealtimeClient {
  const transport = (process.env.NEXT_PUBLIC_CHAT_TRANSPORT ?? "sse").toLowerCase();

  if (transport === "mock") {
    return createMockChatClient();
  }

  if (typeof window !== "undefined") {
    return createSseChatProvider();
  }

  return createMockChatClient();
}

export function roomIdToString(roomId: RoomId) {
  return roomId;
}

