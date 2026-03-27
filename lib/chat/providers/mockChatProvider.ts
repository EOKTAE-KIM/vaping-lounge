import type { ChatEvent } from "@/types/chat";
import type { ChatMessage } from "@/types/chat";
import type { ChatRealtimeClient } from "@/types/chatProvider";
import type { RoomId } from "@/types/room";
import type { UserSession } from "@/types/session";

type Listener = (event: ChatEvent) => void;

type RoomState = {
  roomId: RoomId;
  listeners: Set<Listener>;
  botOnlineNames: string[];
  connectedCount: number;
  totalSmokeActionsToday: number;
  botTimer: number | null;
};

const BOT_NAMES = [
  "연무가득",
  "시안의숨",
  "블랙커브",
  "큐브링",
  "차콜바람",
  "네온미니",
  "달빛도넛",
  "거북선집중",
  "가벼운심장",
];

const roomStates = new Map<RoomId, RoomState>();

function getRoomState(roomId: RoomId): RoomState {
  const existing = roomStates.get(roomId);
  if (existing) return existing;

  const created: RoomState = {
    roomId,
    listeners: new Set(),
    botOnlineNames: [],
    connectedCount: 0,
    totalSmokeActionsToday: 0,
    botTimer: null,
  };

  roomStates.set(roomId, created);
  return created;
}

function broadcast(roomState: RoomState, event: ChatEvent) {
  for (const l of roomState.listeners) l(event);
}

function makeMessage(params: {
  roomId: RoomId;
  nickname: string;
  text: string;
  createdAt: number;
  kind: "message" | "system";
}): ChatMessage {
  return {
    id: crypto.randomUUID?.() ?? `${Date.now()}_${Math.random()}`,
    roomId: params.roomId,
    nickname: params.nickname,
    text: params.text,
    createdAt: params.createdAt,
    kind: params.kind,
  };
}

function pickRandom<T>(arr: T[]) {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function createMockChatClient(): ChatRealtimeClient {
  let roomId: RoomId | null = null;
  let nickname: string | null = null;
  let listener: Listener | null = null;
  let isConnected = false;
  let roomState: RoomState | null = null;

  const connect = async (args: {
    roomId: RoomId;
    nickname: string;
    session: UserSession;
  }) => {
    if (isConnected) return;
    isConnected = true;

    roomId = args.roomId;
    nickname = args.nickname;

    roomState = getRoomState(args.roomId);
    roomState.connectedCount += 1;
    roomState.totalSmokeActionsToday += Math.floor(Math.random() * 12);

    // subscribe()를 먼저 해둔 경우를 위해 listener를 roomState에 연결
    if (listener) {
      roomState.listeners.add(listener);
    }

    if (!roomState.botTimer) {
      // 봇 참여/이탈 + 실시간처럼 보이는 사용량/접속자 변화
      roomState.botTimer = window.setInterval(() => {
        if (!roomState) return;

        // 봇 온라인 수를 완만하게 흔듦
        const targetOnline = Math.max(
          0,
          Math.min(BOT_NAMES.length, 2 + Math.floor(Math.random() * 5) - (roomState.connectedCount > 0 ? 0 : 1))
        );

        // 온라인 봇 목록 재구성
        const nextBots: string[] = [];
        while (nextBots.length < targetOnline) {
          const candidate = pickRandom(BOT_NAMES);
          if (!nextBots.includes(candidate)) nextBots.push(candidate);
        }

        const prevSet = new Set(roomState.botOnlineNames);
        roomState.botOnlineNames = nextBots;

        // 시스템 메시지: 봇 출입
        const entered = nextBots.filter((n) => !prevSet.has(n));

        for (const n of entered) {
          const sys = makeMessage({
            roomId: roomState.roomId,
            nickname: n,
            text: `${n}님이 방에 들어왔어요`,
            createdAt: Date.now(),
            kind: "system",
          });
          broadcast(roomState, { kind: "message", message: sys } as ChatEvent);
        }

        // 사용량/접속자 반영
        roomState.totalSmokeActionsToday += Math.floor(Math.random() * 4) + 1;
        const onlineCount = roomState.connectedCount + nextBots.length;

        const presenceEvent: ChatEvent = {
          kind: "presence",
          roomId: roomState.roomId,
          onlineCount,
        };
        broadcast(roomState, presenceEvent);

        const usageEvent: ChatEvent = {
          kind: "usage",
          roomId: roomState.roomId,
          totalSmokeActionsToday: roomState.totalSmokeActionsToday,
          mySmokeActionsToday: 0,
        };
        broadcast(roomState, usageEvent);
      }, 3500);
    }

    // 본인 입장 시스템 메시지 (listener 등록 전이므로 임시 브로드캐스트)
    const system = makeMessage({
      roomId: args.roomId,
      nickname: args.nickname,
      text: `${args.nickname}님이 방에 들어왔어요`,
      createdAt: Date.now(),
      kind: "system",
    });

    // 리스너가 등록되기 전에도 보이길 원하면 기존 listeners에만 브로드캐스트
    broadcast(roomState, { kind: "message", message: system } as unknown as ChatEvent);
  };

  const disconnect = async () => {
    if (!isConnected || !roomState || !roomId || !nickname) return;
    isConnected = false;

    roomState.connectedCount = Math.max(0, roomState.connectedCount - 1);

    const system = makeMessage({
      roomId,
      nickname,
      text: `${nickname}님이 방을 나갔어요`,
      createdAt: Date.now(),
      kind: "system",
    });
    broadcast(roomState, { kind: "message", message: system } as unknown as ChatEvent);

    if (roomState.connectedCount <= 0) {
      if (roomState.botTimer) {
        window.clearInterval(roomState.botTimer);
      }
      roomState.botTimer = null;
      roomState.botOnlineNames = [];
    }
  };

  const sendMessage = async (text: string) => {
    if (!roomState || !roomId || !nickname) return;

    const msg = makeMessage({
      roomId,
      nickname,
      text,
      createdAt: Date.now(),
      kind: "message",
    });

    broadcast(roomState, { kind: "message", message: msg } as unknown as ChatEvent);

    // 간단한 반응: 특정 키워드가 오면 시스템 느낌의 답을 조금 섞음
    if (Math.random() < 0.12) {
      const bot = pickRandom(BOT_NAMES);
      const replyText =
        Math.random() < 0.5
          ? "숨이 모이는 중이에요"
          : "오케이, 다음 트릭 준비!";
      const sys = makeMessage({
        roomId,
        nickname: bot,
        text: replyText,
        createdAt: Date.now(),
        kind: "system",
      });
      broadcast(roomState, { kind: "message", message: sys } as unknown as ChatEvent);
    }
  };

  const subscribe = (handler: Listener) => {
    if (!roomState) {
      // connect() 이후에 subscribe()가 호출되는 흐름을 기대하지만, 방어적으로 처리
      listener = handler;
      return () => {
        listener = null;
      };
    }

    listener = handler;
    roomState.listeners.add(handler);

    return () => {
      if (!roomState) return;
      roomState.listeners.delete(handler);
    };
  };

  return {
    connect,
    disconnect,
    sendMessage,
    subscribe,
  };
}

