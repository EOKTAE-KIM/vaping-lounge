"use client";

export default function AboutPage() {
  return (
    <div className="min-h-[100svh] bg-black text-white px-4 py-6">
      <div className="max-w-md mx-auto">
        <div className="text-lg font-semibold">소개</div>
        <div className="text-xs text-white/55 mt-1">
          전자담배 테마의 “방”에 들어온 것 같은 몰입형 장면을, 모바일에서 한 손으로 즐길 수 있도록 설계됐습니다.
        </div>

        <div className="mt-5 space-y-3 text-sm text-white/85">
          <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur px-4 py-4">
            <div className="font-semibold">장면 중심 인터랙션</div>
            <div className="text-xs text-white/55 mt-1">
              중앙 오브젝트를 탭/길게/스와이프로 연기 흐름을 만들고, 트릭 모드 버튼으로 패턴 애니메이션을 실행합니다.
            </div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur px-4 py-4">
            <div className="font-semibold">실시간 채팅 레이어</div>
            <div className="text-xs text-white/55 mt-1">
              화면 바깥 배경 영역을 탭하면 bottom sheet 형태로 채팅이 열립니다. ESC/드래그로 닫을 수 있어 메인 인터랙션을 유지합니다.
            </div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur px-4 py-4">
            <div className="font-semibold">교체 가능한 실시간 provider</div>
            <div className="text-xs text-white/55 mt-1">
              MVP는 Mock provider로 동작하지만, 이후 Firebase/Supabase/Socket 서버 클라이언트로 교체할 수 있게 추상화되어 있습니다.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

