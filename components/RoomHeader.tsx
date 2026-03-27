"use client";

import { useEffect, useMemo, useState } from "react";
import { ROOMS } from "@/data/rooms";
import { useUserSessionStore } from "@/store/useUserSessionStore";
import { formatElapsedSeconds } from "@/lib/time";
import { RoomSelector } from "@/features/rooms/RoomSelector";
import type { RoomId } from "@/types/room";

export function RoomHeader() {
  const roomId = useUserSessionStore((s) => s.roomId);
  const joinedAt = useUserSessionStore((s) => s.joinedAt);
  const joinRoom = useUserSessionStore((s) => s.joinRoom);

  const room = useMemo(() => ROOMS.find((r) => r.id === roomId), [roomId]);

  const [elapsedText, setElapsedText] = useState("0s");
  useEffect(() => {
    const tick = () => {
      const seconds = (Date.now() - joinedAt) / 1000;
      setElapsedText(formatElapsedSeconds(seconds));
    };
    tick();
    const t = window.setInterval(tick, 900);
    return () => window.clearInterval(t);
  }, [joinedAt]);

  const onChangeRoom = (nextId: RoomId) => {
    joinRoom(nextId);
  };

  return (
    <div
      className="absolute top-0 left-0 right-0 z-[85] px-4 pt-4"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs text-white/65 tracking-wide">현재 공간</div>
            <div className="text-base font-semibold text-white truncate">{room?.name ?? "라운지"}</div>
          </div>
          <div className="text-right">
            <div className="text-[11px] text-white/55">접속 시간</div>
            <div className="text-sm font-semibold text-cyan-100">{elapsedText}</div>
          </div>
        </div>

        <div className="mt-2">
          <RoomSelector value={roomId} onChange={onChangeRoom} />
        </div>
      </div>
    </div>
  );
}

