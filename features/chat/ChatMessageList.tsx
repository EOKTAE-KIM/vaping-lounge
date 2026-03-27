"use client";

import { useEffect, useRef } from "react";
import { formatClockTime } from "@/lib/time";
import type { ChatMessage } from "@/types/chat";

export function ChatMessageList({
  messages,
  myNickname,
}: {
  messages: ChatMessage[];
  myNickname: string | null;
}) {
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length]);

  return (
    <div className="flex-1 overflow-y-auto px-3 py-3">
      {messages.length === 0 ? (
        <div className="text-center text-white/50 text-xs py-10">아직 메시지가 없어요. 한 번 숨을 불러봐요.</div>
      ) : (
        <div className="flex flex-col gap-2">
          {messages.map((m) => {
            const isMine = myNickname && m.nickname === myNickname;
            if (m.kind === "system") {
              return (
                <div key={m.id} className="flex justify-center">
                  <div className="text-[11px] text-white/55 bg-white/5 border border-white/10 px-3 py-1 rounded-full">
                    {m.text}
                  </div>
                </div>
              );
            }

            return (
              <div key={m.id} className={isMine ? "flex justify-end" : "flex justify-start"}>
                <div className={isMine ? "max-w-[78%]" : "max-w-[82%]"}>
                  <div
                    className={[
                      "px-3 py-2 rounded-2xl border backdrop-blur",
                      isMine
                        ? "bg-cyan-400/10 border-cyan-200/25 text-white"
                        : "bg-white/5 border-white/10 text-white/90",
                    ].join(" ")}
                  >
                    <div className="text-[12px] leading-5 break-words">{m.text}</div>
                    <div className="text-[10px] text-white/45 mt-1 text-right">{formatClockTime(m.createdAt)}</div>
                  </div>
                </div>
              </div>
            );
          })}
          <div ref={endRef} />
        </div>
      )}
    </div>
  );
}

