"use client";

import { useRouter } from "next/navigation";
import { ROOMS } from "@/data/rooms";
import type { RoomId } from "@/types/room";
import { useUserSessionStore } from "@/store/useUserSessionStore";

export default function RoomsPage() {
  const router = useRouter();
  const roomId = useUserSessionStore((s) => s.roomId);
  const joinRoom = useUserSessionStore((s) => s.joinRoom);

  const onJoin = (id: RoomId) => {
    joinRoom(id);
    router.push("/");
  };

  return (
    <div className="min-h-[100svh] bg-black text-white px-4 py-6">
      <div className="max-w-md mx-auto">
        <div className="text-lg font-semibold">공간 목록</div>
        <div className="text-xs text-white/55 mt-1">하나의 방처럼 들어가서, 숨의 장면을 함께 만들어봐요.</div>

        <div className="mt-4 flex flex-col gap-3">
          {ROOMS.map((r) => {
            const active = r.id === roomId;
            return (
              <div
                key={r.id}
                className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur px-4 py-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-semibold text-white">{r.name}</div>
                    <div className="text-xs text-white/55 mt-1">{r.description}</div>
                  </div>
                  <div className="shrink-0">
                    <div className="text-[11px] text-white/55 text-right">{active ? "현재" : "대기중"}</div>
                  </div>
                </div>
                <button
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => onJoin(r.id)}
                  className={[
                    "mt-3 w-full rounded-xl border px-3 py-2 text-sm font-semibold active:scale-[0.99]",
                    active
                      ? "bg-white/5 border-cyan-400/30 text-cyan-100"
                      : "bg-cyan-400/15 border-cyan-400/30 text-cyan-100",
                  ].join(" ")}
                >
                  {active ? "이미 입장" : "입장하기"}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

