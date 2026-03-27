import type { Room, RoomId } from "@/types/room";

export const ROOMS: Array<Room> = [
  {
    id: "lounge" satisfies RoomId,
    name: "블랙 라운지",
    description: "숨을 고르고, 다음 한 모금을 모아봐요.",
  },
  {
    id: "donutPractice" satisfies RoomId,
    name: "도넛 연습실",
    description: "원형 링이 부드럽게 퍼지도록.",
  },
  {
    id: "turtleChallenge" satisfies RoomId,
    name: "거북선 챌린지룸",
    description: "뭉친 흐름을 앞으로 밀어내는 연습.",
  },
  {
    id: "quietRoom" satisfies RoomId,
    name: "조용한 방",
    description: "짧게, 천천히, 가볍게.",
  },
];

export const DEFAULT_ROOM_ID: RoomId = "lounge";

