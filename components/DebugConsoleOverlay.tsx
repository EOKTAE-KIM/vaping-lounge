"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { isDebugTouchMode } from "@/utils/isDebugTouchMode";

/** Strict Mode 이중 마운트에서도 부트 로그 1회만 */
let vrDebugBootLogged = false;

function formatArg(a: unknown): string {
  if (typeof a === "string") return a;
  try {
    return JSON.stringify(a);
  } catch {
    return String(a);
  }
}

export function DebugConsoleOverlay() {
  const [lines, setLines] = useState<string[]>([]);
  const [visible, setVisible] = useState(false);
  const [showFab, setShowFab] = useState(false);
  const [portalReady, setPortalReady] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const fabRef = useRef<HTMLButtonElement | null>(null);
  const lastOpenAtRef = useRef(0);

  const append = useCallback((prefix: string, args: unknown[]) => {
    const msg = args.map(formatArg).join(" ");
    const ts = new Date().toISOString().slice(11, 23);
    const line = `${ts} [${prefix}] ${msg}`;
    setLines((prev) => [...prev.slice(-250), line]);
  }, []);

  const openPanel = useCallback(() => {
    const now = Date.now();
    if (now - lastOpenAtRef.current < 380) return;
    lastOpenAtRef.current = now;
    try {
      window.dispatchEvent(new CustomEvent("vr-debug-open"));
    } catch {
      /* ignore */
    }
    setVisible(true);
  }, []);

  const syncDebugFlags = useCallback(() => {
    if (!isDebugTouchMode()) return;
    setShowFab(true);
    setVisible(true);
  }, []);

  useLayoutEffect(() => {
    try {
      (window as typeof window & { __vrReactAlive?: boolean }).__vrReactAlive = true;
      window.dispatchEvent(
        new CustomEvent("vr-debug-log", {
          detail: { level: "log", scope: "react", message: "DebugConsoleOverlay mounted" },
        })
      );
    } catch {
      /* ignore */
    }
    setPortalReady(true);
    setShowFab(true);
    /** 바닐라 폴백 DBG가 먼저 붙었으면 제거 (React 정상 마운트) */
    document.getElementById("vr-debug-fab-fallback")?.remove();
    syncDebugFlags();
    const onOpen = () => setVisible(true);
    const onPageShow = () => syncDebugFlags();
    window.addEventListener("vr-debug-open", onOpen);
    window.addEventListener("pageshow", onPageShow);
    window.addEventListener("hashchange", syncDebugFlags);
    window.addEventListener("popstate", syncDebugFlags);
    return () => {
      window.removeEventListener("vr-debug-open", onOpen);
      window.removeEventListener("pageshow", onPageShow);
      window.removeEventListener("hashchange", syncDebugFlags);
      window.removeEventListener("popstate", syncDebugFlags);
    };
  }, [syncDebugFlags]);

  useEffect(() => {
    const timers: number[] = [];
    const delays = [0, 16, 50, 120, 400, 1200];
    for (const ms of delays) {
      timers.push(
        window.setTimeout(() => {
          syncDebugFlags();
        }, ms)
      );
    }
    return () => timers.forEach((id) => clearTimeout(id));
  }, [syncDebugFlags]);

  useEffect(() => {
    const onForceOpen = () => {
      setShowFab(true);
      setVisible(true);
    };
    window.addEventListener("vr-debug-force-open", onForceOpen);
    return () => window.removeEventListener("vr-debug-force-open", onForceOpen);
  }, []);

  /** 모바일에서 개발자도구 없이도 확인 가능하도록 console.* 를 패널로 미러링 */
  useEffect(() => {
    const original = {
      log: console.log.bind(console),
      info: console.info.bind(console),
      warn: console.warn.bind(console),
      error: console.error.bind(console),
    };

    const forward =
      (level: "log" | "info" | "warn" | "error") =>
      (...args: unknown[]) => {
        append(level, ["[console]", ...args]);
        original[level](...args);
      };

    console.log = forward("log");
    console.info = forward("info");
    console.warn = forward("warn");
    console.error = forward("error");

    append("log", ["[boot] console.* 미러링 활성"]);

    return () => {
      console.log = original.log;
      console.info = original.info;
      console.warn = original.warn;
      console.error = original.error;
    };
  }, [append]);

  /** 패널을 열 때마다 한 줄 남김 — 리스너·상태 파이프라인 확인용 */
  useEffect(() => {
    const onOpen = () => {
      append("log", ["[ui] vr-debug-open · 패널 표시"]);
    };
    window.addEventListener("vr-debug-open", onOpen);
    return () => window.removeEventListener("vr-debug-open", onOpen);
  }, [append]);

  /**
   * 중요: vr-debug-log 수신은 패널 visible과 무관하게 항상 연결.
   * 이전에는 visible일 때만 리스너를 달아 닫힌 상태·초기에는 로그가 절대 안 쌓였음.
   */
  useEffect(() => {
    const onDebugLog = (ev: Event) => {
      const detail = (ev as CustomEvent<{ level?: string; scope?: string; message?: string }>).detail;
      const level = detail?.level ?? "log";
      const scope = detail?.scope ? `[${detail.scope}] ` : "";
      const message = detail?.message ?? "";
      append(level, [`${scope}${message}`]);
    };
    const onWindowError = (ev: ErrorEvent) => {
      append("error", [`[window] ${ev.message}`]);
    };
    const onUnhandledRejection = (ev: PromiseRejectionEvent) => {
      append("error", ["[promise]", String(ev.reason)]);
    };

    window.addEventListener("vr-debug-log", onDebugLog as EventListener);
    window.addEventListener("error", onWindowError);
    window.addEventListener("unhandledrejection", onUnhandledRejection);

    /** 디버그 URL 여부와 무관하게 1회 부트 로그 — “패널에 아무것도 없음” 구분 */
    if (!vrDebugBootLogged) {
      vrDebugBootLogged = true;
      append("log", [
        "[boot] vr-debug-log 수신 대기 중 · 상단 DBG로 패널 열기",
        `href=${typeof window !== "undefined" ? window.location.href : ""}`,
      ]);
      try {
        window.dispatchEvent(
          new CustomEvent("vr-debug-log", {
            detail: { level: "log", scope: "boot", message: "self-test: CustomEvent 파이프 OK" },
          })
        );
      } catch {
        append("error", ["[boot] CustomEvent self-test 실패"]);
      }
    }

    if (isDebugTouchMode()) {
      append("log", [
        "debugTouch/debugConsole 모드: GLOBAL touch 로그 활성",
        `ua=${typeof navigator !== "undefined" ? navigator.userAgent : ""}`,
      ]);
    }

    return () => {
      window.removeEventListener("vr-debug-log", onDebugLog as EventListener);
      window.removeEventListener("error", onWindowError);
      window.removeEventListener("unhandledrejection", onUnhandledRejection);
    };
  }, [append]);

  /** 디버그 모드: 화면 아무 곳이나 탭해도 타겟 태그가 찍혀야 함 (이벤트가 JS까지 오는지) */
  useEffect(() => {
    if (!isDebugTouchMode()) return;
    const fn = (e: TouchEvent) => {
      const t = e.target;
      const el = t instanceof HTMLElement ? t : null;
      const tag = el?.tagName ?? "?";
      const id = el?.id ? `#${el.id}` : "";
      const ds = el?.dataset?.vapeHit ? " [vape-hit]" : "";
      append("log", [`GLOBAL touchstart → ${tag}${id}${ds}`]);
    };
    document.addEventListener("touchstart", fn, { capture: true, passive: true });
    return () => document.removeEventListener("touchstart", fn, { capture: true });
  }, [append]);

  /** 최종 진단: debugTouch 없이도 전역 입력 이벤트 유입 여부를 패널에 직접 표시 */
  useEffect(() => {
    let count = 0;
    const shouldLog = () => {
      count += 1;
      return count <= 40 || count % 20 === 0;
    };
    const targetText = (t: EventTarget | null) => {
      const el = t instanceof HTMLElement ? t : null;
      if (!el) return "?";
      const id = el.id ? `#${el.id}` : "";
      const cls = el.className && typeof el.className === "string" ? `.${el.className.split(" ").filter(Boolean).slice(0, 2).join(".")}` : "";
      return `${el.tagName}${id}${cls}`;
    };
    const onTouchStart = (e: TouchEvent) => {
      if (!shouldLog()) return;
      append("log", [`[global] touchstart -> ${targetText(e.target)}`]);
    };
    const onTouchEnd = (e: TouchEvent) => {
      if (!shouldLog()) return;
      append("log", [`[global] touchend -> ${targetText(e.target)}`]);
    };
    const onClick = (e: MouseEvent) => {
      if (!shouldLog()) return;
      append("log", [`[global] click -> ${targetText(e.target)}`]);
    };
    const onPointerDown = (e: PointerEvent) => {
      if (!shouldLog()) return;
      append("log", [`[global] pointerdown(${e.pointerType}) -> ${targetText(e.target)}`]);
    };
    document.addEventListener("touchstart", onTouchStart, { capture: true, passive: true });
    document.addEventListener("touchend", onTouchEnd, { capture: true, passive: true });
    document.addEventListener("click", onClick, { capture: true, passive: true });
    document.addEventListener("pointerdown", onPointerDown, { capture: true, passive: true });
    append("log", ["[boot] global input probe active"]);
    return () => {
      document.removeEventListener("touchstart", onTouchStart, { capture: true });
      document.removeEventListener("touchend", onTouchEnd, { capture: true });
      document.removeEventListener("click", onClick, { capture: true });
      document.removeEventListener("pointerdown", onPointerDown, { capture: true });
    };
  }, [append]);

  useEffect(() => {
    if (!visible) return;
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [lines, visible]);

  useEffect(() => {
    const el = fabRef.current;
    if (!el || !showFab) return;
    const onTouchEnd = (e: TouchEvent) => {
      if (e.cancelable) e.preventDefault();
      e.stopPropagation();
      openPanel();
    };
    el.addEventListener("touchend", onTouchEnd, { capture: true, passive: false });
    return () => el.removeEventListener("touchend", onTouchEnd, { capture: true });
  }, [showFab, openPanel]);

  if (!portalReady || typeof document === "undefined") return null;

  const fab =
    showFab && (
      <button
        ref={fabRef}
        type="button"
        id="vr-debug-fab"
        className="pointer-events-auto select-none touch-manipulation"
        style={{
          position: "fixed",
          top: "calc(12px + env(safe-area-inset-top, 0px))",
          right: "calc(12px + env(safe-area-inset-right, 0px))",
          left: "auto",
          bottom: "auto",
          zIndex: 999999,
          width: 48,
          height: 48,
          minWidth: 48,
          minHeight: 48,
          borderRadius: 9999,
          border: "2px solid #fff",
          background: "#dc2626",
          color: "#ffffff",
          fontWeight: 800,
          fontSize: 11,
          fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
          WebkitTapHighlightColor: "transparent",
          boxShadow: "0 2px 12px rgba(0,0,0,0.45)",
          visibility: "visible",
          opacity: 1,
          WebkitTransform: "translateZ(0)",
        }}
        aria-label="디버그 콘솔 열기"
        onClick={(e) => {
          e.stopPropagation();
          openPanel();
        }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        DBG
      </button>
    );

  const panel = visible && (
    <div
      className="pointer-events-auto fixed inset-x-0 bottom-0 flex max-h-[min(42vh,320px)] flex-col border-t border-white/25 bg-black/95 font-mono text-[10px] leading-snug text-emerald-300 shadow-[0_-6px_32px_rgba(0,0,0,0.55)]"
      style={{
        zIndex: 999998,
        paddingBottom: "calc(10px + env(safe-area-inset-bottom, 0px))",
        WebkitTransform: "translateZ(0)",
      }}
      aria-hidden
    >
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-white/10 px-2 py-1 text-[9px] text-white/75">
        <span className="min-w-0 truncate">vr-debug-log은 패널 닫혀도 수집됨 · DBG로 패널 열기</span>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            className="rounded bg-white/10 px-2 py-1 text-white active:bg-white/25"
            onClick={() => setLines([])}
          >
            지우기
          </button>
          <button
            type="button"
            className="rounded bg-white/10 px-2 py-1 text-white active:bg-white/25"
            onClick={() => setVisible(false)}
          >
            닫기
          </button>
        </div>
      </div>
      <div
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 py-1"
        style={{ WebkitOverflowScrolling: "touch" }}
      >
        {lines.length === 0 ? (
          <div className="text-white/40">로그 대기 중…</div>
        ) : (
          lines.map((l, i) => (
            <div key={i} className="break-all border-b border-white/5 py-0.5 last:border-0">
              {l}
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );

  return (
    <>
      {showFab && fab && createPortal(fab, document.body)}
      {visible && panel && createPortal(panel, document.body)}
    </>
  );
}
