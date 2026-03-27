import type { ChatRealtimeClient } from "@/types/chatProvider";
import type { RoomId } from "@/types/room";

import { createMockChatClient } from "./providers/mockChatProvider";

export function getChatClient(): ChatRealtimeClient {
  // MVP에서는 mock만 구현. 추후 Firebase/Supabase/Socket 클라이언트로 교체 가능.
  // 예: NEXT_PUBLIC_CHAT_PROVIDER="mock" | "firebase" | "supabase" | "socket"
  const provider = process.env.NEXT_PUBLIC_CHAT_PROVIDER ?? "mock";

  if (provider === "mock") return createMockChatClient();

  // 기본 fallback
  return createMockChatClient();
}

export function roomIdToString(roomId: RoomId) {
  return roomId;
}

