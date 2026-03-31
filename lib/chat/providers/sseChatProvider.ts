"use client";

import type { ChatEvent } from "@/types/chat";
import type { ChatRealtimeClient } from "@/types/chatProvider";
import type { RoomId } from "@/types/room";
import type { UserSession } from "@/types/session";

type Listener = (event: ChatEvent) => void;

/**
 * 같은 오리진의 `/api/chat/stream` + `/api/chat/send` (SSE)로 실시간 채팅.
 * LAN에서 `http://192.168.x.x:3000` 으로 접속한 여러 기기가 동일 Next 프로세스를 쓰면 서로 메시지를 볼 수 있음.
 */
export function createSseChatProvider(opts: { basePath?: string } = {}): ChatRealtimeClient {
  const base = opts.basePath ?? "";
  let es: EventSource | null = null;
  let listener: Listener | null = null;
  let roomId: RoomId | null = null;
  let nickname: string | null = null;

  const detach = () => {
    if (es) {
      es.close();
      es = null;
    }
    roomId = null;
    nickname = null;
  };

  const connect = async (args: { roomId: RoomId; nickname: string; session: UserSession }) => {
    detach();
    roomId = args.roomId;
    nickname = args.nickname.trim() || "guest";

    const q = new URLSearchParams({
      roomId: args.roomId,
      nickname: nickname,
    });
    const url = `${base}/api/chat/stream?${q.toString()}`;
    es = new EventSource(url);

    es.onmessage = (ev) => {
      if (!listener) return;
      try {
        const parsed = JSON.parse(ev.data) as ChatEvent;
        if (parsed.kind === "message" || parsed.kind === "presence" || parsed.kind === "usage") {
          listener(parsed);
        }
      } catch {
        /* ignore */
      }
    };

    es.onerror = () => {
      // 브라우저가 자동 재연결 시도. 완전 종료는 disconnect에서 처리.
    };
  };

  const disconnect = async () => {
    detach();
  };

  const sendMessage = async (text: string) => {
    if (!roomId || !nickname) return;
    const body = JSON.stringify({ roomId, nickname, text });
    const res = await fetch(`${base}/api/chat/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });
    if (!res.ok) {
      try {
        const err = await res.json();
        console.warn("[chat] send failed", err);
      } catch {
        console.warn("[chat] send failed", res.status);
      }
    }
  };

  const subscribe = (handler: Listener) => {
    listener = handler;
    return () => {
      listener = null;
    };
  };

  return {
    connect,
    disconnect,
    sendMessage,
    subscribe,
  };
}
