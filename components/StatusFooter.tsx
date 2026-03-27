"use client";

import { useUIStore } from "@/store/useUIStore";
import { useRoomStatsStore } from "@/store/useRoomStatsStore";
import { AMBIENT_MESSAGES } from "@/data/ambientMessages";
import { useUsageStore } from "@/store/useUsageStore";
import { usePressInteractionStore } from "@/store/usePressInteractionStore";

const TRICK_LABEL: Record<string, string> = {
  none: "기본",
  burst: "버스트",
  donut: "도넛",
  turtle: "거북선",
  waterfall: "폭포",
  double: "더블",
  random: "랜덤",
};

export function StatusFooter() {
  const selectedTrick = useUIStore((s) => s.selectedTrick);
  const onlineCount = useRoomStatsStore((s) => s.onlineCount);
  const totalSmokeActionsToday = useRoomStatsStore((s) => s.totalSmokeActionsToday);
  const mySmokeActionsToday = useUsageStore((s) => s.mySmokeActionsToday);
  const isPressing = usePressInteractionStore((s) => s.isPressing);
  const smokeMode = usePressInteractionStore((s) => s.smokeMode);

  // 너무 자주 바뀌지 않는 한 줄 상태
  const statusText = isPressing
    ? smokeMode === "donut"
      ? "도넛 트릭 실행 중"
      : smokeMode === "dragon"
        ? "용 연기 트릭 실행 중"
        : "일반 연기"
    : AMBIENT_MESSAGES[0];

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-[85] px-4 pb-4"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex-1">
            <div className="text-[11px] text-white/55">상태</div>
            <div className="text-xs text-white/85">{statusText}</div>
          </div>
          <div className="text-right">
            <div className="text-[11px] text-white/55">트릭 모드</div>
            <div className="text-sm font-semibold text-cyan-100">{TRICK_LABEL[selectedTrick] ?? "랜덤"}</div>
          </div>
        </div>

        <div className="mt-2 grid grid-cols-3 gap-2">
          <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2">
            <div className="text-[11px] text-white/55">접속</div>
            <div className="text-sm font-semibold text-white">{onlineCount}</div>
          </div>
          <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2">
            <div className="text-[11px] text-white/55">오늘 총</div>
            <div className="text-sm font-semibold text-white">{totalSmokeActionsToday}</div>
          </div>
          <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2">
            <div className="text-[11px] text-white/55">내 액션</div>
            <div className="text-sm font-semibold text-white">{mySmokeActionsToday}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

