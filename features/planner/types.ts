export type TagName = string;
export type TaskColor = "coral" | "violet" | "blue" | "amber" | "green" | "slate";
export type PlanStatus = "draft" | "committed" | "closed";

export type Task = {
  id: string;
  title: string;
  estimate: number;
  tag: TagName;
  color: TaskColor;
  energy: "낮음" | "보통" | "높음";
  isMit: boolean;
  completed: boolean;
};

export type BlockType = "task" | "buffer" | "appointment" | "planning";

export type TimeBlock = {
  id: string;
  taskId?: string;
  title: string;
  start: number;
  duration: number;
  baselineStart?: number;
  baselineDuration?: number;
  changeReasons?: Partial<Record<"created" | "moved" | "resized" | "cancelled", string>>;
  actualMinutes?: number;
  type: BlockType;
  color: Task["color"];
  status: "scheduled" | "running" | "completed";
};

export type MobileView = "tasks" | "schedule" | "review";
