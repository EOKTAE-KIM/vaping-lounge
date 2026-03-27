export type RoomId = "lounge" | "donutPractice" | "turtleChallenge" | "quietRoom";

export type Room = {
  id: RoomId;
  name: string;
  description: string;
};

