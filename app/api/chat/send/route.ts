import { publishMessage, sanitizeRoomId, sanitizeText } from "@/lib/chat/server/chatHub";
import type { ChatMessage } from "@/types/chat";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "invalid json" }), { status: 400 });
  }

  const b = body as { roomId?: string; nickname?: string; text?: string };
  const roomId = sanitizeRoomId(b.roomId ?? null);
  const nickname = (b.nickname ?? "guest").trim().slice(0, 24) || "guest";
  const text = sanitizeText(b.text ?? "", 80);

  if (!roomId) {
    return new Response(JSON.stringify({ error: "invalid roomId" }), { status: 400 });
  }
  if (!text) {
    return new Response(JSON.stringify({ error: "empty text" }), { status: 400 });
  }

  const message: ChatMessage = {
    id:
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    roomId,
    nickname,
    text,
    createdAt: Date.now(),
    kind: "message",
  };

  await publishMessage(roomId, message);

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
