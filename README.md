## Vape Lounge (전자담배 테마 실시간 인터랙티브 커뮤니티)

모바일 웹에서 “전자담배 방”에 들어온 것 같은 몰입형 장면을 제공하는 Next.js(App Router) 프로젝트입니다. 중앙의 전자담배 오브젝트를 탭/길게/스와이프로 상호작용하면 연기 파티클이 반응하고, 화면 바깥 영역 탭으로 실시간 채팅 bottom sheet가 열립니다.

## 기술 스택

- Next.js (App Router) + TypeScript
- Tailwind CSS (v4)
- Zustand (상태 관리)
- framer-motion (모달/시트/전환 애니메이션)
- lucide-react (아이콘)
- Canvas 기반 파티클 연기 엔진 (`SmokeCanvas`)

## 폴더 구조

- `app/`: 라우트
  - `/`: 메인 인터랙션 (`MainScene`)
  - `/rooms`: 공간 목록
  - `/profile`: 닉네임/설정
  - `/about`: 서비스 소개
- `components/`: 공용 UI (예: `RoomHeader`, `StatusFooter`, `AmbientMessage`, `MainScene`)
- `features/`: 도메인 단위 기능
  - `vape/`: `VapeDevice`
  - `smoke/`: `SmokeCanvas`
  - `tricks/`: `TrickSelector`
  - `chat/`: 채팅 bottom sheet 및 서브 컴포넌트
  - `rooms/`: `RoomSelector`
- `hooks/`: 재사용 훅
  - `useChatRoom`: provider 추상화 기반 채팅 연결/구독
  - `useHaptics`, `usePrefersReducedMotion`, `useProfanityFilter`
- `store/`: Zustand store 분리
  - `useUserSessionStore`, `useUIStore`, `useSmokeStore`, `useChatStore`, `useRoomStatsStore`, `useUsageStore`, `useSettingsStore`
- `types/`: 타입 계약(연기/채팅/방/세션/provider)
- `data/`: 더미 데이터(방 목록, 감성 문구)
- `lib/`: 유틸/추상화
  - `lib/chat/`: 채팅 provider 추상화/팩토리
  - `lib/storage`, `lib/time`, `lib/date`

## 실행 방법

```bash
npm install
npm run dev
```

브라우저에서 `http://localhost:3000` 접속 후 모바일 화면 비율에서 터치/스와이프를 테스트해보세요.

## 실시간 채팅 연동 방법 (추상화 + provider 교체)

### 핵심 계약

- `types/chatProvider.ts`의 `ChatRealtimeClient` 인터페이스를 구현합니다.
- UI는 `hooks/useChatRoom.ts`에서만 provider를 호출합니다.

### 현재 동작 방식 (MVP)

- `lib/chat/providers/mockChatProvider.ts`(Mock provider)로 동작합니다.
- `ChatSheet`가 열리면(`open=true`) `useChatRoom`이 connect/subscribe를 수행하고, 이벤트를 `useChatStore`, `useRoomStatsStore`로 반영합니다.

### 추후 Firebase/Supabase/Socket으로 교체

1. provider 파일(예: `lib/chat/providers/firebaseChatProvider.ts`)을 추가하고 인터페이스를 구현합니다.
2. `lib/chat/chatClientFactory.ts`에서 `NEXT_PUBLIC_CHAT_PROVIDER` 값에 따라 해당 provider를 반환하도록 연결합니다.
3. UI(`ChatSheet`, `ChatMessageList`, `ChatInput`)는 그대로 유지됩니다.

## 환경 변수

- `NEXT_PUBLIC_CHAT_PROVIDER`
  - 기본값: `mock`
  - 예: `mock` / `firebase` / `supabase` / `socket` (구현 추가 시)

## 추후 확장 포인트

- 비속어 필터/차단: `hooks/useProfanityFilter.ts`를 실제 로직으로 확장
- 신고/차단: `ChatSheet`/provider 레이어에 이벤트 훅 포인트 추가
- 연기 프리셋 고도화: `SmokeCanvas`의 timeline stage를 trick별로 확장
- 방/유저 시스템: provider 교체로 서버 상태 동기화 강화

## 성능 최적화 포인트

- 연기 렌더는 DOM이 아니라 `canvas`에 `requestAnimationFrame`으로 그립니다.
- `SmokeCanvas`는 `deviceMemory`와 `prefers-reduced-motion`을 기반으로 `lowPower` 모드를 켜서 파티클 수/blur 강도를 줄입니다.
- 채팅 연결은 bottom sheet가 열릴 때만 수행(`enabled: open`)합니다.
