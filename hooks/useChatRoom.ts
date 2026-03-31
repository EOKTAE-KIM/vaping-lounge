"use client";

import { useCallback, useEffect, useRef } from "react";
import type { RoomId } from "@/types/room";
import type { ChatEvent } from "@/types/chat";
import type { ChatRealtimeClient } from "@/types/chatProvider";
import { useChatStore } from "@/store/useChatStore";
import { useRoomStatsStore } from "@/store/useRoomStatsStore";
import { useUsageStore } from "@/store/useUsageStore";
import { useUserSessionStore } from "@/store/useUserSessionStore";
import { getChatClient } from "@/lib/chat/chatClientFactory";

export function useChatRoom(args: {
  roomId: RoomId;
  enabled: boolean;
  onNeedNickname?: () => void;
  /** 스토어에 닉네임이 없을 때(예: 하단 플로팅 채팅) 게스트 표시용으로 사용 */
  nicknameOverride?: string | null;
}) {
  const { roomId, enabled, nicknameOverride } = args;

  const nickname = useUserSessionStore((s) => s.nickname);
  const userId = useUserSessionStore((s) => s.userId);

  const appendMessage = useChatStore((s) => s.addMessage);
  const clearChat = useChatStore((s) => s.clear);

  const setStatsStore = useRoomStatsStore((s) => s.setStats);
  const onlineCountSetter = useRoomStatsStore((s) => s.setRoomId);

  const clientRef = useRef<ChatRealtimeClient | null>(null);

  const updateFromEvent = useCallback(
    (event: ChatEvent) => {
      if (event.kind === "message") {
        appendMessage(event.message);
        return;
      }
      if (event.kind === "presence") {
        const currentMy = useUsageStore.getState().mySmokeActionsToday;
        setStatsStore({
          roomId: event.roomId,
          onlineCount: event.onlineCount,
          totalSmokeActionsToday: useRoomStatsStore.getState().totalSmokeActionsToday,
          mySmokeActionsToday: currentMy,
        });
        return;
      }
      if (event.kind === "usage") {
        const currentMy = useUsageStore.getState().mySmokeActionsToday;
        setStatsStore({
          roomId: event.roomId,
          onlineCount: useRoomStatsStore.getState().onlineCount,
          totalSmokeActionsToday: event.totalSmokeActionsToday,
          mySmokeActionsToday: currentMy,
        });
        return;
      }
    },
    [appendMessage, setStatsStore]
  );

  useEffect(() => {
    // chat panel이 꺼져 있으면 불필요한 연결/구독을 하지 않음
    if (!enabled) return;

    const effectiveNickname = (nicknameOverride ?? nickname)?.trim();
    if (!effectiveNickname) {
      args.onNeedNickname?.();
      return;
    }

    clearChat();

    onlineCountSetter(roomId);
    setStatsStore({
      roomId,
      onlineCount: 1,
      totalSmokeActionsToday: 0,
      mySmokeActionsToday: useUsageStore.getState().mySmokeActionsToday,
    });

    const c = getChatClient();
    clientRef.current = c;

    let unsubscribe: (() => void) | null = null;

    (async () => {
      // subscribe 먼저 등록 (mock provider가 connect 이후 broadcast 타이밍에 의존)
      unsubscribe = c.subscribe((event) => updateFromEvent(event));
      // connect
      await c.connect({
        roomId,
        nickname: effectiveNickname,
        session: {
          nickname: nickname ?? effectiveNickname,
          roomId,
          joinedAt: Date.now(),
          userId,
        },
      });
    })();

    return () => {
      unsubscribe?.();
      clientRef.current = null;
      c.disconnect().catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, nickname, nicknameOverride, roomId, updateFromEvent]);

  const sendMessage = useCallback(
    async (text: string) => {
      if (!clientRef.current) return;
      await clientRef.current.sendMessage(text);
    },
    []
  );

  return { enabled, sendMessage };
}

