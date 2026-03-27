import { createJSONStorage } from "zustand/middleware";

/** localStorage 접근 실패(비공개 모드·쿼터·정책) 시 메모리로 폴백 — 스토어 초기화 예외로 React 전체가 죽는 것 방지 */
const memory = new Map<string, string>();

/**
 * zustand persist용. SSR에서는 getItem만 null, set/remove는 무시.
 */
export const vapePersistJsonStorage = createJSONStorage(() => ({
  getItem: (name: string) => {
    if (typeof window === "undefined") return null;
    try {
      return window.localStorage.getItem(name);
    } catch {
      return memory.get(name) ?? null;
    }
  },
  setItem: (name: string, value: string) => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(name, value);
    } catch {
      memory.set(name, value);
    }
  },
  removeItem: (name: string) => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.removeItem(name);
    } catch {
      memory.delete(name);
    }
  },
}));
