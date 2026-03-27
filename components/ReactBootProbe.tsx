"use client";

import { useEffect } from "react";

if (typeof window !== "undefined") {
  try {
    (window as typeof window & { __vrReactModuleLoaded?: boolean }).__vrReactModuleLoaded = true;
  } catch {
    /* ignore */
  }
}

export function ReactBootProbe() {
  useEffect(() => {
    try {
      (window as typeof window & { __vrReactProbeMounted?: boolean }).__vrReactProbeMounted = true;
      window.dispatchEvent(
        new CustomEvent("vr-debug-log", {
          detail: { level: "log", scope: "react-probe", message: "ReactBootProbe mounted" },
        })
      );
    } catch {
      /* ignore */
    }
  }, []);
  return null;
}

