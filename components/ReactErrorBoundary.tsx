"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = { children: ReactNode };

type State = { hasError: boolean; message: string };

/**
 * 페이지 트리(MainScene 등) 렌더 예외 시에도 레이아웃의 DebugConsoleOverlay는 계속 마운트되도록 children만 격리.
 */
export class ReactErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: "" };

  static getDerivedStateFromError(err: Error): State {
    return { hasError: true, message: err?.message ?? String(err) };
  }

  componentDidCatch(err: Error, info: ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error("[ReactErrorBoundary]", err, info.componentStack);
    try {
      window.dispatchEvent(
        new CustomEvent("vr-debug-log", {
          detail: {
            level: "error",
            scope: "boundary",
            message: `React 트리 오류: ${err?.message ?? err} (콘솔 참고)`,
          },
        })
      );
    } catch {
      /* ignore */
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          className="flex min-h-[40vh] flex-col items-center justify-center gap-2 bg-[#2a0a0a] px-4 py-8 text-center text-sm text-red-100"
          role="alert"
        >
          <p className="font-semibold">이 화면 영역에서 React 오류가 났습니다.</p>
          <p className="max-w-md break-words text-xs text-red-200/90">{this.state.message}</p>
          <p className="text-xs text-white/60">상단 DBG / VDBG로 로그를 확인하세요.</p>
        </div>
      );
    }
    return this.props.children;
  }
}
