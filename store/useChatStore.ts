import { create } from "zustand";
import type { ChatMessage } from "@/types/chat";

type ChatStatus = "disconnected" | "connecting" | "connected";

type ChatStoreState = {
  status: ChatStatus;
  messages: ChatMessage[];
  setStatus: (status: ChatStatus) => void;
  appendMessages: (messages: ChatMessage[]) => void;
  addMessage: (message: ChatMessage) => void;
  clear: () => void;
};

export const useChatStore = create<ChatStoreState>((set) => ({
  status: "disconnected",
  messages: [],
  setStatus: (status) => set({ status }),
  appendMessages: (messages) =>
    set((s) => ({
      messages: [...s.messages, ...messages].slice(-300),
    })),
  addMessage: (message) =>
    set((s) => ({
      messages: [...s.messages, message].slice(-300),
    })),
  clear: () => set({ messages: [], status: "disconnected" }),
}));

