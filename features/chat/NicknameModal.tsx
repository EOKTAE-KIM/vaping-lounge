"use client";

import { useState } from "react";
import { motion } from "framer-motion";

export function NicknameModal({
  open,
  initialValue,
  onSubmit,
}: {
  open: boolean;
  initialValue?: string | null;
  onSubmit: (nickname: string) => void;
}) {
  const [value, setValue] = useState(initialValue ?? "");

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/65 backdrop-blur">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 16 }}
        transition={{ type: "spring", stiffness: 260, damping: 24 }}
        className="w-full rounded-t-3xl border border-white/10 bg-black/80 px-4 pb-5 pt-4"
      >
        <div className="flex items-center justify-between">
          <div>
            <div className="text-white font-semibold">닉네임으로 입장</div>
            <div className="text-xs text-white/55 mt-1">MVP에서는 익명 닉네임만 사용해요.</div>
          </div>
        </div>

        <div className="mt-4">
          <input
            value={value}
            onPointerDown={(e) => e.stopPropagation()}
            onChange={(e) => setValue(e.target.value)}
            maxLength={16}
            placeholder="예: 시안도넛"
            className="w-full rounded-2xl bg-white/5 border border-white/10 px-4 py-3 outline-none text-white placeholder:text-white/35"
          />
          <div className="mt-3 text-[11px] text-white/55">입장 후에는 변경 없이 사용됩니다.</div>
        </div>

        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => {
            const next = value.trim();
            if (!next) return;
            onSubmit(next);
          }}
          className="mt-4 w-full rounded-2xl bg-cyan-400/15 border border-cyan-400/30 text-cyan-100 py-3 font-semibold active:scale-[0.99]"
        >
          입장하기
        </button>
      </motion.div>
    </div>
  );
}

