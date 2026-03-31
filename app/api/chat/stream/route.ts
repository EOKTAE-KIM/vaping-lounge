import { readSharedRoomMessages, sanitizeRoomId, subscribeRoom } from "@/lib/chat/server/chatHub";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const roomId = sanitizeRoomId(url.searchParams.get("roomId"));
  const nickname = (url.searchParams.get("nickname") ?? "guest").trim().slice(0, 24) || "guest";

  if (!roomId) {
    return new Response(JSON.stringify({ error: "invalid roomId" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const encoder = new TextEncoder();
  let unsubscribe: (() => void) | null = null;
  let pollTimer: ReturnType<typeof setInterval> | null = null;
  const seenMessageIds = new Set<string>();
  let lastSeenAt = 0;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const push = (line: string) => {
        controller.enqueue(encoder.encode(line));
      };

      push(`: connected ${Date.now()}\n\n`);

      unsubscribe = subscribeRoom(roomId, nickname, push);

      const pushRemoteMessages = async () => {
        try {
          const messages = await readSharedRoomMessages(roomId);
          for (const message of messages) {
            if (message.createdAt < lastSeenAt) continue;
            if (seenMessageIds.has(message.id)) continue;
            seenMessageIds.add(message.id);
            if (message.createdAt > lastSeenAt) lastSeenAt = message.createdAt;
            push(`data: ${JSON.stringify({ kind: "message", message })}\n\n`);
          }
        } catch {
          /* ignore polling errors */
        }
      };

      void pushRemoteMessages();
      pollTimer = setInterval(() => {
        void pushRemoteMessages();
      }, 800);
    },
    cancel() {
      if (pollTimer != null) {
        clearInterval(pollTimer);
        pollTimer = null;
      }
      unsubscribe?.();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
