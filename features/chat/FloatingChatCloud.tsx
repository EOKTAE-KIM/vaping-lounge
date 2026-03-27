"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import type { ChatMessage } from "@/types/chat";

function hashToUnit(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967295;
}

export function FloatingChatCloud({ messages }: { messages: ChatMessage[] }) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 700);
    return () => window.clearInterval(t);
  }, []);

  const visible = useMemo(() => {
    return messages
      .filter((m) => m.kind === "message" && now - m.createdAt <= 12000)
      .slice(-20)
      .map((m) => {
        const u0 = hashToUnit(`${m.id}-x`);
        const u1 = hashToUnit(`${m.id}-y`);
        const u2 = hashToUnit(`${m.id}-dur`);
        return {
          ...m,
          left: 8 + u0 * 84, // vw%
          bottomStart: 8 + u1 * 30, // vh%
          duration: 6.5 + u2 * 3.0,
        };
      });
  }, [messages, now]);

  return (
    <div className="pointer-events-none absolute inset-0 z-[60] overflow-hidden" aria-hidden>
      {visible.map((m) => (
        <motion.div
          key={m.id}
          initial={{ opacity: 0, y: 16, scale: 0.98 }}
          animate={{ opacity: [0, 0.9, 0], y: -160, scale: 1 }}
          transition={{ duration: m.duration, ease: "easeOut" }}
          className="absolute max-w-[68vw] rounded-xl border border-white/15 bg-black/45 px-3 py-1.5 text-xs text-white/95 backdrop-blur-[1px]"
          style={{
            left: `${m.left}%`,
            bottom: `${m.bottomStart}%`,
            transform: "translateX(-50%)",
          }}
        >
          <span className="mr-1 text-[10px] text-cyan-200/90">{m.nickname}:</span>
          <span>{m.text}</span>
        </motion.div>
      ))}
    </div>
  );
}

