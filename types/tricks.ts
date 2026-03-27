export type TrickType =
  | "none"
  | "burst"
  | "donut"
  | "turtle"
  | "waterfall"
  | "double"
  | "random";

export type TrickPreset = {
  type: TrickType;
  label: string;
  description: string;
};

