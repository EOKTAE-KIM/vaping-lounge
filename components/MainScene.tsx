"use client";

import { useEffect, useRef, useState } from "react";
import { useUserSessionStore } from "@/store/useUserSessionStore";
import { useUIStore } from "@/store/useUIStore";
import { useUsageStore } from "@/store/useUsageStore";
import { useRoomStatsStore } from "@/store/useRoomStatsStore";
import { useSettingsStore } from "@/store/useSettingsStore";
import { useHaptics } from "@/hooks/useHaptics";
import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";
import { VapeDevice } from "@/features/vape/VapeDevice";
import { AmbientSmokeCanvas } from "@/features/smoke/AmbientSmokeCanvas";
import { InteractionSmokeCanvas } from "@/features/smoke/InteractionSmokeCanvas";
import { usePressInteractionStore } from "@/store/usePressInteractionStore";
import { usePressInteraction } from "@/hooks/usePressInteraction";
import { useChatStore } from "@/store/useChatStore";
import { useChatRoom } from "@/hooks/useChatRoom";
import { FloatingChatCloud } from "@/features/chat/FloatingChatCloud";

const DEFAULT_VAPE_IMAGE = "/eezys.png";
const VAPE_IMAGE_STORAGE_KEY = "vape_image_src_v1";
const VAPE_IMAGE_1 = "/1.png";
const VAPE_IMAGE_2 = "/2.png";
const VAPE_IMAGE_3 = "/3.png";
const VAPE_IMAGE_4 = "/4.png";

export function MainScene() {
  const roomId = useUserSessionStore((s) => s.roomId);
  const userId = useUserSessionStore((s) => s.userId);

  const selectedTrick = useUIStore((s) => s.selectedTrick);
  // (대시보드/팝업 패널 주석 처리) 채팅/트릭 UI 관련 state는 더 이상 사용하지 않는다

  const incrementMy = useUsageStore((s) => s.incrementMySmokeActionsToday);
  const resetUsage = useUsageStore((s) => s.resetIfDateChanged);

  const setRoomStats = useRoomStatsStore((s) => s.setStats);

  const hapticsEnabled = useSettingsStore((s) => s.hapticsEnabled);
  const vibrate = useHaptics(hapticsEnabled);

  const prefersReducedMotion = usePrefersReducedMotion();
  const [lowPower, setLowPower] = useState(false);
  const [vapeImageSrc, setVapeImageSrc] = useState(DEFAULT_VAPE_IMAGE);
  const [pickerOpen, setPickerOpen] = useState(false);

  const isPressing = usePressInteractionStore((s) => s.isPressing);
  const smokeMode = usePressInteractionStore((s) => s.smokeMode);
  const smokeIntensity = usePressInteractionStore((s) => s.smokeIntensity);
  const emitter = usePressInteractionStore((s) => s.emitter);
  const messages = useChatStore((s) => s.messages);
  const nickname = useUserSessionStore((s) => s.nickname);
  const [chatText, setChatText] = useState("");
  const [isLocked, setIsLocked] = useState(false);
  const [lockUntil, setLockUntil] = useState(0);
  const [nowMs, setNowMs] = useState(0);
  const lockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fallbackNickname = `억돌이${(userId.length % 5) + 1}`;

  const { sendMessage } = useChatRoom({
    roomId,
    enabled: true,
    nicknameOverride: nickname ?? fallbackNickname,
  });

  useEffect(() => {
    resetUsage({ roomId, userId });
  }, [roomId, userId, resetUsage]);

  useEffect(() => {
    const apply = () => {
      const mem = (navigator as unknown as { deviceMemory?: number }).deviceMemory;
      const isLow = typeof mem === "number" ? mem <= 2 : false;
      setLowPower(Boolean(prefersReducedMotion || isLow));
    };
    apply();
  }, [prefersReducedMotion]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const saved = window.localStorage.getItem(VAPE_IMAGE_STORAGE_KEY);
      if (saved) setVapeImageSrc(saved);
    } catch {
      /* ignore */
    }
  }, []);

  const applyVapeImage = (src: string) => {
    setVapeImageSrc(src);
    try {
      if (typeof window !== "undefined") {
        window.localStorage.setItem(VAPE_IMAGE_STORAGE_KEY, src);
      }
    } catch {
      /* ignore */
    }
  };

  const vapeOptions = [
    { id: "v1", src: VAPE_IMAGE_1, label: "이지스", glowA: "255, 173, 92", glowB: "255, 92, 170", imageScale: 1.0 },
    { id: "v2", src: VAPE_IMAGE_2, label: "부푸", glowA: "120, 220, 255", glowB: "80, 130, 255", imageScale: 1.4 },
    { id: "v3", src: VAPE_IMAGE_3, label: "말론", glowA: "162, 255, 118", glowB: "72, 216, 138", imageScale: 1.08 },
    { id: "v4", src: VAPE_IMAGE_4, label: "일회용", glowA: "255, 120, 245", glowB: "170, 92, 255", imageScale: 1.16 },
  ] as const;
  const selectedVapeOption = vapeOptions.find((v) => v.src === vapeImageSrc) ?? vapeOptions[0];

  useEffect(() => {
    if (typeof window === "undefined") return;
    // 선택 패널 열기 전에 썸네일/원본 이미지를 미리 로드
    for (const opt of vapeOptions) {
      const img = new Image();
      img.src = opt.src;
    }
  }, []);

  const applyStatsForMyAction = (incrementTotalBy: number) => {
    incrementMy({ roomId, userId });
    const nextMy = useUsageStore.getState().mySmokeActionsToday;
    const currentRoomStats = useRoomStatsStore.getState();
    setRoomStats({
      roomId,
      onlineCount: currentRoomStats.onlineCount,
      totalSmokeActionsToday: currentRoomStats.totalSmokeActionsToday + incrementTotalBy,
      mySmokeActionsToday: nextMy,
    });
  };

  const onPressCountOnce = (mode: "normal" | "donut" | "dragon") => {
    vibrate(mode === "normal" ? [8, 20, 10] : [12, 26, 10]);
    applyStatsForMyAction(1);
  };

  const { onPressStart, onPressEnd, onLongPress } = usePressInteraction(
    selectedTrick,
    onPressCountOnce,
    () => {
      if (lockTimerRef.current != null) {
        clearTimeout(lockTimerRef.current);
      }
      const nextLockUntil = Date.now() + 5000;
      setLockUntil(nextLockUntil);
      setNowMs(Date.now());
      setIsLocked(true);
      lockTimerRef.current = setTimeout(() => {
        setIsLocked(false);
        setLockUntil(0);
        lockTimerRef.current = null;
      }, 5000);
    }
  );

  useEffect(() => {
    if (!isLocked) return;
    const tick = window.setInterval(() => {
      setNowMs(Date.now());
    }, 120);
    return () => window.clearInterval(tick);
  }, [isLocked]);

  useEffect(() => {
    return () => {
      if (lockTimerRef.current != null) {
        clearTimeout(lockTimerRef.current);
        lockTimerRef.current = null;
      }
    };
  }, []);

  const handlePressStart: typeof onPressStart = (payload, modeOverride) => {
    if (isLocked) return;
    onPressStart(payload, modeOverride);
  };

  const handlePressEnd = () => {
    if (isLocked) return;
    onPressEnd();
  };

  const handleLongPress = () => {
    if (isLocked) return;
    onLongPress();
  };

  const sendChat = async () => {
    const text = chatText.trim();
    if (!text) return;
    await sendMessage(text.slice(0, 80));
    setChatText("");
  };

  return (
    <div
      className="fixed inset-0 overflow-hidden bg-black"
      role="application"
      aria-label="전자담배 테마 라운지"
    >
      <button
        data-ui-control="1"
        type="button"
        className="pointer-events-auto fixed z-[1001] select-none rounded-full border border-[#8ba2d5]/60 bg-gradient-to-r from-[#0b1a3a] via-[#0d2148] to-[#102a5c] px-4 py-2 text-[11px] font-extrabold tracking-[0.08em] text-white shadow-[0_6px_20px_rgba(16,42,92,0.55)] transition active:scale-[0.97]"
        style={{
          right: "calc(12px + env(safe-area-inset-right, 0px))",
          top: "calc(12px + env(safe-area-inset-top, 0px))",
          WebkitTapHighlightColor: "transparent",
        }}
        onClick={() => setPickerOpen((v) => !v)}
      >
        전담선택
      </button>
      {pickerOpen && (
        <div
          data-ui-control="1"
          className="pointer-events-auto fixed z-[1001] w-[min(240px,calc(100vw-24px))] rounded-md border border-white/20 bg-black/90 p-2 text-xs text-white shadow-lg"
          style={{
            right: "calc(12px + env(safe-area-inset-right, 0px))",
            top: "calc(60px + env(safe-area-inset-top, 0px))",
          }}
        >
          <div className="mb-2 font-semibold">담배 이미지 선택</div>
          <div className="grid grid-cols-2 gap-2">
            {vapeOptions.map((opt) => (
              <button
                key={opt.id}
                type="button"
                className={`overflow-hidden rounded border ${
                  vapeImageSrc === opt.src ? "border-rose-400" : "border-white/25"
                }`}
                onClick={() => {
                  applyVapeImage(opt.src);
                  setPickerOpen(false);
                }}
              >
                <img
                  src={opt.src}
                  alt={opt.label}
                  className="h-16 w-full bg-black/40 object-contain p-1"
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).src = DEFAULT_VAPE_IMAGE;
                  }}
                />
                <div className="bg-black/70 py-1 text-[10px]">{opt.label}</div>
              </button>
            ))}
          </div>
        </div>
      )}
      <AmbientSmokeCanvas
        lowPower={lowPower}
        pressing={isPressing}
        intensity={smokeIntensity}
        emitter={emitter}
        smokeMode={smokeMode}
      />
      <InteractionSmokeCanvas
        pressing={isPressing}
        smokeMode={smokeMode}
        intensity={smokeIntensity}
        emitter={emitter}
        lowPower={lowPower}
      />
      <FloatingChatCloud messages={messages} />
      {/* WebKit: 부모 pointer-events-none이면 자식 터치가 먹지 않는 사례가 있어 auto 사용 (빈 영역은 아래 레이어로 통과하지 않음) */}
      <div
        className={`pointer-events-auto absolute inset-0 z-[120] isolate flex items-center justify-center px-4 transition ${
          isLocked ? "opacity-55 saturate-50" : "opacity-100"
        }`}
      >
        <VapeDevice
          glow={smokeMode === "normal" ? 0.35 + smokeIntensity * 0.55 : 0.45 + smokeIntensity * 0.6}
          disabled={isLocked}
          isPressing={isPressing}
          smokeMode={smokeMode}
          imageSrc={vapeImageSrc}
          imageScale={selectedVapeOption.imageScale}
          glowColorA={selectedVapeOption.glowA}
          glowColorB={selectedVapeOption.glowB}
          onPressStart={handlePressStart}
          onPressEnd={handlePressEnd}
          onLongPress={handleLongPress}
        />
      </div>
      {isLocked && (
        <div className="pointer-events-none absolute inset-0 z-[130] flex items-start justify-center pt-[13vh]">
          <div className="px-2 py-1 text-center text-white">
            <div className="text-sm font-semibold tracking-[0.08em] drop-shadow-[0_2px_8px_rgba(0,0,0,0.85)]">과열 쿨타임</div>
            <div className="text-xl font-extrabold text-amber-300">
              {Math.max(0, Math.ceil((lockUntil - nowMs) / 1000))}초
            </div>
          </div>
        </div>
      )}
      <div
        data-ui-control="1"
        className="pointer-events-auto absolute z-[1001] flex items-center gap-2 rounded-2xl border border-white/20 bg-black/70 px-3 py-2"
        style={{
          left: "max(12px, env(safe-area-inset-left, 0px))",
          right: "max(12px, env(safe-area-inset-right, 0px))",
          maxWidth: 680,
          marginInline: "auto",
          bottom: "calc(12px + env(safe-area-inset-bottom, 0px))",
        }}
      >
        <input
          value={chatText}
          onChange={(e) => setChatText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              sendChat();
            }
          }}
          placeholder="채팅을 입력하면 배경에 떠올라요"
          className="min-w-0 flex-1 bg-transparent text-[16px] leading-6 text-white outline-none placeholder:text-white/45"
        />
        <button
          type="button"
          className="rounded-lg border border-white/25 bg-white/10 px-3 py-2 text-sm text-white"
          onClick={sendChat}
        >
          전송
        </button>
      </div>

    </div>
  );
}

