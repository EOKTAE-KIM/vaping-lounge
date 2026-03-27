import { create } from "zustand";
import type { RoomId } from "@/types/room";
import type { SmokeAction } from "@/types/smoke";
import { getTodayKey } from "@/lib/date";
import { safeJsonParse } from "@/lib/storage";

type UsageState = {
  mySmokeActionsToday: number;
  lastUsageKey: string | null;
  incrementMySmokeActionsToday: (args: { roomId: RoomId; userId: string }) => void;
  resetIfDateChanged: (args: { roomId: RoomId; userId: string }) => void;
  // Hook point: 이후 서버/소켓 기반으로 교체 가능하도록 smokeAction을 추적
  recordSmokeAction: (action: SmokeAction) => void;
};

function usageKey(roomId: RoomId, userId: string) {
  return `vape_usage_my_${userId}_${roomId}_${getTodayKey()}`;
}

export const useUsageStore = create<UsageState>((set, get) => ({
  mySmokeActionsToday: 0,
  lastUsageKey: null,
  resetIfDateChanged: ({ roomId, userId }) => {
    const key = usageKey(roomId, userId);
    const existingKey = get().lastUsageKey;
    if (existingKey === key) return;

    // 오늘이 바뀌었거나(키 변경) 최초 진입인 경우 초기화/로드
    let loaded = 0;
    if (typeof window !== "undefined") {
      try {
        const raw = window.localStorage.getItem(key);
        const parsed = safeJsonParse<number>(raw);
        loaded = typeof parsed === "number" ? parsed : 0;
      } catch {
        loaded = 0;
      }
    }

    set({ mySmokeActionsToday: loaded, lastUsageKey: key });
  },
  incrementMySmokeActionsToday: ({ roomId, userId }) => {
    const key = usageKey(roomId, userId);
    set((s) => {
      const next = s.mySmokeActionsToday + 1;
      if (typeof window !== "undefined") {
        try {
          window.localStorage.setItem(key, JSON.stringify(next));
        } catch {
          /* 저장 불가 시에도 인메모리 카운트는 유지 */
        }
      }
      return { mySmokeActionsToday: next, lastUsageKey: key };
    });
  },
  recordSmokeAction: (_action) => {
    // MVP에서는 incrementMySmokeActionsToday로 카운트를 갱신한다.
    void _action;
  },
}));

