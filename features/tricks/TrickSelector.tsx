"use client";

import { motion } from "framer-motion";
import type { TrickType } from "@/types/tricks";
import { useHaptics } from "@/hooks/useHaptics";
import { useSettingsStore } from "@/store/useSettingsStore";

type Props = {
  selected: TrickType;
  onChange: (t: TrickType) => void;
  onRun: () => void;
};

const PRESETS: Array<{ type: TrickType; label: string }> = [
  { type: "none", label: "기본" },
  { type: "donut", label: "도넛" },
  { type: "turtle", label: "거북선" },
  { type: "double", label: "더블" },
  { type: "waterfall", label: "폭포" },
  { type: "random", label: "랜덤" },
];

export function TrickSelector({ selected, onChange, onRun }: Props) {
  const hapticsEnabled = useSettingsStore((s) => s.hapticsEnabled);
  const vibrate = useHaptics(hapticsEnabled);

  const run = () => {
    vibrate(12);
    onRun();
  };

  return (
    <div className="w-full">
      <div className="flex items-center justify-between gap-3 mb-3 px-2">
        <div className="text-xs text-white/70 tracking-wide">트릭 모드</div>
        <div className="text-xs text-white/55">{PRESETS.find((p) => p.type === selected)?.label ?? "기본"}</div>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {PRESETS.map((p) => {
          const active = p.type === selected;
          return (
            <button
              key={p.type}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => onChange(p.type)}
              className={[
                "shrink-0 px-3 py-2 rounded-full border backdrop-blur",
                active
                  ? "border-cyan-400/40 bg-cyan-400/10 text-cyan-100"
                  : "border-white/10 bg-white/0 text-white/75",
              ].join(" ")}
              aria-pressed={active}
            >
              <span className="text-xs">{p.label}</span>
            </button>
          );
        })}
      </div>

      <motion.button
        onPointerDown={(e) => e.stopPropagation()}
        onClick={run}
        className="mt-3 w-full rounded-2xl bg-white/6 border border-white/10 px-4 py-3 text-white flex items-center justify-center gap-3 active:scale-[0.99]"
        whileTap={{ scale: 0.98 }}
      >
        <span className="text-sm font-semibold tracking-wide">트릭 실행</span>
        <span className="text-xs text-white/60">↗</span>
      </motion.button>
    </div>
  );
}

