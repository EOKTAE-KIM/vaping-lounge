import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { RoomId } from "@/types/room";
import type { UserSession } from "@/types/session";
import { vapePersistJsonStorage } from "@/lib/safeStorage";

const USER_ID_KEY = "vape_session_userId";

function getOrCreateUserId(): string {
  if (typeof window === "undefined") return "server";
  try {
    const existing = window.localStorage.getItem(USER_ID_KEY);
    if (existing) return existing;
    const id =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : String(Date.now());
    window.localStorage.setItem(USER_ID_KEY, id);
    return id;
  } catch {
    return `anon_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  }
}

type UserSessionStore = Pick<UserSession, "nickname" | "roomId" | "joinedAt" | "userId"> & {
  setNickname: (nickname: string | null) => void;
  joinRoom: (roomId: RoomId) => void;
};

export const useUserSessionStore = create<UserSessionStore>()(
  persist(
    (set) => ({
      nickname: null,
      roomId: "lounge",
      joinedAt: Date.now(),
      userId: getOrCreateUserId(),
      setNickname: (nickname) => set({ nickname }),
      joinRoom: (roomId) => {
        set({ roomId, joinedAt: Date.now() });
      },
    }),
    {
      name: "vape_user_session_v1",
      storage: vapePersistJsonStorage,
      partialize: (state) => ({
        nickname: state.nickname,
        roomId: state.roomId,
        userId: state.userId,
      }),
    }
  )
);

