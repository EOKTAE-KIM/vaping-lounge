"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useEffect, useMemo } from "react";
import { X } from "lucide-react";
import type { RoomId } from "@/types/room";
import { useChatStore } from "@/store/useChatStore";
import { useUserSessionStore } from "@/store/useUserSessionStore";
import { useUIStore } from "@/store/useUIStore";
import { useChatRoom } from "@/hooks/useChatRoom";
import { ChatMessageList } from "@/features/chat/ChatMessageList";
import { ChatInput } from "@/features/chat/ChatInput";
import { NicknameModal } from "@/features/chat/NicknameModal";

export function ChatSheet({ roomId, open }: { roomId: RoomId; open: boolean }) {
  const setChatOpen = useUIStore((s) => s.setChatOpen);
  const nickname = useUserSessionStore((s) => s.nickname);
  const messages = useChatStore((s) => s.messages);

  const { sendMessage } = useChatRoom({
    roomId,
    enabled: open,
  });

  const reducedMotion = useReducedMotion();
  const canClose = open;

  const onClose = () => {
    if (!canClose) return;
    setChatOpen(false);
  };

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const title = useMemo(() => "실시간 채팅", []);

  return (
    <>
      <NicknameModal
        open={open && !nickname}
        initialValue={nickname}
        onSubmit={(next) => useUserSessionStore.getState().setNickname(next)}
      />

      <AnimatePresence>
        {open && (
          <motion.div
            className="fixed inset-0 z-[55]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onPointerDown={(e) => {
              // 시트 밖 배경 탭 -> 닫기
              if (e.target === e.currentTarget) onClose();
            }}
          >
            <motion.div
              className="absolute left-0 right-0 bottom-0 rounded-t-3xl border border-white/10 bg-black/85 backdrop-blur overflow-hidden"
              initial={{ y: "105%" }}
              animate={{ y: 0 }}
              exit={{ y: "105%" }}
              transition={{ type: "spring", stiffness: 260, damping: 28 }}
              drag={reducedMotion ? false : "y"}
              dragConstraints={{ top: 0, bottom: 180 }}
              onDragEnd={(e, info) => {
                if (info.point.y > 110) onClose();
              }}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-4 pt-4 pb-2">
                <div>
                  <div className="text-sm font-semibold text-white">{title}</div>
                  <div className="text-[11px] text-white/55 mt-1">
                    한 손으로, 짧게, 몰입
                  </div>
                </div>
                <button
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={onClose}
                  className="p-2 rounded-xl border border-white/10 bg-white/5 active:scale-[0.98]"
                  aria-label="채팅 닫기"
                >
                  <X size={18} className="text-white/70" />
                </button>
              </div>

              <div className="flex flex-col h-[48vh] max-h-[420px]">
                <ChatMessageList messages={messages} myNickname={nickname} />
                <ChatInput
                  disabled={!nickname}
                  onSend={async (text) => {
                    await sendMessage(text);
                    // 전송 후 입력창 상태는 ChatInput 내부에서 처리
                  }}
                />
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

