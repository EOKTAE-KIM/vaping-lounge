import { subscribeRoom, sanitizeRoomId } from "@/lib/chat/server/chatHub";

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

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const push = (line: string) => {
        controller.enqueue(encoder.encode(line));
      };

      push(`: connected ${Date.now()}\n\n`);

      unsubscribe = subscribeRoom(roomId, nickname, push);
    },
    cancel() {
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
