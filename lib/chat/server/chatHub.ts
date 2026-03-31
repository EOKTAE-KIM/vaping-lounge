import type { ChatEvent } from "@/types/chat";
import type { ChatMessage } from "@/types/chat";
import type { RoomId } from "@/types/room";
import { getCloudflareContext } from "@opennextjs/cloudflare";

const ALLOWED_ROOMS = new Set<RoomId>(["lounge", "donutPractice", "turtleChallenge", "quietRoom"]);

type PushFn = (sseLine: string) => void;

type RoomState = {
  clients: Map<string, PushFn>; // connection id
};

const rooms = new Map<RoomId, RoomState>();
const CHAT_KV_KEY_PREFIX = "chat-room-log:";
const CHAT_KV_TTL_SECONDS = 60 * 60 * 24;
const CHAT_KV_MAX_MESSAGES = 120;

function newId(): string {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function encodeEvent(event: ChatEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

function getChatKv(): KVNamespace | null {
  try {
    const ctx = getCloudflareContext();
    const kv = (ctx.env as CloudflareEnv & { CHAT_KV?: KVNamespace }).CHAT_KV;
    return kv ?? null;
  } catch {
    return null;
  }
}

const roomLogKey = (roomId: RoomId) => `${CHAT_KV_KEY_PREFIX}${roomId}`;

type RoomLogPayload = {
  messages: ChatMessage[];
};

async function appendMessageToSharedLog(roomId: RoomId, message: ChatMessage) {
  const kv = getChatKv();
  if (!kv) return;
  const key = roomLogKey(roomId);

  // KV는 원자적 append가 없어 latest 상태를 읽고 덮어쓰는 방식으로 유지한다.
  const raw = await kv.get(key);
  const parsed = raw ? (JSON.parse(raw) as RoomLogPayload) : { messages: [] };
  const next = [...parsed.messages.filter((m) => m.id !== message.id), message].slice(-CHAT_KV_MAX_MESSAGES);
  await kv.put(key, JSON.stringify({ messages: next }), { expirationTtl: CHAT_KV_TTL_SECONDS });
}

export async function readSharedRoomMessages(roomId: RoomId): Promise<ChatMessage[]> {
  const kv = getChatKv();
  if (!kv) return [];
  const raw = await kv.get(roomLogKey(roomId));
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as RoomLogPayload;
    return Array.isArray(parsed.messages) ? parsed.messages : [];
  } catch {
    return [];
  }
}

function broadcastToRoom(roomId: RoomId, event: ChatEvent) {
  const room = rooms.get(roomId);
  if (!room) return;
  const line = encodeEvent(event);
  for (const push of room.clients.values()) {
    try {
      push(line);
    } catch {
      /* ignore */
    }
  }
}

function broadcastPresence(roomId: RoomId) {
  const room = rooms.get(roomId);
  const onlineCount = room?.clients.size ?? 0;
  broadcastToRoom(roomId, { kind: "presence", roomId, onlineCount });
}

export function subscribeRoom(
  roomId: RoomId,
  nickname: string,
  push: PushFn
): () => void {
  const id = newId();
  let room = rooms.get(roomId);
  if (!room) {
    room = { clients: new Map() };
    rooms.set(roomId, room);
  }
  room.clients.set(id, push);

  const joinMsg: ChatMessage = {
    id: newId(),
    roomId,
    nickname,
    text: `${nickname}님이 입장했어요`,
    createdAt: Date.now(),
    kind: "system",
  };
  broadcastToRoom(roomId, { kind: "message", message: joinMsg });
  broadcastPresence(roomId);

  return () => {
    const r = rooms.get(roomId);
    if (!r) return;
    r.clients.delete(id);
    if (r.clients.size === 0) {
      rooms.delete(roomId);
    } else {
      const leaveMsg: ChatMessage = {
        id: newId(),
        roomId,
        nickname,
        text: `${nickname}님이 나갔어요`,
        createdAt: Date.now(),
        kind: "system",
      };
      broadcastToRoom(roomId, { kind: "message", message: leaveMsg });
      broadcastPresence(roomId);
    }
  };
}

export async function publishMessage(roomId: RoomId, message: ChatMessage) {
  await appendMessageToSharedLog(roomId, message);
  broadcastToRoom(roomId, { kind: "message", message });
}

export function sanitizeRoomId(raw: string | null): RoomId | null {
  if (!raw || typeof raw !== "string") return null;
  const s = raw.trim().slice(0, 64);
  if (!ALLOWED_ROOMS.has(s as RoomId)) return null;
  return s as RoomId;
}

export function sanitizeText(raw: string, max = 200): string {
  return raw.replace(/\s+/g, " ").trim().slice(0, max);
}
