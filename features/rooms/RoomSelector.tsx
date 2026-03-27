"use client";

import type { RoomId } from "@/types/room";
import { ROOMS } from "@/data/rooms";

type Props = {
  value: RoomId;
  onChange: (roomId: RoomId) => void;
};

export function RoomSelector({ value, onChange }: Props) {
  return (
    <div className="relative">
      <select
        onPointerDown={(e) => e.stopPropagation()}
        value={value}
        onChange={(e) => onChange(e.target.value as RoomId)}
        className="w-full rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-xs sm:text-[13px] text-white/90 backdrop-blur outline-none"
        aria-label="공간 선택"
      >
        {ROOMS.map((r) => (
          <option key={r.id} value={r.id}>
            {r.name}
          </option>
        ))}
      </select>
    </div>
  );
}

