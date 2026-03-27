"use client";

import { useState } from "react";
import { useUserSessionStore } from "@/store/useUserSessionStore";
import { useSettingsStore } from "@/store/useSettingsStore";

export default function ProfilePage() {
  const nickname = useUserSessionStore((s) => s.nickname);
  const roomId = useUserSessionStore((s) => s.roomId);
  const setNickname = useUserSessionStore((s) => s.setNickname);

  const hapticsEnabled = useSettingsStore((s) => s.hapticsEnabled);
  const setHapticsEnabled = useSettingsStore((s) => s.setHapticsEnabled);
  const soundEnabled = useSettingsStore((s) => s.soundEnabled);
  const setSoundEnabled = useSettingsStore((s) => s.setSoundEnabled);

  const [draft, setDraft] = useState(nickname ?? "");

  return (
    <div className="min-h-[100svh] bg-black text-white px-4 py-6">
      <div className="max-w-md mx-auto">
        <div className="text-lg font-semibold">프로필</div>
        <div className="text-xs text-white/55 mt-1">닉네임/햅틱 같은 로컬 설정만 저장됩니다.</div>

        <div className="mt-5 rounded-2xl border border-white/10 bg-white/5 backdrop-blur px-4 py-4">
          <div className="text-xs text-white/55">현재 공간</div>
          <div className="mt-1 text-sm font-semibold">{roomId}</div>
        </div>

        <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 backdrop-blur px-4 py-4">
          <div className="text-xs text-white/55">닉네임</div>
          <input
            value={draft}
            onPointerDown={(e) => e.stopPropagation()}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={16}
            placeholder="예: 시안도넛"
            className="mt-2 w-full rounded-2xl bg-white/5 border border-white/10 px-4 py-3 outline-none text-white placeholder:text-white/35"
          />
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => setNickname(draft.trim() ? draft.trim() : null)}
            className="mt-3 w-full rounded-2xl bg-cyan-400/15 border border-cyan-400/30 text-cyan-100 py-3 font-semibold active:scale-[0.99]"
          >
            저장
          </button>
        </div>

        <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 backdrop-blur px-4 py-4">
          <div className="text-xs text-white/55">마이크로 인터랙션</div>

          <label className="mt-3 flex items-center justify-between gap-3">
            <span className="text-sm text-white/85">햅틱</span>
            <input
              type="checkbox"
              checked={hapticsEnabled}
              onPointerDown={(e) => e.stopPropagation()}
              onChange={(e) => setHapticsEnabled(e.target.checked)}
            />
          </label>

          <label className="mt-3 flex items-center justify-between gap-3">
            <span className="text-sm text-white/85">사운드(추후)</span>
            <input
              type="checkbox"
              checked={soundEnabled}
              onPointerDown={(e) => e.stopPropagation()}
              onChange={(e) => setSoundEnabled(e.target.checked)}
            />
          </label>
        </div>
      </div>
    </div>
  );
}

