"use client";

export function useProfanityFilter() {
  // MVP: 실제 비속어 필터는 추후 교체 지점(훅)만 제공
  const sanitize = (text: string) => text.trim();
  return { sanitize };
}

