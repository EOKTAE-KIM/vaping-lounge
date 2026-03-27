import { create } from "zustand";
import { persist } from "zustand/middleware";
import { vapePersistJsonStorage } from "@/lib/safeStorage";

type SettingsState = {
  soundEnabled: boolean;
  hapticsEnabled: boolean;
  setSoundEnabled: (value: boolean) => void;
  setHapticsEnabled: (value: boolean) => void;
};

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      soundEnabled: false,
      hapticsEnabled: true,
      setSoundEnabled: (soundEnabled) => set({ soundEnabled }),
      setHapticsEnabled: (hapticsEnabled) => set({ hapticsEnabled }),
    }),
    { name: "vape_settings_v1", storage: vapePersistJsonStorage }
  )
);

