/**
 * 디버그 터치/콘솔 모드 (?debugTouch=1 등)
 * DebugConsoleOverlay · useVapeInteraction에서 동일 조건 사용.
 */
export function isDebugTouchMode(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (typeof document !== "undefined" && document.documentElement.getAttribute("data-vr-debug") === "1") {
      return true;
    }
    const href = window.location.href || "";
    if (/[?&](debugTouch|debugConsole)=1(?:&|#|$)/.test(href)) return true;
    if (/(?:^|[?&])(debugTouch|debugConsole)=1(?:&|$)/.test(window.location.search)) return true;
    const hash = window.location.hash || "";
    if (/debug(Console|Touch)/i.test(hash)) return true;
    if (/^#?(dbg|debug)$/i.test(hash.trim())) return true;
    if (window.sessionStorage.getItem("vr_debug_console") === "1") return true;
  } catch {
    return false;
  }
  return false;
}
