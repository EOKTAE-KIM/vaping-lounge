"use client";

import { useState } from "react";
import { useProfanityFilter } from "@/hooks/useProfanityFilter";
import { Send } from "lucide-react";

export function ChatInput({ onSend, disabled }: { onSend: (text: string) => Promise<void> | void; disabled?: boolean }) {
  const [text, setText] = useState("");
  const { sanitize } = useProfanityFilter();

  const send = async () => {
    if (disabled) return;
    const cleaned = sanitize(text);
    if (!cleaned) return;
    setText("");
    await onSend(cleaned);
  };

  return (
    <div className="px-3 pb-3">
      <div className="flex gap-2 items-center rounded-2xl border border-white/10 bg-white/5 backdrop-blur px-3 py-2">
        <input
          value={text}
          onPointerDown={(e) => e.stopPropagation()}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              send();
            }
          }}
          disabled={disabled}
          placeholder="한 줄로 숨을 더해요"
          className="flex-1 bg-transparent outline-none text-white placeholder:text-white/35 text-sm"
        />
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={send}
          className="p-2 rounded-xl border border-white/10 bg-cyan-400/10 text-cyan-100 active:scale-[0.98]"
          aria-label="전송"
        >
          <Send size={18} />
        </button>
      </div>
    </div>
  );
}

