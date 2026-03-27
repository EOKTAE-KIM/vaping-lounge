"use client";

import { motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import { AMBIENT_MESSAGES } from "@/data/ambientMessages";

export function AmbientMessage({ triggerKey }: { triggerKey: string | number | null }) {
  const messages = useMemo(() => AMBIENT_MESSAGES, []);
  // Hydration mismatch 방지를 위해 SSR/초기 렌더에서는 고정 값을 렌더링하고,
  // 마운트 후에만 랜덤 인덱스를 선택합니다.
  const [index, setIndex] = useState(0);
  const lastChangedAtRef = useRef<number>(0);
  const cooldownMs = 9000;

  const rotate = () => {
    const now = Date.now();
    if (now - lastChangedAtRef.current < cooldownMs) return;
    lastChangedAtRef.current = now;
    setIndex((i) => (i + 1 + Math.floor(Math.random() * 2)) % messages.length);
  };

  useEffect(() => {
    // client-side에서만 초기 랜덤 선택
    setIndex(Math.floor(Math.random() * messages.length));
  }, [messages.length]);

  useEffect(() => {
    const t = window.setInterval(() => {
      rotate();
    }, 5200);
    return () => window.clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (triggerKey == null) return;
    rotate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [triggerKey]);

  return (
    <div className="pointer-events-none absolute left-1/2 top-[14vh] -translate-x-1/2 z-10 w-[86%] max-w-[420px]">
      <motion.div
        key={index}
        initial={{ opacity: 0, y: 8, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -6 }}
        transition={{ type: "spring", stiffness: 260, damping: 22 }}
        className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur px-4 py-2.5 text-center"
      >
        <div className="text-xs sm:text-[13px] text-white/85 tracking-wide">{messages[index]}</div>
      </motion.div>
    </div>
  );
}

